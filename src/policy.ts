
import type {
  ToolPolicyConfig,
  PolicyRule,
  PolicyRuleCondition,
  PolicyOperation,
} from "./config.js";
import { getPolicyRules } from "./config.js";
import { logger } from "./logger.js";
import { createContext, runInContext } from "vm";
import type { AgentIntent } from "./intent/index.js";

export type DecisionValue = "allow" | "deny";

export interface PolicyDecision {
  decision: DecisionValue;
  reason: string;
  // Operations that were performed during evaluation
  operations?: PolicyOperation[];
  // Webhook information if webhook operation was triggered
  webhookInfo?: {
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
  // Optional: include intent for enhanced policy evaluation
  intent?: AgentIntent;
  // Optional: provider ID for provider-scoped policies
  providerId?: string;
  tenantId?: string;
  client?: {
    id: string;
    name?: string;
    domain?: string;
    uri?: string;
    logoUri?: string;
  };
}

/**
 * Check if a condition matches the input
 * Now also considers intent information if available
 */
function matchesCondition(
  condition: PolicyRuleCondition,
  input: PolicyInput
): boolean {
  const { tool, agentId, agentRole, env, args, intent, providerId } = input;

  // Check tool name
  if (condition.toolName !== undefined) {
    const toolNames = Array.isArray(condition.toolName)
      ? condition.toolName
      : [condition.toolName];
    const matches = toolNames.some((pattern) => {
      // Support pattern matching: if pattern contains '*', treat as wildcard
      if (pattern.includes('*')) {
        // Convert wildcard pattern to regex
        const regexPattern = pattern
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
          .replace(/\*/g, '.*'); // Convert * to .*
        const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case-insensitive
        return regex.test(tool.name);
      }
      // Support exact match or substring match (case-insensitive)
      const patternLower = pattern.toLowerCase();
      const toolNameLower = tool.name.toLowerCase();
      return patternLower === toolNameLower || toolNameLower.includes(patternLower);
    });
    if (!matches) {
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

  // Check agent ID
  if (condition.agentId !== undefined) {
    const agentIds = Array.isArray(condition.agentId)
      ? condition.agentId
      : [condition.agentId];
    if (!agentIds.includes(agentId)) {
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
      const argValue = args[key];
      // Support exact match or substring match for strings (case-insensitive)
      if (typeof value === "string" && typeof argValue === "string") {
        const valueLower = value.toLowerCase();
        const argValueLower = argValue.toLowerCase();
        if (valueLower !== argValueLower && !argValueLower.includes(valueLower)) {
          return false;
        }
      } else if (argValue !== value) {
        // For non-strings, use exact match
        return false;
      }
    }
  }

  // Check provider ID
  if (condition.providerId !== undefined && providerId !== undefined) {
    const providerIds = Array.isArray(condition.providerId)
      ? condition.providerId
      : [condition.providerId];
    if (!providerIds.includes(providerId)) {
      return false;
    }
  }

  // TODO: Add intent-based condition matching
  // For example, check intent.inferredIntent.operation, riskLevel, resources, etc.
  // This allows policies to reason about "delete operations on production resources"
  // rather than just tool names and arguments

  return true;
}

/**
 * Execute a webhook operation (async)
 */
async function executeWebhook(
  action: { webhookUrl?: string; webhookHandler?: string; webhookMethod?: string },
  input: PolicyInput
): Promise<void> {
  if (action.webhookUrl) {
    const method = action.webhookMethod || "POST";
    try {
      const webhookPayload: Record<string, unknown> = {
        tool: input.tool.name,
        agentId: input.agentId,
        agentRole: input.agentRole,
        env: input.env,
        args: input.args,
      };
      
      // Include intent information if available
      if (input.intent) {
        webhookPayload.intent = {
          operation: input.intent.inferredIntent.operation,
          action: input.intent.inferredIntent.action,
          resources: input.intent.inferredIntent.resources,
          riskLevel: input.intent.inferredIntent.riskLevel,
          confidence: input.intent.inferredIntent.confidence,
        };
      }
      
      const response = await fetch(action.webhookUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(webhookPayload),
      });
      logger.info(`[POLICY] Webhook executed: ${action.webhookUrl}`, {
        status: response.status,
      });
    } catch (error) {
      logger.error(`[POLICY] Webhook failed: ${action.webhookUrl}`, error);
    }
  } else if (action.webhookHandler) {
    // Future: support custom handler functions
    logger.warn(`[POLICY] Custom handler '${action.webhookHandler}' not yet implemented`);
  }
}

/**
 * Execute custom code operation
 * The code runs in a sandboxed VM context with access to policy input
 * The code can return a decision object, set result, or throw an error to block
 * 
 * Available in custom code:
 * - tool: ToolPolicyConfig
 * - agentId: string
 * - agentRole: string
 * - env: string
 * - args: Record<string, unknown>
 * - log(message: string, data?: Record<string, unknown>): void
 * - result: PolicyDecision | null (set this to return a decision)
 * 
 * Example:
 *   if (args.path && args.path.includes('/etc/')) {
 *     result = { decision: 'deny', reason: 'Blocked sensitive path', operations: ['custom'] };
 *   }
 */
function executeCustomCode(
  code: string,
  input: PolicyInput,
  ruleName: string
): PolicyDecision | null {
  try {
    // Create a sandboxed context with access to policy input
    const sandbox = {
      // Policy input context
      tool: input.tool,
      agentId: input.agentId,
      agentRole: input.agentRole,
      env: input.env,
      args: input.args,
      // Helper functions available to custom code
      log: (message: string, data?: Record<string, unknown>) => {
        logger.info(`[POLICY] Custom code (${ruleName}): ${message}`, data);
      },
      // Return value will be captured - code can set this
      result: null as PolicyDecision | null,
    };

    // Wrap the code to capture return value or result assignment
    // If code returns a value, assign it to result
    // Otherwise, code can directly set result
    const wrappedCode = `
      (function() {
        const returnValue = (function() {
          ${code}
        })();
        // If code returned a value, use it as result
        if (returnValue !== undefined) {
          result = returnValue;
        }
      })();
    `;

    // Create VM context
    const context = createContext(sandbox);
    
    // Execute the code
    runInContext(wrappedCode, context, {
      timeout: 5000, // 5 second timeout
      displayErrors: true,
    });

    // Check if code set a result
    if (sandbox.result) {
      return sandbox.result;
    }

    // If no result was set, log and continue
    logger.info(`[POLICY] Custom code executed for rule '${ruleName}' (no decision returned)`);
    return null;
  } catch (error) {
    // If code throws an error, treat it as a block
    logger.error(`[POLICY] Custom code error in rule '${ruleName}'`, error);
    
    // Extract error message - handle both Error objects and other error types
    let errorMessage = "Custom code execution failed";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (error && typeof error === "object" && "message" in error) {
      errorMessage = String(error.message);
    }
    
    return {
      decision: "deny",
      reason: errorMessage,
      operations: ["custom"],
    };
  }
}

/**
 * Configurable policy engine that evaluates rules from config.json
 * Now supports intent-based evaluation when AgentIntent is provided
 */
export async function evaluatePolicy(input: PolicyInput): Promise<PolicyDecision> {
  const { tool, agentRole, env, intent } = input;
  
  // Log intent information if available
  if (intent) {
    logger.info(`[POLICY] Evaluating with intent: ${intent.inferredIntent.action} (${intent.inferredIntent.operation}, risk: ${intent.inferredIntent.riskLevel})`, {
      tool: tool.name,
      agentId: intent.agentId,
      resources: intent.inferredIntent.resources,
    });
  }

  if (input.client) {
    const blockedClientIds = (process.env.BLOCKED_CLIENT_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (blockedClientIds.includes(input.client.id)) {
      return {
        decision: "deny",
        reason: `Blocked client ${input.client.id} by configuration`,
      };
    }

    const allowedClientDomains = (process.env.ALLOWED_CLIENT_DOMAINS || "")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean);
    if (allowedClientDomains.length > 0) {
      if (!input.client.domain || !allowedClientDomains.includes(input.client.domain)) {
        return {
          decision: "deny",
          reason: "Client domain not allowed",
        };
      }
    }
  }
  const policyRules = await getPolicyRules(input.tenantId);

  // Filter out archived policies
  const activeRules = policyRules.filter((rule) => !rule.archived);

  // Sort rules by priority (lower priority first, undefined = 0)
  const sortedRules = [...activeRules].sort((a, b) => {
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    return priorityA - priorityB;
  });

  const operations: PolicyOperation[] = [];
  let webhookInfo: PolicyDecision["webhookInfo"] | undefined;

  // Evaluate rules in order
  for (const rule of sortedRules) {
    if (matchesCondition(rule.condition, input)) {
      const { action } = rule;

      // Execute log operation
      if (action.operation === "log") {
        operations.push("log");
        logger.info(
          `[POLICY] Rule '${rule.name}': ${action.message || rule.description || "Logging request"}`,
          {
            tool: tool.name,
            agentRole,
            env,
            rule: rule.name,
          }
        );
      }

      // Execute webhook operation
      if (action.operation === "webhook") {
        operations.push("webhook");
        webhookInfo = {
          url: action.webhookUrl,
          handler: action.webhookHandler,
          method: action.webhookMethod,
        };
        // Execute webhook asynchronously (don't wait for it)
        executeWebhook(action, input).catch((err) => {
          logger.error(`[POLICY] Webhook execution error for rule '${rule.name}'`, err);
        });
      }

      // Execute block operation
      if (action.operation === "block") {
        operations.push("block");
        return {
          decision: "deny",
          reason: action.message || rule.description || `Blocked by rule '${rule.name}'`,
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
            webhookInfo,
          };
        }
        // Otherwise continue evaluating (allow can be combined with log/webhook)
      }

      // Execute custom code operation
      if (action.operation === "custom" && action.customCode) {
        operations.push("custom");
        const customDecision = executeCustomCode(action.customCode, input, rule.name);
        
        // If custom code returned a decision, use it
        if (customDecision) {
          // Merge operations from custom decision with existing operations
          const mergedOperations = [...operations, ...(customDecision.operations || [])];
          
          // If stopOnMatch is true, return immediately
          if (rule.stopOnMatch !== false) {
            return {
              ...customDecision,
              operations: mergedOperations,
              webhookInfo,
            };
          }
          
          // If custom code decided to block, return immediately regardless of stopOnMatch
          if (customDecision.decision === "deny") {
            return {
              ...customDecision,
              operations: mergedOperations,
              webhookInfo,
            };
          }
        }
      }

      // If stopOnMatch is true and we haven't returned yet, stop evaluation
      if (rule.stopOnMatch === true && action.operation !== "allow" && action.operation !== "custom") {
        break;
      }
    }
  }

  // If no rules matched, apply default policy (backward compatibility)
  // Default policy: check allowedRoles first
  if (operations.length === 0 || (!operations.includes("allow") && !operations.includes("block"))) {
    // Check if role is allowed (this is always checked as a baseline)
    // If allowedRoles is empty, allow all roles by default
    if (tool.allowedRoles.length > 0 && !tool.allowedRoles.includes(agentRole)) {
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
    
    // Intent-based policy: high-risk operations in prod require admin
    if (intent && env === "prod" && intent.inferredIntent.riskLevel === "high" && agentRole !== "admin") {
      return {
        decision: "deny",
        reason: `High-risk operation '${intent.inferredIntent.action}' is restricted to admin role in prod`,
        operations: ["block"],
      };
    }
    
    // Intent-based policy: delete operations require extra caution
    if (intent && intent.inferredIntent.operation === "delete" && intent.inferredIntent.riskLevel === "high") {
      // Could require approval or additional checks here
      logger.warn(`[POLICY] High-risk delete operation detected: ${intent.inferredIntent.action}`, {
        resources: intent.inferredIntent.resources,
      });
    }

    // If we have operations from rules but no explicit allow/block, apply default allow
    if (operations.length > 0) {
      return {
        decision: "allow",
        reason: "Allowed by default policy after rule evaluation",
        operations: [...operations, "allow"],
        webhookInfo,
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
      webhookInfo,
    };
  }

  return {
    decision: hasAllow ? "allow" : "allow", // Default to allow if no block
    reason: "Allowed by policy rules",
    operations,
    webhookInfo,
  };
}
