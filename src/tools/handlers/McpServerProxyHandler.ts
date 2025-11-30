import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChildProcess } from "child_process";
import type { McpServerProxyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";
import type { ToolPolicyConfig } from "../../config.js";
import https from "https";
import http from "http";
import { Agent as HttpsAgent } from "https";

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
 *    - Supports Server-Sent Events (SSE) streaming for bidirectional communication
 *    - Preserves stream integrity by not consuming response bodies prematurely
 *    - Requires authentication headers for OAuth/API key-based services
 *    - Supports custom headers via proxy config
 *    - Follows agentgateway patterns for SSE proxy implementation
 */
// Lazy singleton for an insecure HTTPS agent (used only when explicitly allowed)
let insecureAgent: HttpsAgent | null = null;
function getInsecureAgent(): HttpsAgent {
  if (!insecureAgent) {
    insecureAgent = new HttpsAgent({ rejectUnauthorized: false });
  }
  return insecureAgent;
}

/**
 * Custom fetch that supports insecure TLS for development
 * Returns a Response-compatible object
 */
async function fetchWithCustomTLS(
  url: string | URL,
  init?: RequestInit & { allowInsecureTLS?: boolean }
): Promise<Response> {
  const urlObj = typeof url === "string" ? new URL(url) : url;
  const isHttps = urlObj.protocol === "https:";
  const client = isHttps ? https : http;
  
  const allowInsecureTLS = init?.allowInsecureTLS || 
    process.env.MCP_ALLOW_INSECURE === "true" || 
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
  
  // Convert headers to plain object
  let headersObj: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      headersObj = Object.fromEntries(init.headers);
    } else {
      headersObj = init.headers as Record<string, string>;
    }
  }
  
  const requestOptions: https.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: init?.method || "GET",
    headers: headersObj,
  };

  // Use insecure agent if allowed
  if (isHttps && allowInsecureTLS) {
    requestOptions.agent = getInsecureAgent();
  }

  const timeout = 30000; // 30 second timeout for MCP connections
  let timeoutId: NodeJS.Timeout | null = null;

  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
      // Check if this is an SSE stream (text/event-stream)
      const contentType = res.headers["content-type"] || "";
      const isSSEStream = contentType.includes("text/event-stream");
      
      if (isSSEStream) {
        // For SSE streams, create a ReadableStream from the response
        // Don't clear timeout for SSE - let it run until stream ends
        const stream = new ReadableStream({
          start(controller) {
            res.on("data", (chunk: Buffer) => {
              // Convert Buffer to Uint8Array for ReadableStream
              controller.enqueue(new Uint8Array(chunk));
            });
            
            res.on("end", () => {
              if (timeoutId) clearTimeout(timeoutId);
              controller.close();
            });
            
            res.on("error", (error) => {
              if (timeoutId) clearTimeout(timeoutId);
              controller.error(error);
            });
          },
          cancel() {
            if (timeoutId) clearTimeout(timeoutId);
            res.destroy();
          },
        });
        
        const response = new Response(stream, {
          status: res.statusCode || 0,
          statusText: res.statusMessage || "",
          headers: res.headers as HeadersInit,
        });
        
        resolve(response);
      } else {
        // For non-streaming responses, buffer the entire body
        const chunks: Buffer[] = [];
        
        res.on("data", (chunk) => {
          chunks.push(chunk);
        });
        
        res.on("end", () => {
          if (timeoutId) clearTimeout(timeoutId);
          const body = Buffer.concat(chunks);
          
          // Create a Response object
          const response = new Response(body, {
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            headers: res.headers as HeadersInit,
          });
          
          resolve(response);
        });
        
        res.on("error", (error) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(error);
        });
      }
    });

    req.on("error", (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });

    timeoutId = setTimeout(() => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms while fetching ${urlObj.toString()}`));
    }, timeout);

    // Write body if present
    if (init?.body) {
      if (typeof init.body === "string") {
        req.write(init.body);
      } else if (init.body instanceof URLSearchParams) {
        req.write(init.body.toString());
      } else if (init.body instanceof FormData) {
        // FormData handling would need additional logic
        req.write(init.body);
      } else {
        // Assume it's a stream or buffer
        req.write(init.body);
      }
    }

    req.end();
  });
}

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
      
      // Debug: Log raw headers from config (before processing)
      if (proxyConfig.headers) {
        logger.info(`[MCP-GATEWAY] Raw headers from config for ${proxyConfig.name}: ${JSON.stringify(Object.keys(proxyConfig.headers))}`);
        if (proxyConfig.headers.Authorization) {
          const authParts = proxyConfig.headers.Authorization.split(" ");
          logger.info(`[MCP-GATEWAY] Authorization header from config: type="${authParts[0]}", token_length=${authParts[1]?.length || 0}`);
        }
      }
    
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
      
      // Debug: Log Authorization header format for OAuth services
      if (headers.Authorization) {
        const authHeader = headers.Authorization;
        const parts = authHeader.split(" ");
        logger.info(`[MCP-GATEWAY] Authorization header format: type="${parts[0]}", token_length=${parts[1]?.length || 0}, token_prefix=${parts[1]?.substring(0, 10) || "none"}...`);
      }

      // Check if SSL verification should be disabled (for development/testing only)
      const allowInsecure = process.env.MCP_ALLOW_INSECURE === "true" || 
                           process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
      if (allowInsecure) {
        logger.warn(
          `[MCP-GATEWAY] SSL certificate verification is DISABLED for ${proxyConfig.name}. ` +
          `This is insecure and should only be used for development/testing. ` +
          `Do not use in production environments.`
        );
      }

      transport = new StreamableHTTPClientTransport(serverUrl, {
        requestInit: {},
        fetch: async (url, init) => {
          try {
            const mergedHeaders = this.mergeHeaders(init?.headers, headers);
            const method = init?.method || "GET";
            
            if (!mergedHeaders.has("accept")) {
              mergedHeaders.set("accept", "text/event-stream, application/json");
            }
            
            logger.info(`[MCP-GATEWAY] Fetching ${url} with method ${method}`);
            
            // Log request details for debugging
            const headerEntries = Array.from(mergedHeaders.entries());
            const headerNames = headerEntries.map(([k]) => k.toLowerCase());
            logger.info(`[MCP-GATEWAY] Request headers: ${JSON.stringify(headerNames)}`);
            logger.info(`[MCP-GATEWAY] Request body present: ${!!init?.body}`);
            
            // Use custom fetch that supports insecure TLS
            const allowInsecure = process.env.MCP_ALLOW_INSECURE === "true" || 
                                 process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
            
            const response = await fetchWithCustomTLS(url, {
              ...init,
              headers: mergedHeaders,
              allowInsecureTLS: allowInsecure,
            });
            
            logger.info(`[MCP-GATEWAY] Response status: ${response.status} ${response.statusText}`);
            
            // Log response headers for debugging
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });
            logger.info(`[MCP-GATEWAY] Response headers: ${JSON.stringify(Object.keys(responseHeaders))}`);
            
            const contentType = response.headers.get("content-type");
            const isSSEStream = contentType?.includes("text/event-stream");
            if (isSSEStream) {
              logger.info(`[MCP-GATEWAY] Detected SSE stream response - preserving stream for proxying`);
            }
            
            if (!response.ok) {
              let errorBody = "";
              let errorJson: { error?: string; error_description?: string } | null = null;
              
              if (!isSSEStream) {
                try {
                  errorBody = await response.clone().text();
                  logger.error(`[MCP-GATEWAY] Error response body: ${errorBody.substring(0, 500)}`);
                  
                  // Try to parse as JSON for more detailed error messages
                  try {
                    errorJson = JSON.parse(errorBody);
                  } catch {
                    // Not JSON, that's okay
                  }
                } catch (bodyError) {
                  logger.error(`[MCP-GATEWAY] Could not read error response body:`, bodyError);
                }
              }
              
              if (response.status === 401 || response.status === 403) {
                let errorDetails = "";
                
                if (errorJson?.error === "invalid_token") {
                  if (errorJson.error_description?.includes("Invalid token format")) {
                    errorDetails = `\n\nToken format error: The provided token format is invalid. ` +
                      `you need a valid OAuth2 access token obtained through OAuth flow.`
                  } else {
                    errorDetails = `\n\nToken error: ${errorJson.error_description || errorJson.error}`;
                  }
                } else if (errorJson?.error_description) {
                  errorDetails = `\n\nError details: ${errorJson.error_description}`;
                }
                
                throw new Error(
                  `Authentication failed (${response.status}). ` +
                  `This MCP server requires authentication. ` +
                  `Please configure 'headers' in the MCP proxy config with appropriate credentials (e.g., Authorization header). ` +
                  `For OAuth-based services like Notion, you need to complete the OAuth flow to obtain a valid access token.` +
                  errorDetails
                );
              }
              if (response.status === 404) {
                throw new Error(
                  `Endpoint not found (404). ` +
                  `Please verify the serverUrl is correct: ${serverUrl.toString()}`
                );
              }
              if (response.status === 405) {
                // For GET requests (typically SSE), some servers don't support GET
                // Log a warning but don't fail - POST requests may still work
                if (method === "GET") {
                  logger.warn(
                    `[MCP-GATEWAY] Server does not accept GET requests for ${url}. ` +
                    `This may affect SSE streaming, but POST-based communication may still work.`
                  );
                  // Return the error response instead of throwing - let the SDK handle it
                  // Some MCP servers work with POST-only communication
                  return response;
                } else {
                  throw new Error(
                    `Method not allowed (405). ` +
                    `The server does not accept ${method} requests. ` +
                    `MCP over HTTP typically uses POST for JSON-RPC messages.`
                  );
                }
              }
            }
            
            return response;
          } catch (fetchError) {
            logger.error(`[MCP-GATEWAY] Fetch error for ${url}:`, fetchError);
            
            let errorMessage = "";
            let errorCode = "";
            let underlyingError: Error | null = null;
            
            if (fetchError instanceof Error) {
              errorMessage = fetchError.message || "";
              errorCode = (fetchError as any).code || "";
              
              // Node.js fetch (undici) errors often have a 'cause' property with the underlying error
              if ((fetchError as any).cause instanceof Error) {
                underlyingError = (fetchError as any).cause;
                errorCode = (underlyingError as any).code || errorCode;
                if (underlyingError) {
                  logger.error(`[MCP-GATEWAY] Underlying error: ${underlyingError.message}`);
                  logger.error(`[MCP-GATEWAY] Error code: ${errorCode}`);
                }
              }
              
              const msg = errorMessage.toLowerCase();
              const code = errorCode.toLowerCase();
              const errorStack = fetchError.stack || "";
              
              // Log the full error for debugging
              logger.error(`[MCP-GATEWAY] Error details: ${errorMessage}`);
              logger.error(`[MCP-GATEWAY] Error code: ${errorCode || "none"}`);
              if (errorStack) {
                logger.error(`[MCP-GATEWAY] Error stack: ${errorStack.substring(0, 500)}`);
              }
              
              // Check error code first (more reliable than message)
              if (code === "enotfound" || code === "getaddrinfo failed" || msg.includes("enotfound") || msg.includes("getaddrinfo")) {
                throw new Error(
                  `DNS resolution failed for ${serverUrl.hostname}. ` +
                  `Please verify the serverUrl is correct and the hostname is reachable. ` +
                  `Error code: ${errorCode || "ENOTFOUND"}`
                );
              }
              
              if (code === "econnrefused" || msg.includes("econnrefused")) {
                throw new Error(
                  `Connection refused to ${serverUrl.hostname}:${serverUrl.port || 443}. ` +
                  `The server may be down or not accepting connections. ` +
                  `Error code: ${errorCode || "ECONNREFUSED"}`
                );
              }
              
              if (code === "econnreset" || msg.includes("econnreset")) {
                throw new Error(
                  `Connection reset by ${serverUrl.hostname}. ` +
                  `The server closed the connection unexpectedly. ` +
                  `Error code: ${errorCode || "ECONNRESET"}`
                );
              }
              
              if (code === "etimedout" || msg.includes("etimedout") || msg.includes("timeout")) {
                throw new Error(
                  `Connection timeout to ${serverUrl.hostname}. ` +
                  `The server took too long to respond. ` +
                  `Error code: ${errorCode || "ETIMEDOUT"}`
                );
              }
              
              // Handle SSL/TLS certificate errors
              if (code === "self_signed_cert_in_chain" || 
                  code === "certificate" || 
                  code === "uable_to_verify_leaf_signature" || 
                  msg.includes("self-signed certificate") ||
                  msg.includes("cert") || 
                  msg.includes("ssl") || 
                  msg.includes("tls") ||
                  msg.includes("certificate") || 
                  msg.includes("unable to verify")) {
                const isSelfSigned = code === "self_signed_cert_in_chain" || msg.includes("self-signed");
                
                // Check if SSL verification is disabled via environment variable
                const rejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                const allowInsecure = process.env.MCP_ALLOW_INSECURE === "true" || rejectUnauthorized === "0";
                
                if (isSelfSigned && !allowInsecure) {
                  throw new Error(
                    `SSL/TLS certificate error: self-signed certificate in certificate chain for ${serverUrl.hostname}. ` +
                    `This is often caused by a corporate proxy or firewall intercepting HTTPS connections. ` +
                    `\n\nTo resolve this:\n` +
                    `1. (Recommended) Install the corporate CA certificate:\n` +
                    `   - Export the CA certificate from your corporate proxy/firewall\n` +
                    `   - Set NODE_EXTRA_CA_CERTS=/path/to/ca-cert.pem before starting the server\n` +
                    `   - Or install it in your system's trust store\n` +
                    `\n` +
                    `2. (Development only) Disable SSL verification:\n` +
                    `   - Set NODE_TLS_REJECT_UNAUTHORIZED=0 before starting Node.js\n` +
                    `   - Or set MCP_ALLOW_INSECURE=true\n` +
                    `   - WARNING: This is insecure and should NEVER be used in production\n` +
                    `   - You must restart the server after setting the environment variable\n` +
                    `\n` +
                    `Error code: ${errorCode || "SELF_SIGNED_CERT_IN_CHAIN"}`
                  );
                } else if (isSelfSigned && allowInsecure) {
                  throw new Error(
                    `SSL verification is configured to be disabled, but Node.js is still rejecting the certificate. ` +
                    `The NODE_TLS_REJECT_UNAUTHORIZED=0 or MCP_ALLOW_INSECURE=true environment variable ` +
                    `must be set BEFORE starting Node.js. Please restart the server with the environment variable set.`
                  );
                } else {
                  throw new Error(
                    `SSL/TLS certificate error for ${serverUrl.hostname}. ` +
                    `Please verify the server has a valid certificate. ` +
                    `Error code: ${errorCode || "CERT_ERROR"}`
                  );
                }
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
              
              // Generic fetch failed - provide diagnostic information
              if (msg.includes("fetch failed")) {
                const diagnosticInfo = [
                  `Failed to connect to ${serverUrl.toString()}`,
                  `Hostname: ${serverUrl.hostname}`,
                  `Port: ${serverUrl.port || (serverUrl.protocol === "https:" ? "443" : "80")}`,
                  `Protocol: ${serverUrl.protocol}`,
                  errorCode ? `Error code: ${errorCode}` : "",
                  underlyingError ? `Underlying error: ${underlyingError.message}` : undefined
                ].filter((item): item is string => Boolean(item)).join(", ");
                
                throw new Error(
                  `Network connection failed: ${diagnosticInfo}. ` +
                  `This could be due to: DNS resolution failure, network connectivity issues, ` +
                  `firewall blocking the connection, or the server being unreachable. ` +
                  `Please verify the serverUrl is correct and the endpoint is accessible.`
                );
              }
            }
            
            // Fallback: re-throw with context
            throw new Error(
              `Failed to connect to MCP server at ${serverUrl.toString()}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
            );
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
    try {
      await client.connect(transport as any);
    } catch (connectError) {
      // Some servers may have issues with SSE GET requests but still work for POST
      // Log the error but continue - we can still try to discover tools
      logger.warn(
        `[MCP-GATEWAY] Connection warning for ${proxyConfig.name} (may still work):`,
        connectError instanceof Error ? connectError.message : String(connectError)
      );
      // Continue anyway - listTools might still work
    }

    // Store references
    this.transports.set(proxyConfig.name, transport);
    this.clients.set(proxyConfig.name, client);

    // Discover tools
    // Use a timeout for listTools in case the connection has issues
    const listToolsTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("listTools timeout")), 15000);
    });
    
    let toolsList;
    try {
      toolsList = await Promise.race([
        client.listTools(),
        listToolsTimeout,
      ]);
    } catch (listError) {
      // If listTools fails, try to disconnect and rethrow
      logger.error(`[MCP-GATEWAY] Failed to list tools for ${proxyConfig.name}:`, listError);
      throw listError;
    }
    
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
   * Disconnect a specific MCP server proxy
   * This forces reconnection with updated configuration (e.g., after OAuth)
   */
  async disconnect(proxyName: string): Promise<void> {
    const client = this.clients.get(proxyName);
    if (client) {
      try {
        await client.close();
        this.clients.delete(proxyName);
        logger.info(`[MCP-GATEWAY] Disconnected client for ${proxyName}`);
      } catch (err) {
        logger.warn(`[MCP-GATEWAY] Error closing client ${proxyName}:`, err);
      }
    }

    const transport = this.transports.get(proxyName);
    if (transport) {
      try {
        if (transport && typeof transport === "object" && "close" in transport && typeof transport.close === "function") {
          await transport.close();
        }
        this.transports.delete(proxyName);
        logger.info(`[MCP-GATEWAY] Disconnected transport for ${proxyName}`);
      } catch (err) {
        logger.warn(`[MCP-GATEWAY] Error closing transport ${proxyName}:`, err);
      }
    }

    const process = this.processes.get(proxyName);
    if (process) {
      try {
        process.kill();
        this.processes.delete(proxyName);
        logger.info(`[MCP-GATEWAY] Killed process for ${proxyName}`);
      } catch (err) {
        logger.warn(`[MCP-GATEWAY] Error killing process ${proxyName}:`, err);
      }
    }
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
