import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, type ChildProcess } from "child_process";
import type { McpServerProxyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";
import { evaluatePolicy, type PolicyDecision } from "../../policy.js";
import type { ToolPolicyConfig } from "../../config.js";

/**
 * Handler for proxying tool calls to an upstream MCP server
 */
export class McpServerProxyHandler extends BaseGatewayHandler {
  private proxyConfig: McpServerProxyConfig;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private process: ChildProcess | null = null;
  private toolConfig: ToolPolicyConfig;

  constructor(proxyConfig: McpServerProxyConfig, toolConfig: ToolPolicyConfig) {
    super();
    this.proxyConfig = proxyConfig;
    this.toolConfig = toolConfig;
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
    const decision = evaluatePolicy({
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
      // Ensure client is connected
      await this.ensureConnected();

      if (!this.client) {
        throw new Error("MCP client not initialized");
      }

      // Call the tool on the upstream server
      const result = await this.client.callTool({
        name: this.toolConfig.name,
        arguments: args as Record<string, unknown>,
      });

      // Convert MCP result to our format
      const content = result.content.map((item) => {
        if (item.type === "text") {
          return {
            type: "text" as const,
            text: item.text,
          };
        }
        // Handle other content types if needed
        return {
          type: "text" as const,
          text: JSON.stringify(item),
        };
      });

      logger.info(`[MCP-GATEWAY] ${this.getToolName()} success (proxied)`, {
        tool: this.getToolName(),
      });

      return {
        content,
        isError: result.isError,
      };
    } catch (error) {
      return this.handleError(error, args);
    }
  }

  /**
   * Ensure the MCP client is connected to the upstream server
   */
  private async ensureConnected(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    logger.info(`[MCP-GATEWAY] Connecting to MCP server: ${this.proxyConfig.name}`);

    // Spawn the MCP server process
    this.process = spawn(this.proxyConfig.command, this.proxyConfig.args, {
      cwd: this.proxyConfig.cwd,
      env: { ...process.env, ...this.proxyConfig.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Handle process errors
    this.process.on("error", (error) => {
      logger.error(`[MCP-GATEWAY] Failed to start MCP server ${this.proxyConfig.name}:`, error);
      this.cleanup();
    });

    this.process.on("exit", (code) => {
      logger.warn(`[MCP-GATEWAY] MCP server ${this.proxyConfig.name} exited with code ${code}`);
      this.cleanup();
    });

    // Create transport and client
    this.transport = new StdioClientTransport({
      command: this.proxyConfig.command,
      args: this.proxyConfig.args,
      env: { ...process.env, ...this.proxyConfig.env },
    });

    this.client = new Client(
      {
        name: `gateway-proxy-${this.proxyConfig.name}`,
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    // Connect to the upstream server
    await this.transport.connect();
    await this.client.connect(this.transport);

    logger.info(`[MCP-GATEWAY] Connected to MCP server: ${this.proxyConfig.name}`);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.client) {
      this.client.close().catch((err) => {
        logger.warn(`[MCP-GATEWAY] Error closing client:`, err);
      });
      this.client = null;
    }

    if (this.transport) {
      this.transport.close().catch((err) => {
        logger.warn(`[MCP-GATEWAY] Error closing transport:`, err);
      });
      this.transport = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
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
    const transport = new StdioClientTransport({
      command: proxyConfig.command,
      args: proxyConfig.args,
      env: { ...process.env, ...proxyConfig.env },
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

    // Connect
    await transport.connect();
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

  private clients: Map<string, Client> = new Map();
}

