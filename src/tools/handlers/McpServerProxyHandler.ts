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
 *    - Uses POST requests for JSON-RPC messages over HTTP
 *    - Requires authentication headers for OAuth/API key-based services
 *    - Supports custom headers via proxy config
 */
export class McpServerProxyManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport | unknown> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  /**
   * Merge headers from the transport with proxy-specific headers while
   * preserving required MCP headers (content-type, accept, session id, etc.).
   * MCP protocol headers take precedence over proxy config headers.
   */
  private mergeHeaders(initHeaders?: HeadersInit, extraHeaders?: Record<string, string>): Headers {
    const merged = new Headers(initHeaders ?? {});
    if (extraHeaders) {
      // List of MCP protocol headers that must be preserved
      const mcpProtocolHeaders = [
        'content-type',
        'accept',
        'mcp-version',
        'x-mcp-session-id',
        'x-mcp-request-id',
      ];
      
      for (const [key, value] of Object.entries(extraHeaders)) {
        const lowerKey = key.toLowerCase();
        // Only set header if it's not a protected MCP protocol header
        if (!mcpProtocolHeaders.includes(lowerKey)) {
          merged.set(key, value);
        }
      }
    }
    return merged;
  }

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
      if (!proxyConfig.serverUrl) {
        throw new Error(`serverUrl is required for remote endpoint connection: ${proxyConfig.name}`);
      }
    
      const headers = this.processHeaders(proxyConfig.headers);
      const substitutedServerUrl = this.substituteEnvVars(proxyConfig.serverUrl);
    
      // Log the substituted URL right before creating URL object
      logger.info(`[MCP-GATEWAY] Using remote MCP URL: ${substitutedServerUrl}`);
    
      // Warn if no authentication headers are configured (many MCP servers require auth)
      if (!headers || Object.keys(headers).length === 0) {
        logger.warn(
          `[MCP-GATEWAY] No authentication headers configured for ${proxyConfig.name}. ` +
          `Many MCP servers (like Notion, Slack, etc.) require OAuth tokens or API keys. ` +
          `Configure 'headers' in the MCP proxy config with appropriate credentials. ` +
          `For OAuth-based services, ensure you have completed the OAuth flow first.`
        );
      }
    
      // Import transport once
      const httpModule = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
      const { StreamableHTTPClientTransport } = httpModule;
    
      let serverUrl: URL;
      try {
        serverUrl = new URL(substitutedServerUrl);
      } catch (urlError) {
        throw new Error(`Invalid serverUrl format: ${substitutedServerUrl}. Error: ${urlError}`);
      }
    
      const maskedHeaders = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => {
          const lowerKey = key.toLowerCase();
          const stringValue = String(value ?? "");
          const isSensitive =
            lowerKey.includes("auth") ||
            lowerKey.includes("token") ||
            lowerKey.includes("key") ||
            lowerKey.includes("secret");
    
          return [
            key,
            isSensitive ? `${stringValue.slice(0, 3)}***[redacted]***` : stringValue,
          ];
        })
      );
      logger.info(`[MCP-GATEWAY] Using StreamableHTTP transport for: ${serverUrl.origin}`);
      logger.info(`[MCP-GATEWAY] Request headers: ${JSON.stringify(maskedHeaders)}`);

      transport = new StreamableHTTPClientTransport(serverUrl, {
        requestInit: {},
        fetch: async (url, init) => {
          try {
            const mergedHeaders = this.mergeHeaders(init?.headers, headers);
            const method = init?.method || "GET";
            logger.info(`[MCP-GATEWAY] Fetching ${url} with method ${method}`);
            
            // Log request details for debugging
            const headerEntries = Array.from(mergedHeaders.entries());
            const headerNames = headerEntries.map(([k]) => k.toLowerCase());
            logger.info(`[MCP-GATEWAY] Request headers: ${JSON.stringify(headerNames)}`);
            logger.info(`[MCP-GATEWAY] Request body present: ${!!init?.body}`);
            
            const response = await fetch(url, {
              ...init,
              headers: mergedHeaders,
            });
            
            logger.info(`[MCP-GATEWAY] Response status: ${response.status} ${response.statusText}`);
            
            // Log response headers for debugging
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });
            logger.info(`[MCP-GATEWAY] Response headers: ${JSON.stringify(Object.keys(responseHeaders))}`);
            
            // If response is not OK, log the response body for debugging
            if (!response.ok) {
              let errorBody = "";
              try {
                const contentType = response.headers.get("content-type");
                if (contentType?.includes("application/json")) {
                  errorBody = await response.clone().text();
                } else {
                  errorBody = await response.clone().text();
                }
                logger.error(`[MCP-GATEWAY] Error response body: ${errorBody.substring(0, 500)}`);
              } catch (bodyError) {
                logger.error(`[MCP-GATEWAY] Could not read error response body:`, bodyError);
              }
              
              // Provide helpful error messages based on status code
              if (response.status === 401 || response.status === 403) {
                throw new Error(
                  `Authentication failed (${response.status}). ` +
                  `This MCP server requires authentication. ` +
                  `Please configure 'headers' in the MCP proxy config with appropriate credentials (e.g., Authorization header). ` +
                  `For OAuth-based services like Notion, you may need to complete the OAuth flow first.`
                );
              }
              if (response.status === 404) {
                throw new Error(
                  `Endpoint not found (404). ` +
                  `Please verify the serverUrl is correct: ${serverUrl.toString()}`
                );
              }
              if (response.status === 405) {
                throw new Error(
                  `Method not allowed (405). ` +
                  `The server does not accept ${method} requests. ` +
                  `MCP over HTTP typically uses POST for JSON-RPC messages.`
                );
              }
            }
            
            return response;
          } catch (fetchError) {
            logger.error(`[MCP-GATEWAY] Fetch error for ${url}:`, fetchError);
            if (fetchError instanceof Error) {
              const msg = (fetchError.message || "").toLowerCase();
              const errorStack = fetchError.stack || "";
              
              // Log the full error for debugging
              logger.error(`[MCP-GATEWAY] Error details: ${fetchError.message}`);
              logger.error(`[MCP-GATEWAY] Error stack: ${errorStack.substring(0, 500)}`);
              
              if (msg.includes("enotfound") || msg.includes("getaddrinfo")) {
                throw new Error(
                  `DNS resolution failed for ${serverUrl.hostname}. ` +
                  `Please verify the serverUrl is correct and the hostname is reachable.`
                );
              }
              if (msg.includes("econnrefused")) {
                throw new Error(
                  `Connection refused to ${serverUrl.hostname}:${serverUrl.port || 443}. ` +
                  `The server may be down or not accepting connections.`
                );
              }
              if (msg.includes("cert") || msg.includes("ssl") || msg.includes("tls")) {
                throw new Error(
                  `SSL/TLS certificate error for ${serverUrl.hostname}. ` +
                  `Please verify the server has a valid certificate.`
                );
              }
              
              // Check if it's an authentication-related error
              if (msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("401") || msg.includes("403")) {
                throw new Error(
                  `Authentication required. ` +
                  `This MCP server requires authentication headers. ` +
                  `Please configure 'headers' in the MCP proxy config. ` +
                  `For OAuth-based services, ensure you have completed the OAuth flow and have a valid access token.`
                );
              }
            }
            throw fetchError;
          }
        },
      });
    }
    else {
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
    // Client.connect accepts both StdioClientTransport and StreamableHTTPClientTransport
    // Using 'as any' to work around TypeScript's strict type checking for union types
    await client.connect(transport as any);

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
