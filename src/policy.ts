
import type { ToolPolicyConfig } from "./config.js";

export type DecisionValue = "allow" | "deny";

export interface PolicyDecision {
  decision: DecisionValue;
  reason: string;
}

export interface PolicyInput {
  tool: ToolPolicyConfig;
  agentId: string;
  agentRole: string;
  env: string;
  args: Record<string, unknown>;
}

/**
 * Very simple POC policy engine.
 *
 * Rules:
 *  - Agent role must be in tool.allowedRoles.
 *  - In prod, high-sensitivity tools are restricted to 'admin' role.
 *  - Otherwise, allow.
 */
export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const { tool, agentRole, env } = input;

  if (!tool.allowedRoles.includes(agentRole)) {
    return {
      decision: "deny",
      reason: `Role '${agentRole}' is not allowed to use tool '${tool.name}'`,
    };
  }

  if (env === "prod" && tool.sensitivity === "high" && agentRole !== "admin") {
    return {
      decision: "deny",
      reason: "High-sensitivity tool is restricted to admin role in prod",
    };
  }

  return {
    decision: "allow",
    reason: "Allowed by default policy",
  };
}
