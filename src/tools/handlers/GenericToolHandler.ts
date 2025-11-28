import type {
  ThirdPartyToolConfig,
  HttpExecutionConfig,
  CommandExecutionConfig,
  A2aExecutionConfig,
  A2aAuthConfig,
} from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";

/**
 * Generic handler for third-party tools that execute based on configuration.
 * No need to write code for each tool - just configure it!
 */
export class GenericToolHandler extends BaseGatewayHandler {
  private toolConfig: ThirdPartyToolConfig;

  constructor(toolConfig: ThirdPartyToolConfig) {
    super();
    this.toolConfig = toolConfig;
  }

  protected getToolName(): string {
    return this.toolConfig.name;
  }

  protected getToolConfig() {
    return this.toolConfig;
  }

  /**
   * Execute a third-party tool based on its configuration
   */
  async execute(
    agentContext: AgentContext,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    return this.executeWithPolicy(agentContext, args, async () => {
      let result: string;

      switch (this.toolConfig.execution.type) {
        case "http":
          result = await this.executeHttp(this.toolConfig.execution, args);
          break;
        case "command":
          result = await this.executeCommand(this.toolConfig.execution, args);
          break;
        case "custom":
          result = await this.executeCustom(this.toolConfig.execution, args);
          break;
        case "a2a":
          result = await this.executeA2a(
            this.toolConfig.execution,
            args,
            agentContext
          );
          break;
        default:
          throw new Error(`Unsupported execution type: ${(this.toolConfig.execution as { type: string }).type}`);
      }

      logger.info(`[MCP-GATEWAY] ${this.getToolName()} success`, {
        tool: this.getToolName(),
      });

      return this.createSuccessResponse(result);
    });
  }

  /**
   * Execute HTTP-based tool
   */
  private async executeHttp(
    config: HttpExecutionConfig,
    args: Record<string, unknown>
  ): Promise<string> {
    // Replace template variables in URL
    let url = config.url;
    for (const [key, value] of Object.entries(args)) {
      url = url.replace(`{${key}}`, String(value));
    }

    // Replace template variables in headers
    const headers: Record<string, string> = {};
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        let headerValue = value;
        for (const [argKey, argValue] of Object.entries(args)) {
          headerValue = headerValue.replace(`{${argKey}}`, String(argValue));
        }
        headers[key] = headerValue;
      }
    }

    // Replace template variables in body
    let body: string | undefined;
    if (config.bodyTemplate) {
      body = config.bodyTemplate;
      for (const [key, value] of Object.entries(args)) {
        // Handle both {key} and JSON values
        const jsonValue = typeof value === "object" ? JSON.stringify(value) : String(value);
        body = body.replace(`{${key}}`, jsonValue);
      }
    }

    const fetchOptions: RequestInit = {
      method: config.method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (body && (config.method === "POST" || config.method === "PUT" || config.method === "PATCH")) {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${config.method} failed: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();

    // Extract specific path from response if configured
    if (config.responsePath) {
      const extracted = this.extractJsonPath(responseData, config.responsePath);
      return typeof extracted === "string" ? extracted : JSON.stringify(extracted, null, 2);
    }

    return JSON.stringify(responseData, null, 2);
  }

  /**
   * Execute command-based tool
   */
  private async executeCommand(
    config: CommandExecutionConfig,
    args: Record<string, unknown>
  ): Promise<string> {
    // Replace template variables in command
    let command = config.command;
    for (const [key, value] of Object.entries(args)) {
      command = command.replace(`{${key}}`, String(value));
    }

    // Replace template variables in args
    const commandArgs: string[] = [];
    if (config.args) {
      for (const argTemplate of config.args) {
        let arg = argTemplate;
        for (const [key, value] of Object.entries(args)) {
          arg = arg.replace(`{${key}}`, String(value));
        }
        commandArgs.push(arg);
      }
    }

    // Note: For security, you might want to restrict which commands can be executed
    // This is a basic implementation - consider adding command allowlist/validation
    const { spawn } = await import("child_process");

    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        env: { ...process.env, ...config.env },
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        } else {
          resolve(stdout || "Command executed successfully");
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to execute command: ${error.message}`));
      });
    });
  }

  /**
   * Execute custom handler (placeholder for future extensibility)
   */
  private async executeCustom(
    config: { type: "custom"; handler: string; config: Record<string, unknown> },
    args: Record<string, unknown>
  ): Promise<string> {
    // This can be extended to support custom handlers
    // For now, throw an error indicating it's not implemented
    throw new Error(`Custom handler '${config.handler}' is not yet implemented. Extend GenericToolHandler to add custom handlers.`);
  }

  /**
   * Execute an agent-to-agent tool using the configured A2A transport
   */
  private async executeA2a(
    config: A2aExecutionConfig,
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<string> {
    const headers = this.buildA2aHeaders(config.auth);
    const payload = {
      protocol: config.protocol ?? "A2A",
      tool: this.getToolName(),
      providerId: config.providerId,
      caller: {
        agentId: agentContext.agentId,
        agentRole: agentContext.agentRole,
        env: agentContext.env,
        tenantId: agentContext.tenantId,
      },
      params: args,
      metadata: config.metadata,
    };

    const controller = new AbortController();
    const timeoutMs = config.timeoutMs ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`A2A request failed: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      return typeof responseData === "string"
        ? responseData
        : JSON.stringify(responseData, null, 2);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`A2A request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build authentication headers for A2A calls
   */
  private buildA2aHeaders(auth?: A2aAuthConfig): Record<string, string> {
    if (!auth) {
      return {};
    }

    switch (auth.type) {
      case "bearer": {
        const token = process.env[auth.envVar];
        if (!token) {
          throw new Error(`Missing bearer token in environment variable ${auth.envVar}`);
        }

        const headerName = auth.headerName ?? "Authorization";
        const scheme = auth.scheme ?? "Bearer";
        return {
          [headerName]: `${scheme} ${token}`,
        };
      }
      default:
        return {};
    }
  }

  /**
   * Extract value from JSON using a simple path (e.g., "data.results[0].title")
   * This is a basic implementation - consider using a library like jsonpath for complex paths
   */
  private extractJsonPath(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array access like "items[0]"
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = (current as Record<string, unknown>)[key];
        if (Array.isArray(current)) {
          current = current[parseInt(index, 10)];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }
}

