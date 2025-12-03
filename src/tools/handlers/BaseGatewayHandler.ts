import type { ToolPolicyConfig } from "../../config.js";
import { logger } from "../../logger.js";
import { evaluatePolicy, type PolicyDecision } from "../../policy.js";
import { inferAgentIntent, type ToolCallEvent, type ProviderType } from "../../intent/index.js";

export interface AgentContext {
  agentId: string;
  agentRole: string;
  env: string;
  tenantId?: string;
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
    operation: () => Promise<ToolExecutionResult>,
    toolConfig?: ToolPolicyConfig
  ): Promise<ToolExecutionResult> {
    const toolCfg = toolConfig || this.getToolConfig();
    if (!toolCfg) {
      return this.createErrorResponse("Tool configuration not found");
    }

    const startTime = Date.now();
    const provider = this.detectProvider(agentContext.agentId);

    // Step 1: Intent Layer - normalize and classify the tool call
    const toolCallEvent: ToolCallEvent = {
      toolName: this.getToolName(),
      arguments: args,
      agentId: agentContext.agentId,
      provider,
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    const intent = await inferAgentIntent(toolCallEvent, {
      name: toolCfg.name,
      description: toolCfg.description,
    });

    // Step 2: Policy Engine - evaluate using intent
    const decision = await evaluatePolicy({
      tool: toolCfg,
      agentId: agentContext.agentId,
      agentRole: agentContext.agentRole,
      env: agentContext.env,
      args,
      intent, // Pass intent to policy engine
      providerId: provider, // Pass provider ID for provider-scoped policies
      tenantId: agentContext.tenantId,
    });

    if (decision.decision === "deny") {
      const latencyMs = Date.now() - startTime;
      await this.logRequest(agentContext, args, decision, intent, provider, latencyMs);
      return this.createDeniedResponse(decision.reason);
    }

    try {
      const result = await operation();
      const latencyMs = Date.now() - startTime;
      await this.logRequest(agentContext, args, decision, intent, provider, latencyMs);
      this.logSuccess(agentContext, args);
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      await this.logRequest(agentContext, args, decision, intent, provider, latencyMs);
      return this.handleError(error, args);
    }
  }

  /**
   * Log the tool request (now includes intent information)
   */
  protected async logRequest(
    agentContext: AgentContext,
    args: Record<string, unknown>,
    decision: PolicyDecision,
    intent?: import("../../intent/index.js").AgentIntent,
    provider: string = 'cursor',
    latencyMs?: number
  ): Promise<void> {
    const logData: Record<string, unknown> = {
      tool: this.getToolName(),
      args: this.sanitizeArgsForLogging(args),
      agentId: agentContext.agentId,
      agentRole: agentContext.agentRole,
      env: agentContext.env,
      decision: decision.decision,
      reason: decision.reason,
    };

    // Include intent information if available
    if (intent) {
      logData.intent = {
        operation: intent.inferredIntent.operation,
        action: intent.inferredIntent.action,
        riskLevel: intent.inferredIntent.riskLevel,
        confidence: intent.inferredIntent.confidence,
        resources: intent.inferredIntent.resources,
      };
    }

    logger.info(`[MCP-GATEWAY] ${this.getToolName()} call`, logData);

    // Log event to event store for UI display
    const intentSummary = intent
      ? `${intent.inferredIntent.operation}:${intent.inferredIntent.action}`
      : this.getToolName();

    // Determine event decision: if "log" operation is present and decision is "allow", use "log"
    const eventDecision: "allow" | "deny" | "log" =
      decision.decision === "allow" && decision.operations?.includes("log")
        ? "log"
        : (decision.decision as "allow" | "deny");

    // Extract target information from args and intent for graph visualization
    const metadata: Record<string, unknown> = {
      args: this.sanitizeArgsForLogging(args),
    };
    if (intent?.inferredIntent.resources && intent.inferredIntent.resources.length > 0) {
      metadata.resources = intent.inferredIntent.resources;
    }

    await logger.logEvent({
      provider,
      agentId: agentContext.agentId,
      toolName: this.getToolName(),
      intentSummary,
      decision: eventDecision,
      riskLevel: intent?.inferredIntent.riskLevel,
      latencyMs,
      tenantId: agentContext.tenantId,
      metadata,
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

  protected detectProvider(agentId: string): ProviderType {
    // Extract provider from agentId format: "provider:nativeId"
    if (agentId.includes(":")) {
      const [provider] = agentId.split(":");
      if (provider && ['openai', 'vertex', 'gemini', 'n8n', 'cursor', 'unknown'].includes(provider)) {
        return provider as ProviderType;
      }
      return 'unknown';
    }
    
    return 'unknown';
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

