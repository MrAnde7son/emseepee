
import type {
  ToolPolicyConfig,
  PolicyRule,
  PolicyRuleCondition,
  PolicyOperation,
} from "./config.js";
import { getPolicyRules } from "./config.js";
import { logger } from "./logger.js";

export type DecisionValue = "allow" | "deny";

export interface PolicyDecision {
  decision: DecisionValue;
  reason: string;
  // Operations that were performed during evaluation
  operations?: PolicyOperation[];
  // Callback information if callback operation was triggered
  callbackInfo?: {
    url?: string;
    handler?: string;
    method?: string;
  };
}

export interface PolicyInput {
  tool: ToolPolicyConfig;
  agentId: string;
  agentRole: string;
  env: string;
  args: Record<string, unknown>;
}

/**
 * Check if a condition matches the input
 */
function matchesCondition(
  condition: PolicyRuleCondition,
  input: PolicyInput
): boolean {
  const { tool, agentRole, env, args } = input;

  // Check tool name
  if (condition.toolName !== undefined) {
    const toolNames = Array.isArray(condition.toolName)
      ? condition.toolName
      : [condition.toolName];
    if (!toolNames.includes(tool.name)) {
      return false;
    }
  }

  // Check category
  if (condition.category !== undefined) {
    const categories = Array.isArray(condition.category)
      ? condition.category
      : [condition.category];
    if (!categories.includes(tool.category)) {
      return false;
    }
  }

  // Check agent role
  if (condition.agentRole !== undefined) {
    const roles = Array.isArray(condition.agentRole)
      ? condition.agentRole
      : [condition.agentRole];
    if (!roles.includes(agentRole)) {
      return false;
    }
  }

  // Check environment
  if (condition.env !== undefined) {
    const envs = Array.isArray(condition.env) ? condition.env : [condition.env];
    if (!envs.includes(env)) {
      return false;
    }
  }

  // Check sensitivity
  if (condition.sensitivity !== undefined) {
    const sensitivities = Array.isArray(condition.sensitivity)
      ? condition.sensitivity
      : [condition.sensitivity];
    if (!sensitivities.includes(tool.sensitivity)) {
      return false;
    }
  }

  // Check argument values
  if (condition.args !== undefined) {
    for (const [key, value] of Object.entries(condition.args)) {
      if (args[key] !== value) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Execute a callback operation (async)
 */
async function executeCallback(
  action: { callbackUrl?: string; callbackHandler?: string; callbackMethod?: string },
  input: PolicyInput
): Promise<void> {
  if (action.callbackUrl) {
    const method = action.callbackMethod || "POST";
    try {
      const response = await fetch(action.callbackUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tool: input.tool.name,
          agentId: input.agentId,
          agentRole: input.agentRole,
          env: input.env,
          args: input.args,
        }),
      });
      logger.info(`[POLICY] Callback executed: ${action.callbackUrl}`, {
        status: response.status,
      });
    } catch (error) {
      logger.error(`[POLICY] Callback failed: ${action.callbackUrl}`, error);
    }
  } else if (action.callbackHandler) {
    // Future: support custom handler functions
    logger.warn(`[POLICY] Custom handler '${action.callbackHandler}' not yet implemented`);
  }
}

/**
 * Configurable policy engine that evaluates rules from config.json
 */
export async function evaluatePolicy(input: PolicyInput): Promise<PolicyDecision> {
  const { tool, agentRole, env } = input;
  const policyRules = await getPolicyRules();

  // Sort rules by priority (lower priority first, undefined = 0)
  const sortedRules = [...policyRules].sort((a, b) => {
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    return priorityA - priorityB;
  });

  const operations: PolicyOperation[] = [];
  let callbackInfo: PolicyDecision["callbackInfo"] | undefined;

  // Evaluate rules in order
  for (const rule of sortedRules) {
    if (matchesCondition(rule.condition, input)) {
      const { action } = rule;

      // Execute log operation
      if (action.operation === "log") {
        operations.push("log");
        logger.info(
          `[POLICY] Rule '${rule.name}': ${action.logMessage || rule.description || "Logging request"}`,
          {
            tool: tool.name,
            agentRole,
            env,
            rule: rule.name,
          }
        );
      }

      // Execute callback operation
      if (action.operation === "callback") {
        operations.push("callback");
        callbackInfo = {
          url: action.callbackUrl,
          handler: action.callbackHandler,
          method: action.callbackMethod,
        };
        // Execute callback asynchronously (don't wait for it)
        executeCallback(action, input).catch((err) => {
          logger.error(`[POLICY] Callback execution error for rule '${rule.name}'`, err);
        });
      }

      // Execute block operation
      if (action.operation === "block") {
        operations.push("block");
        return {
          decision: "deny",
          reason: action.blockMessage || rule.description || `Blocked by rule '${rule.name}'`,
          operations,
        };
      }

      // Execute allow operation
      if (action.operation === "allow") {
        operations.push("allow");
        // If stopOnMatch is true, return immediately
        if (rule.stopOnMatch !== false) {
          return {
            decision: "allow",
            reason: rule.description || `Allowed by rule '${rule.name}'`,
            operations,
            callbackInfo,
          };
        }
        // Otherwise continue evaluating (allow can be combined with log/callback)
      }

      // If stopOnMatch is true and we haven't returned yet, stop evaluation
      if (rule.stopOnMatch === true && action.operation !== "allow") {
        break;
      }
    }
  }

  // If no rules matched, apply default policy (backward compatibility)
  // Default policy: check allowedRoles first
  if (operations.length === 0 || (!operations.includes("allow") && !operations.includes("block"))) {
    // Check if role is allowed (this is always checked as a baseline)
    if (!tool.allowedRoles.includes(agentRole)) {
      return {
        decision: "deny",
        reason: `Role '${agentRole}' is not allowed to use tool '${tool.name}'`,
        operations: ["block"],
      };
    }

    // Default policy: high-sensitivity tools in prod require admin
    if (env === "prod" && tool.sensitivity === "high" && agentRole !== "admin") {
      return {
        decision: "deny",
        reason: "High-sensitivity tool is restricted to admin role in prod",
        operations: ["block"],
      };
    }

    // If we have operations from rules but no explicit allow/block, apply default allow
    if (operations.length > 0) {
      return {
        decision: "allow",
        reason: "Allowed by default policy after rule evaluation",
        operations: [...operations, "allow"],
        callbackInfo,
      };
    }

    return {
      decision: "allow",
      reason: "Allowed by default policy",
      operations: ["allow"],
    };
  }

  // If we have operations but no explicit allow/block, default to allow
  const hasBlock = operations.includes("block");
  const hasAllow = operations.includes("allow");

  if (hasBlock) {
    return {
      decision: "deny",
      reason: "Blocked by policy rule",
      operations,
      callbackInfo,
    };
  }

  return {
    decision: hasAllow ? "allow" : "allow", // Default to allow if no block
    reason: "Allowed by policy rules",
    operations,
    callbackInfo,
  };
}
