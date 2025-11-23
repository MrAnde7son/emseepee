import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChildProcess } from "child_process";
import type { McpServerProxyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";
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
    return this.executeWithPolicy(agentContext, args, async () => {
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
    });
  }

}

/**
 * Manager for MCP server proxies
 * Handles connection, tool discovery, and registration
 * Supports three connection types:
 * 1. Command-based (npx, node, etc.) - uses StdioClientTransport
 * 2. Docker-based - uses StdioClientTransport with docker command
 * 3. Remote endpoint - uses StreamableHTTPClientTransport (HTTP/SSE)
 */
export class McpServerProxyManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport | unknown> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  /**
   * Substitute environment variables in string values
   */
  private substituteEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }

  /**
   * Process headers with environment variable substitution
   */
  private processHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};
    const processed: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      processed[key] = this.substituteEnvVars(value);
    }
    return processed;
  }

  /**
   * Connect to an MCP server and discover its tools
   */
  async connectAndDiscoverTools(
    proxyConfig: McpServerProxyConfig
  ): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    logger.info(`[MCP-GATEWAY] Connecting to MCP server proxy: ${proxyConfig.name}`);

    // Determine connection type
    const isRemoteEndpoint = !!proxyConfig.serverUrl;
    const isDocker = proxyConfig.command === "docker";

    let transport: StdioClientTransport | unknown;

    if (isRemoteEndpoint) {
      // Remote endpoint connection
      if (!proxyConfig.serverUrl) {
        throw new Error(`serverUrl is required for remote endpoint connection: ${proxyConfig.name}`);
      }

      const headers = this.processHeaders(proxyConfig.headers);

      // Try to use StreamableHTTP transport (replaces deprecated SSE transport)
      try {
        const httpModule = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
        const StreamableHTTPClientTransport = httpModule.StreamableHTTPClientTransport;
        logger.info(`[MCP-GATEWAY] Using StreamableHTTP transport for remote endpoint: ${proxyConfig.serverUrl}`);
        
        // Validate and create URL
        let serverUrl: URL;
        try {
          serverUrl = new URL(proxyConfig.serverUrl);
        } catch (urlError) {
          throw new Error(`Invalid serverUrl format: ${proxyConfig.serverUrl}. Error: ${urlError}`);
        }
        
        // Log headers (mask sensitive values)
        const maskedHeaders = Object.fromEntries(
          Object.entries(headers).map(([key, value]) => [
            key,
            key.toLowerCase().includes("auth") || key.toLowerCase().includes("token") || key.toLowerCase().includes("key")
              ? `${value.substring(0, 10)}...` 
              : value
          ])
        );
        logger.info(`[MCP-GATEWAY] Request headers: ${JSON.stringify(maskedHeaders)}`);
        
        transport = new StreamableHTTPClientTransport(serverUrl, {
          fetch: async (url, init) => {
            try {
              logger.info(`[MCP-GATEWAY] Fetching ${url} with method ${init?.method || "GET"}`);
              const response = await fetch(url, {
                ...init,
                headers: {
                  ...(init?.headers as Record<string, string>),
                  ...headers,
                },
              });
              logger.info(`[MCP-GATEWAY] Response status: ${response.status} ${response.statusText}`);
              return response;
            } catch (fetchError) {
              logger.error(`[MCP-GATEWAY] Fetch error for ${url}:`, fetchError);
              if (fetchError instanceof Error) {
                // Provide more helpful error messages
                if (fetchError.message.includes("ENOTFOUND") || fetchError.message.includes("getaddrinfo")) {
                  throw new Error(
                    `DNS resolution failed for ${serverUrl.hostname}. ` +
                    `Please verify the serverUrl is correct and the hostname is reachable.`
                  );
                }
                if (fetchError.message.includes("ECONNREFUSED")) {
                  throw new Error(
                    `Connection refused to ${serverUrl.hostname}:${serverUrl.port || 443}. ` +
                    `The server may be down or not accepting connections.`
                  );
                }
                if (fetchError.message.includes("CERT") || fetchError.message.includes("SSL")) {
                  throw new Error(
                    `SSL/TLS certificate error for ${serverUrl.hostname}. ` +
                    `Please verify the server has a valid certificate.`
                  );
                }
              }
              throw fetchError;
            }
          },
        });
      } catch (error) {
        // StreamableHTTP transport not available, throw error with helpful message
        logger.error(`[MCP-GATEWAY] StreamableHTTP transport error: ${error}`);
        if (error instanceof Error && error.message.includes("Invalid serverUrl")) {
          throw error;
        }
        throw new Error(
          `Failed to connect to remote MCP endpoint ${proxyConfig.serverUrl}. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}. ` +
          `Please verify the serverUrl is correct and the endpoint is accessible.`
        );
      }
    } else {
      // Command-based or Docker-based connection (both use stdio)
      if (!proxyConfig.command) {
        throw new Error(`command is required for command/docker-based connection: ${proxyConfig.name}`);
      }
      if (!proxyConfig.args) {
        throw new Error(`args is required for command/docker-based connection: ${proxyConfig.name}`);
      }

      // Create transport
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      if (proxyConfig.env) {
        for (const [key, value] of Object.entries(proxyConfig.env)) {
          // Substitute environment variables in env values
          env[key] = this.substituteEnvVars(value);
        }
      }

      logger.info(
        `[MCP-GATEWAY] Using ${isDocker ? "Docker" : "command"}-based transport: ${proxyConfig.command} ${proxyConfig.args.join(" ")}`
      );

      transport = new StdioClientTransport({
        command: proxyConfig.command,
        args: proxyConfig.args,
        env,
        cwd: proxyConfig.cwd,
      });
    }

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
    // Type assertion needed because transport can be StdioClientTransport or SSE transport
    await client.connect(transport as StdioClientTransport);

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
        if (transport && typeof transport === "object" && "close" in transport && typeof transport.close === "function") {
          await transport.close();
        }
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

