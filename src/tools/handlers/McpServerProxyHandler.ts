import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChildProcess } from "child_process";
import type { McpServerProxyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";
import { evaluatePolicy } from "../../policy.js";
import type { ToolPolicyConfig } from "../../config.js";

/**
 * Handler for proxying tool calls to an upstream MCP server
 */
export class McpServerProxyHandler extends BaseGatewayHandler {
  private proxyConfig: McpServerProxyConfig;
  private manager: McpServerProxyManager;
  private toolConfig: ToolPolicyConfig;

  constructor(
    proxyConfig: McpServerProxyConfig,
    toolConfig: ToolPolicyConfig,
    manager: McpServerProxyManager
  ) {
    super();
    this.proxyConfig = proxyConfig;
    this.toolConfig = toolConfig;
    this.manager = manager;
  }

  protected getToolName(): string {
    return this.toolConfig.name;
  }

  protected getToolConfig(): ToolPolicyConfig {
    return this.toolConfig;
  }

  /**
   * Execute a tool call by proxying to the upstream MCP server
   */
  async execute(
    agentContext: AgentContext,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const decision = await evaluatePolicy({
      tool: this.toolConfig,
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
      // Get client from manager
      const client = this.manager.getClient(this.proxyConfig.name);
      if (!client) {
        throw new Error(`MCP client not initialized for proxy: ${this.proxyConfig.name}`);
      }

      // Call the tool on the upstream server
      const result = await client.callTool({
        name: this.toolConfig.name,
        arguments: args as Record<string, unknown>,
      });

      // Convert MCP result to our format
      const content = Array.isArray(result.content)
        ? result.content.map((item: unknown) => {
            const contentItem = item as { type?: string; text?: string };
            if (contentItem.type === "text" && contentItem.text) {
              return {
                type: "text" as const,
                text: contentItem.text,
              };
            }
            // Handle other content types if needed
            return {
              type: "text" as const,
              text: JSON.stringify(item),
            };
          })
        : [
            {
              type: "text" as const,
              text: JSON.stringify(result.content),
            },
          ];

      logger.info(`[MCP-GATEWAY] ${this.getToolName()} success (proxied)`, {
        tool: this.getToolName(),
      });

      return {
        content,
        isError: result.isError === true,
      };
    } catch (error) {
      return this.handleError(error, args);
    }
  }

}

/**
 * Manager for MCP server proxies
 * Handles connection, tool discovery, and registration
 */
export class McpServerProxyManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  /**
   * Connect to an MCP server and discover its tools
   */
  async connectAndDiscoverTools(
    proxyConfig: McpServerProxyConfig
  ): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    logger.info(`[MCP-GATEWAY] Connecting to MCP server proxy: ${proxyConfig.name}`);

    // Create transport
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    if (proxyConfig.env) {
      for (const [key, value] of Object.entries(proxyConfig.env)) {
        env[key] = value;
      }
    }

    const transport = new StdioClientTransport({
      command: proxyConfig.command,
      args: proxyConfig.args,
      env,
      cwd: proxyConfig.cwd,
    });

    // Create client
    const client = new Client(
      {
        name: `gateway-proxy-${proxyConfig.name}`,
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    // Connect - transport handles the connection automatically
    await client.connect(transport);

    // Store references
    this.transports.set(proxyConfig.name, transport);
    this.clients.set(proxyConfig.name, client);

    // Discover tools
    const toolsList = await client.listTools();
    const tools = toolsList.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema,
    }));

    logger.info(
      `[MCP-GATEWAY] Discovered ${tools.length} tools from MCP server: ${proxyConfig.name}`
    );

    return tools;
  }

  /**
   * Get a client for a proxy (for making tool calls)
   */
  getClient(proxyName: string): Client | undefined {
    return this.clients.get(proxyName);
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
      } catch (err) {
        logger.warn(`[MCP-GATEWAY] Error closing client ${name}:`, err);
      }
    }

    for (const [name, transport] of this.transports.entries()) {
      try {
        await transport.close();
      } catch (err) {
        logger.warn(`[MCP-GATEWAY] Error closing transport ${name}:`, err);
      }
    }

    for (const [name, process] of this.processes.entries()) {
      process.kill();
    }

    this.clients.clear();
    this.transports.clear();
    this.processes.clear();
  }
}

