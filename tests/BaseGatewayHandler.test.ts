import { describe, it, expect, beforeEach, vi } from "vitest";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "../src/tools/handlers/BaseGatewayHandler.js";
import type { ToolPolicyConfig } from "../src/config.js";
import * as policyModule from "../src/policy.js";
import * as loggerModule from "../src/logger.js";

// Concrete implementation for testing
class TestGatewayHandler extends BaseGatewayHandler {
  private toolConfig: ToolPolicyConfig | undefined;

  constructor(toolConfig?: ToolPolicyConfig) {
    super();
    this.toolConfig = toolConfig;
  }

  protected getToolName(): string {
    return "test_tool";
  }

  protected getToolConfig(): ToolPolicyConfig | undefined {
    return this.toolConfig;
  }

  // Expose protected methods for testing
  public testExecuteWithPolicy(
    agentContext: AgentContext,
    args: Record<string, unknown>,
    operation: () => Promise<ToolExecutionResult>
  ): Promise<ToolExecutionResult> {
    return this.executeWithPolicy(agentContext, args, operation);
  }

  public testCreateErrorResponse(message: string): ToolExecutionResult {
    return this.createErrorResponse(message);
  }

  public testCreateDeniedResponse(reason: string): ToolExecutionResult {
    return this.createDeniedResponse(reason);
  }

  public testCreateSuccessResponse(text: string): ToolExecutionResult {
    return this.createSuccessResponse(text);
  }

  public testSanitizeArgsForLogging(args: Record<string, unknown>): Record<string, unknown> {
    return this.sanitizeArgsForLogging(args);
  }

  public testLogRequest(
    agentContext: AgentContext,
    args: Record<string, unknown>,
    decision: { decision: string; reason: string }
  ): void {
    this.logRequest(agentContext, args, decision as any);
  }

  public testLogSuccess(agentContext: AgentContext, args: Record<string, unknown>): void {
    this.logSuccess(agentContext, args);
  }

  public testHandleError(error: unknown, args: Record<string, unknown>): ToolExecutionResult {
    return this.handleError(error, args);
  }
}

