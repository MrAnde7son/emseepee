import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluatePolicy, type PolicyDecision } from "../src/policy.js";
import type { PolicyRule, ToolPolicyConfig } from "../src/config.js";
import * as configModule from "../src/config.js";

describe("Policy Evaluation", () => {
  const mockTool: ToolPolicyConfig = {
    name: "test_tool",
    description: "Test tool",
    allowedRoles: ["coder_bot", "admin"],
    sensitivity: "medium",
    category: "file",
  };

  const defaultAgentContext = {
    agentId: "test-agent",
    agentRole: "coder_bot",
    env: "dev",
  };

  beforeEach(() => {
    // Reset policy rules before each test
    vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([]);
  });

  describe("Default Policy (no rules)", () => {
    it("should allow access when role is in allowedRoles", async () => {
      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("allow");
      expect(decision.reason).toContain("default policy");
    });

    it("should deny access when role is not in allowedRoles", async () => {
      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "unauthorized_role",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toContain("not allowed");
    });

    it("should deny high-sensitivity tools in prod for non-admin roles", async () => {
      const highSensitivityTool: ToolPolicyConfig = {
        ...mockTool,
        sensitivity: "high",
      };

      const decision = await evaluatePolicy({
        tool: highSensitivityTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: "prod",
        args: {},
      });

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toContain("High-sensitivity tool is restricted");
    });

    it("should allow high-sensitivity tools in prod for admin role", async () => {
      const highSensitivityTool: ToolPolicyConfig = {
        ...mockTool,
        sensitivity: "high",
      };

      const decision = await evaluatePolicy({
        tool: highSensitivityTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "admin",
        env: "prod",
        args: {},
      });

      expect(decision.decision).toBe("allow");
    });

    it("should allow high-sensitivity tools in dev for non-admin roles", async () => {
      const highSensitivityTool: ToolPolicyConfig = {
        ...mockTool,
        sensitivity: "high",
      };

      const decision = await evaluatePolicy({
        tool: highSensitivityTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: "dev",
        args: {},
      });

      expect(decision.decision).toBe("allow");
    });
  });

  describe("Policy Rules - Block Operation", () => {
    it("should block when rule matches and action is block", async () => {
      const rule: PolicyRule = {
        name: "block_test",
        description: "Block test tool",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "block",
          message: "Tool is blocked",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toBe("Tool is blocked");
      expect(decision.operations).toContain("block");
    });

    it("should block based on category condition", async () => {
      const rule: PolicyRule = {
        name: "block_file_tools",
        priority: 10,
        condition: {
          category: "file",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
    });

    it("should block based on environment condition", async () => {
      const rule: PolicyRule = {
        name: "block_in_prod",
        priority: 10,
        condition: {
          env: "prod",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: "prod",
        args: {},
      });

      expect(decision.decision).toBe("deny");
    });

    it("should block based on sensitivity condition", async () => {
      const highSensitivityTool: ToolPolicyConfig = {
        ...mockTool,
        sensitivity: "high",
      };

      const rule: PolicyRule = {
        name: "block_high_sensitivity",
        priority: 10,
        condition: {
          sensitivity: "high",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: highSensitivityTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
    });

    it("should block based on agent role condition", async () => {
      const rule: PolicyRule = {
        name: "block_coder_bot",
        priority: 10,
        condition: {
          agentRole: "coder_bot",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
    });

    it("should block based on argument values", async () => {
      const rule: PolicyRule = {
        name: "block_specific_path",
        priority: 10,
        condition: {
          args: {
            path: "/etc/passwd",
          },
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: { path: "/etc/passwd" },
      });

      expect(decision.decision).toBe("deny");
    });

    it("should not block when condition does not match", async () => {
      const rule: PolicyRule = {
        name: "block_other_tool",
        priority: 10,
        condition: {
          toolName: "other_tool",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("allow");
    });
  });

  describe("Policy Rules - Allow Operation", () => {
    it("should allow when rule matches and action is allow", async () => {
      const rule: PolicyRule = {
        name: "allow_test",
        description: "Allow test tool",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "allow",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("allow");
      expect(decision.operations).toContain("allow");
    });

    it("should stop evaluation when stopOnMatch is true", async () => {
      const allowRule: PolicyRule = {
        name: "allow_first",
        priority: 5,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "allow",
        },
        stopOnMatch: true,
      };

      const blockRule: PolicyRule = {
        name: "block_second",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([allowRule, blockRule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("allow");
    });
  });

  describe("Policy Rules - Log Operation", () => {
    it("should log when rule matches and action is log", async () => {
      const rule: PolicyRule = {
        name: "log_test",
        description: "Log test tool usage",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "log",
          message: "Test tool was used",
        },
        stopOnMatch: false,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.operations).toContain("log");
      expect(decision.decision).toBe("allow"); // Log doesn't block
    });
  });

  describe("Policy Rules - Priority", () => {
    it("should evaluate rules in priority order (lower first)", async () => {
      const lowPriorityRule: PolicyRule = {
        name: "low_priority",
        priority: 5,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      const highPriorityRule: PolicyRule = {
        name: "high_priority",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "allow",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([highPriorityRule, lowPriorityRule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      // Lower priority (5) should be evaluated first, so block should win
      expect(decision.decision).toBe("deny");
    });

    it("should treat undefined priority as 0", async () => {
      const ruleWithoutPriority: PolicyRule = {
        name: "no_priority",
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      const ruleWithPriority: PolicyRule = {
        name: "with_priority",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "allow",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([ruleWithPriority, ruleWithoutPriority]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      // Rule without priority (treated as 0) should be evaluated first
      expect(decision.decision).toBe("deny");
    });
  });

  describe("Policy Rules - Array Conditions", () => {
    it("should match when tool name is in array", async () => {
      const rule: PolicyRule = {
        name: "block_multiple_tools",
        priority: 10,
        condition: {
          toolName: ["test_tool", "other_tool"],
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
    });

    it("should match when category is in array", async () => {
      const rule: PolicyRule = {
        name: "block_multiple_categories",
        priority: 10,
        condition: {
          category: ["file", "browser"],
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
    });

    it("should match when agent role is in array", async () => {
      const rule: PolicyRule = {
        name: "block_multiple_roles",
        priority: 10,
        condition: {
          agentRole: ["coder_bot", "research_bot"],
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
    });
  });

  describe("Policy Rules - Combined Operations", () => {
    it("should combine log and allow operations", async () => {
      const rule: PolicyRule = {
        name: "log_and_allow",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "log",
          message: "Logging tool usage",
        },
        stopOnMatch: false,
      };

      const allowRule: PolicyRule = {
        name: "allow_rule",
        priority: 15,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "allow",
        },
        stopOnMatch: false,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule, allowRule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.operations).toContain("log");
      expect(decision.operations).toContain("allow");
      expect(decision.decision).toBe("allow");
    });
  });

  describe("Policy Rules - Custom Code Operation", () => {
    it("should execute custom code that blocks based on args", async () => {
      const rule: PolicyRule = {
        name: "custom_block_path",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "custom",
          customCode: `
            if (args.path && args.path.includes('/etc/')) {
              result = {
                decision: 'deny',
                reason: 'Blocked sensitive path',
                operations: ['custom']
              };
            }
          `,
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: { path: "/etc/passwd" },
      });

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toBe("Blocked sensitive path");
      expect(decision.operations).toContain("custom");
    });

    it("should execute custom code that allows based on condition", async () => {
      const rule: PolicyRule = {
        name: "custom_allow",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "custom",
          customCode: `
            if (agentRole === 'admin' || env === 'dev') {
              result = {
                decision: 'allow',
                reason: 'Allowed by custom rule',
                operations: ['custom']
              };
            }
          `,
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "admin",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("allow");
      expect(decision.reason).toBe("Allowed by custom rule");
      expect(decision.operations).toContain("custom");
    });

    it("should execute custom code that logs and continues", async () => {
      const rule: PolicyRule = {
        name: "custom_log",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "custom",
          customCode: `
            log('Custom check executed', { tool: tool.name, agentRole });
            // No result set, so evaluation continues
          `,
        },
        stopOnMatch: false,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.operations).toContain("custom");
      // Should continue to default policy
      expect(decision.decision).toBe("allow");
    });

    it("should handle custom code that returns a value", async () => {
      const rule: PolicyRule = {
        name: "custom_return",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "custom",
          customCode: `
            return {
              decision: 'deny',
              reason: 'Blocked by return statement',
              operations: ['custom']
            };
          `,
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toBe("Blocked by return statement");
    });

    it("should block when custom code throws an error", async () => {
      const rule: PolicyRule = {
        name: "custom_error",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "custom",
          customCode: `
            throw new Error('Custom validation failed');
          `,
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      expect(decision.decision).toBe("deny");
      expect(decision.reason).toBe("Custom validation failed");
      expect(decision.operations).toContain("custom");
    });

    it("should handle custom code with complex logic", async () => {
      const rule: PolicyRule = {
        name: "custom_complex",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "custom",
          customCode: `
            const sensitivePaths = ['/etc/', '/sys/', '/proc/'];
            const path = args.path || '';
            const isSensitive = sensitivePaths.some(sp => path.includes(sp));
            
            if (isSensitive && env === 'prod' && agentRole !== 'admin') {
              result = {
                decision: 'deny',
                reason: 'Sensitive path access requires admin in prod',
                operations: ['custom']
              };
            } else if (isSensitive) {
              log('Sensitive path accessed', { path, agentRole, env });
            }
          `,
        },
        stopOnMatch: false,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([rule]);

      // Test blocking case
      const blockDecision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: "prod",
        args: { path: "/etc/passwd" },
      });

      expect(blockDecision.decision).toBe("deny");
      expect(blockDecision.reason).toBe("Sensitive path access requires admin in prod");

      // Test logging case (dev environment)
      const logDecision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: "dev",
        args: { path: "/etc/passwd" },
      });

      expect(logDecision.operations).toContain("custom");
      expect(logDecision.decision).toBe("allow");
    });

    it("should respect stopOnMatch for custom code", async () => {
      const customRule: PolicyRule = {
        name: "custom_stop",
        priority: 5,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "custom",
          customCode: `
            result = {
              decision: 'allow',
              reason: 'Allowed by custom code',
              operations: ['custom']
            };
          `,
        },
        stopOnMatch: true,
      };

      const blockRule: PolicyRule = {
        name: "block_after",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "block",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([customRule, blockRule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      // Should stop at custom rule and not reach block rule
      expect(decision.decision).toBe("allow");
      expect(decision.reason).toBe("Allowed by custom code");
    });

    it("should always block immediately when custom code returns deny", async () => {
      const customRule: PolicyRule = {
        name: "custom_block",
        priority: 10,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "custom",
          customCode: `
            result = {
              decision: 'deny',
              reason: 'Blocked by custom code',
              operations: ['custom']
            };
          `,
        },
        stopOnMatch: false, // Even if false, deny should stop immediately
      };

      const allowRule: PolicyRule = {
        name: "allow_after",
        priority: 15,
        condition: {
          toolName: "test_tool",
        },
        action: {
          operation: "allow",
        },
        stopOnMatch: true,
      };

      vi.spyOn(configModule, "getPolicyRules").mockResolvedValue([customRule, allowRule]);

      const decision = await evaluatePolicy({
        tool: mockTool,
        agentId: defaultAgentContext.agentId,
        agentRole: "coder_bot",
        env: defaultAgentContext.env,
        args: {},
      });

      // Should block immediately even though stopOnMatch is false
      expect(decision.decision).toBe("deny");
      expect(decision.reason).toBe("Blocked by custom code");
    });
  });
});

