import type { ToolPolicyConfig } from "../../config.js";
import { logger } from "../../logger.js";
import { evaluatePolicy, type PolicyDecision } from "../../policy.js";

export interface AgentContext {
  agentId: string;
  agentRole: string;
  env: string;
}

export interface ToolExecutionResult {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Base class for all gateway tool handlers.
 * Provides common functionality for policy evaluation and logging.
 */
export abstract class BaseGatewayHandler {
  protected abstract getToolName(): string;
  protected abstract getToolConfig(): ToolPolicyConfig | undefined;

  /**
   * Execute the tool operation with policy enforcement and logging
   */
  protected async executeWithPolicy(
    agentContext: AgentContext,
    args: Record<string, unknown>,
    operation: () => Promise<ToolExecutionResult>
  ): Promise<ToolExecutionResult> {
    const toolCfg = this.getToolConfig();
    if (!toolCfg) {
      return this.createErrorResponse("Tool configuration not found");
    }

    const decision = await evaluatePolicy({
      tool: toolCfg,
      agentId: agentContext.agentId,
      agentRole: agentContext.agentRole,
      env: agentContext.env,
      args,
    });

    this.logRequest(agentContext, args, decision);

    if (decision.decision === "deny") {
      return this.createDeniedResponse(decision.reason);
    }

    try {
      const result = await operation();
      this.logSuccess(agentContext, args);
      return result;
    } catch (error) {
      return this.handleError(error, args);
    }
  }

  /**
   * Log the tool request
   */
  protected logRequest(
    agentContext: AgentContext,
    args: Record<string, unknown>,
    decision: PolicyDecision
  ): void {
    logger.info(`[MCP-GATEWAY] ${this.getToolName()} call`, {
      tool: this.getToolName(),
      args: this.sanitizeArgsForLogging(args),
      agentId: agentContext.agentId,
      agentRole: agentContext.agentRole,
      env: agentContext.env,
      decision: decision.decision,
      reason: decision.reason,
    });
  }

  /**
   * Log successful operation
   */
  protected logSuccess(
    agentContext: AgentContext,
    args: Record<string, unknown>
  ): void {
    logger.info(`[MCP-GATEWAY] ${this.getToolName()} success`, {
      tool: this.getToolName(),
      args: this.sanitizeArgsForLogging(args),
    });
  }

  /**
   * Handle errors and return error response
   */
  protected handleError(
    error: unknown,
    args: Record<string, unknown>
  ): ToolExecutionResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[MCP-GATEWAY] ${this.getToolName()} error`, {
      tool: this.getToolName(),
      args: this.sanitizeArgsForLogging(args),
      error: errorMessage,
    });

    return this.createErrorResponse(errorMessage);
  }

  /**
   * Create a denied response
   */
  protected createDeniedResponse(reason: string): ToolExecutionResult {
    return {
      content: [
        {
          type: "text",
          text: `Access denied by gateway policy: ${reason}`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Create an error response
   */
  protected createErrorResponse(message: string): ToolExecutionResult {
    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
      isError: true,
    };
  }

  /**
   * Create a success response
   */
  protected createSuccessResponse(text: string): ToolExecutionResult {
    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }

  /**
   * Sanitize arguments for logging (e.g., truncate large content)
   */
  protected sanitizeArgsForLogging(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...args };
    if (typeof sanitized.contents === "string" && sanitized.contents.length > 100) {
      sanitized.contents = sanitized.contents.substring(0, 100) + "...";
    }
    return sanitized;
  }
}