describe("BaseGatewayHandler", () => {
  const mockToolConfig: ToolPolicyConfig = {
    name: "test_tool",
    description: "Test tool",
    allowedRoles: ["coder_bot", "admin"],
    sensitivity: "medium",
    category: "file",
  };

  const mockAgentContext: AgentContext = {
    agentId: "test-agent",
    agentRole: "coder_bot",
    env: "dev",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeWithPolicy", () => {
    it("should return error when tool config is not found", async () => {
      const handler = new TestGatewayHandler(undefined);

      const result = await handler.testExecuteWithPolicy(
        mockAgentContext,
        {},
        async () => ({ content: [{ type: "text", text: "success" }] })
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Tool configuration not found");
    });

    it("should deny access when policy decision is deny", async () => {
      const handler = new TestGatewayHandler(mockToolConfig);

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "deny",
        reason: "Access denied",
        operations: ["block"],
      });

      const result = await handler.testExecuteWithPolicy(
        mockAgentContext,
        {},
        async () => ({ content: [{ type: "text", text: "success" }] })
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access denied by gateway policy");
      expect(result.content[0].text).toContain("Access denied");
    });

    it("should execute operation when policy decision is allow", async () => {
      const handler = new TestGatewayHandler(mockToolConfig);

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const operation = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Operation successful" }],
      });

      const result = await handler.testExecuteWithPolicy(mockAgentContext, {}, operation);

      expect(operation).toHaveBeenCalled();
      expect(result.content[0].text).toBe("Operation successful");
      expect(result.isError).toBeUndefined();
    });

    it("should handle errors during operation execution", async () => {
      const handler = new TestGatewayHandler(mockToolConfig);

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const error = new Error("Operation failed");
      const operation = vi.fn().mockRejectedValue(error);

      const result = await handler.testExecuteWithPolicy(mockAgentContext, {}, operation);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Operation failed");
    });

    it("should log request before executing operation", async () => {
      const handler = new TestGatewayHandler(mockToolConfig);
      const logSpy = vi.spyOn(loggerModule.logger, "info");

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      await handler.testExecuteWithPolicy(
        mockAgentContext,
        { arg1: "value1" },
        async () => ({ content: [{ type: "text", text: "success" }] })
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("test_tool call"),
        expect.objectContaining({
          tool: "test_tool",
          agentId: "test-agent",
          agentRole: "coder_bot",
          env: "dev",
          decision: "allow",
        })
      );
    });

    it("should log success after successful operation", async () => {
      const handler = new TestGatewayHandler(mockToolConfig);
      const logSpy = vi.spyOn(loggerModule.logger, "info");

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      await handler.testExecuteWithPolicy(
        mockAgentContext,
        { arg1: "value1" },
        async () => ({ content: [{ type: "text", text: "success" }] })
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("test_tool success"),
        expect.objectContaining({
          tool: "test_tool",
        })
      );
    });
  });

  describe("Response Creation", () => {
    it("should create error response", () => {
      const handler = new TestGatewayHandler();
      const result = handler.testCreateErrorResponse("Test error message");

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("Test error message");
    });

    it("should create denied response", () => {
      const handler = new TestGatewayHandler();
      const result = handler.testCreateDeniedResponse("Access denied reason");

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Access denied by gateway policy");
      expect(result.content[0].text).toContain("Access denied reason");
    });

    it("should create success response", () => {
      const handler = new TestGatewayHandler();
      const result = handler.testCreateSuccessResponse("Operation successful");

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("Operation successful");
    });
  });

  describe("Error Handling", () => {
    it("should handle Error objects", () => {
      const handler = new TestGatewayHandler();
      const error = new Error("Test error");
      const logSpy = vi.spyOn(loggerModule.logger, "error");

      const result = handler.testHandleError(error, { arg1: "value" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Test error");
      expect(logSpy).toHaveBeenCalled();
    });

    it("should handle non-Error objects", () => {
      const handler = new TestGatewayHandler();
      const error = "String error";
      const logSpy = vi.spyOn(loggerModule.logger, "error");

      const result = handler.testHandleError(error, { arg1: "value" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("String error");
      expect(logSpy).toHaveBeenCalled();
    });

    it("should log error with tool name and args", () => {
      const handler = new TestGatewayHandler();
      const error = new Error("Test error");
      const logSpy = vi.spyOn(loggerModule.logger, "error");

      handler.testHandleError(error, { arg1: "value1", arg2: "value2" });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("test_tool error"),
        expect.objectContaining({
          tool: "test_tool",
          args: expect.objectContaining({
            arg1: "value1",
            arg2: "value2",
          }),
          error: "Test error",
        })
      );
    });
  });

  describe("Argument Sanitization", () => {
    it("should truncate long contents in args", () => {
      const handler = new TestGatewayHandler();
      const longContent = "a".repeat(200);
      const args = {
        contents: longContent,
        otherArg: "normal",
      };

      const sanitized = handler.testSanitizeArgsForLogging(args);

      expect(sanitized.contents).toBe("a".repeat(100) + "...");
      expect(sanitized.otherArg).toBe("normal");
    });

    it("should not truncate short contents", () => {
      const handler = new TestGatewayHandler();
      const shortContent = "short";
      const args = {
        contents: shortContent,
        otherArg: "normal",
      };

      const sanitized = handler.testSanitizeArgsForLogging(args);

      expect(sanitized.contents).toBe("short");
      expect(sanitized.otherArg).toBe("normal");
    });

    it("should handle args without contents field", () => {
      const handler = new TestGatewayHandler();
      const args = {
        path: "/some/path",
        encoding: "utf-8",
      };

      const sanitized = handler.testSanitizeArgsForLogging(args);

      expect(sanitized).toEqual(args);
    });

    it("should handle non-string contents", () => {
      const handler = new TestGatewayHandler();
      const args = {
        contents: 123,
        otherArg: "normal",
      };

      const sanitized = handler.testSanitizeArgsForLogging(args);

      expect(sanitized.contents).toBe(123);
    });
  });

  describe("Logging", () => {
    it("should log request with sanitized args", () => {
      const handler = new TestGatewayHandler();
      const logSpy = vi.spyOn(loggerModule.logger, "info");
      const longContent = "a".repeat(200);
      const args = {
        contents: longContent,
        path: "/test/path",
      };

      handler.testLogRequest(mockAgentContext, args, {
        decision: "allow",
        reason: "Allowed",
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("test_tool call"),
        expect.objectContaining({
          args: expect.objectContaining({
            contents: expect.stringContaining("..."),
            path: "/test/path",
          }),
        })
      );
    });

    it("should log success with sanitized args", () => {
      const handler = new TestGatewayHandler();
      const logSpy = vi.spyOn(loggerModule.logger, "info");
      const args = {
        path: "/test/path",
        contents: "test content",
      };

      handler.testLogSuccess(mockAgentContext, args);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("test_tool success"),
        expect.objectContaining({
          tool: "test_tool",
          args: expect.objectContaining({
            path: "/test/path",
            contents: "test content",
          }),
        })
      );
    });
  });
});

