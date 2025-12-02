import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { logger } from "../../logger.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { getMcpServer } from "../../mcpServerInstance.js";
import { getTool, getAllTools } from "../../mcpToolRegistry.js";
import { getToolRegistry } from "../../config.js";
import { runWithAgentContextAsync, createAgentContextFromAuth } from "../../tools/agentContext.js";

/**
 * Route handler for MCP protocol over HTTP/SSE
 * Exposes the MCP server so Cursor can connect via HTTP instead of stdio
 */
export class McpProtocolRouteHandler extends BaseRouteHandler {

  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    // Handle MCP protocol endpoints
    // Cursor expects endpoints like /mcp or /sse for SSE connections
    if ((path === "/mcp" || path === "/sse") && method === "POST") {
      await this.handleMcpRequest(req, res);
      return true;
    }

    // Handle SSE connection initiation (GET request)
    if ((path === "/mcp" || path === "/sse") && method === "GET") {
      await this.handleSseConnection(req, res);
      return true;
    }

    return false;
  }

  private async handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const mcpServer = getMcpServer();
      if (!mcpServer) {
        this.sendError(res, 503, "MCP server not initialized");
        return;
      }

      // Extract tenant ID from auth if available, otherwise try to infer from cached tools
      const auth = this.requireAuth(req);
      let tenantId = auth?.tenantId || undefined;
      
      // If still no tenant ID, try to get from URL query parameter (for testing/debugging)
      if (!tenantId) {
        const url = new URL(req.url || "/", `http://${req.headers.host}`);
        const tenantParam = url.searchParams.get("tenant");
        if (tenantParam) {
          tenantId = tenantParam;
          logger.info(`[MCP-PROTOCOL] Using tenant ID from query parameter: ${tenantId}`);
        }
      }

      const body = await this.readBody(req);
      let request: any;
      
      try {
        request = JSON.parse(body);
      } catch (error) {
        this.sendError(res, 400, "Invalid JSON in request body");
        return;
      }

      // Handle JSON-RPC request
      // Use the MCP server's request handler if available
      // Otherwise, handle common MCP methods manually
      const response = await this.handleMcpMethod(request, mcpServer, tenantId, req);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (error) {
      ErrorHandler.handle(error, res, "MCP protocol error");
    }
  }

  private async handleSseConnection(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const mcpServer = getMcpServer();
      if (!mcpServer) {
        this.sendError(res, 503, "MCP server not initialized");
        return;
      }

      // Set up SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      });

      // Send initial connection message
      res.write(": connected\n\n");

      // For SSE, we'd need to maintain a bidirectional connection
      // This is more complex - for now, we'll support POST requests
      // Cursor can fall back to POST if SSE isn't fully supported
      
      // Keep connection alive
      req.on("close", () => {
        logger.info("[MCP-PROTOCOL] SSE connection closed");
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "SSE connection error");
    }
  }

  private async handleMcpMethod(request: any, mcpServer: any, tenantId?: string, req?: IncomingMessage): Promise<any> {
    const { method, params, id } = request;

    try {
      // Try to use the server's request handler if available
      // The MCP SDK server should handle JSON-RPC requests
      if (mcpServer && typeof mcpServer.handleRequest === "function") {
        try {
          logger.info(`[MCP-PROTOCOL] Attempting to use server.handleRequest for method: ${method}`);
          const response = await mcpServer.handleRequest(request);
          return response;
        } catch (error) {
          logger.warn("[MCP-PROTOCOL] Server handleRequest failed, falling back to manual handling:", error);
        }
      }
      
      // Also try using the server's message handler if available
      if (mcpServer && typeof mcpServer.handleMessage === "function") {
        try {
          logger.info(`[MCP-PROTOCOL] Attempting to use server.handleMessage for method: ${method}`);
          const response = await mcpServer.handleMessage(request);
          logger.info(`[MCP-PROTOCOL] Server.handleMessage succeeded for ${method}`);
          return response;
        } catch (error) {
          logger.warn("[MCP-PROTOCOL] Server handleMessage failed:", error);
        }
      }

      // Fallback: handle common MCP methods manually
      switch (method) {
        case "initialize": {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: "hakuna",
                version: "0.1.0",
              },
            },
          };
        }

        case "tools/list": {
          const tools = await this.getToolsList(mcpServer, tenantId);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              tools,
            },
          };
        }

        case "tools/call": {
          const { name, arguments: args } = params || {};
          if (!name) {
            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32602,
                message: "Invalid params: tool name required",
              },
            };
          }

          // Extract auth to create agent context
          let agentContext;
          if (req) {
            const auth = this.requireAuth(req);
            if (auth) {
              agentContext = createAgentContextFromAuth(auth);
            } else {
              // Fallback: create minimal context from available info
              agentContext = {
                agentId: "anonymous",
                agentRole: "user",
                env: process.env.AGENT_ENV || "dev",
                tenantId: tenantId || undefined,
              };
            }
          } else {
            // No request available (shouldn't happen, but handle gracefully)
            agentContext = {
              agentId: "system",
              agentRole: "system",
              env: process.env.AGENT_ENV || "dev",
              tenantId: tenantId || undefined,
            };
          }

          // Execute tool with agent context stored in AsyncLocalStorage
          const result = await runWithAgentContextAsync(agentContext, () => {
            return this.callTool(mcpServer, name, args || {});
          });

          return {
            jsonrpc: "2.0",
            id,
            result,
          };
        }

        default:
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
      };
    }
  }

  private async getToolsList(mcpServer: any, tenantId?: string): Promise<any[]> {
    const allEnabledTools: any[] = [];
    
    try {
      // If no tenant ID provided, try to infer from cached tools
      let effectiveTenantId = tenantId;
      if (!effectiveTenantId) {
        // Try to find tenant that has cached tools (for MCP proxies)
        // This ensures we use the same tenant that was used when tools were cached
        const { toolCache } = await import("../../tools/toolCache.js");
        const { getMcpServerProxies } = await import("../../config.js");
        
        // Get all tenants that have cached tools
        const tenantsWithCache = toolCache.getAllTenantsWithCachedTools();
        logger.info(`[MCP-PROTOCOL] Tenants with cached tools: ${tenantsWithCache.join(", ")}`);
        
        // For each tenant, check if they have enabled proxies with cached tools
        for (const tenantKey of tenantsWithCache) {
          const testTenant = tenantKey === "default" ? undefined : tenantKey;
          const testProxies = await getMcpServerProxies(testTenant);
          
          // Check if any enabled proxy has cached tools for this tenant
          for (const [proxyName, proxyConfig] of Object.entries(testProxies)) {
            if (proxyConfig.enabled === true) {
              const cachedTools = toolCache.getTools(proxyName, testTenant);
              if (cachedTools && cachedTools.length > 0) {
                effectiveTenantId = testTenant || undefined;
                logger.info(`[MCP-PROTOCOL] Found enabled proxy ${proxyName} with cached tools for tenant ${tenantKey}, using that tenant`);
                break;
              }
            }
          }
          if (effectiveTenantId) break;
        }
        
        if (!effectiveTenantId) {
          logger.warn(`[MCP-PROTOCOL] No tenant found with enabled proxies and cached tools`);
        }
      }
      
      logger.info(`[MCP-PROTOCOL] Getting tools list (tenantId: ${effectiveTenantId || "undefined"})`);
      
      // Get tool registry to check enabled state
      const registry = await getToolRegistry(effectiveTenantId);
      
      // Collect enabled tools from built-in categories (file, web, terminal)
      for (const category of ["file", "web", "terminal"] as const) {
        const categoryTools = registry[category];
        for (const [toolName, toolConfig] of Object.entries(categoryTools)) {
          // Only include tools that are explicitly enabled (enabled === true)
          if (toolConfig.enabled === true) {
            // Get the tool handler from HTTP registry
            const httpTool = getTool(toolName);
            if (httpTool) {
              allEnabledTools.push({
                name: toolName,
                description: toolConfig.description,
                inputSchema: httpTool.inputSchema,
              });
              logger.info(`[MCP-PROTOCOL] Added enabled built-in tool: ${toolName}`);
            } else {
              logger.warn(`[MCP-PROTOCOL] Tool ${toolName} is enabled but not found in HTTP registry`);
            }
          }
        }
      }
      
      // Add MCP server proxy tools (third-party tools)
      const { getMcpServerProxies } = await import("../../config.js");
      const { toolCache } = await import("../../tools/toolCache.js");
      const mcpProxies = await getMcpServerProxies(effectiveTenantId);
      
      logger.info(`[MCP-PROTOCOL] Found ${Object.keys(mcpProxies).length} MCP proxies for tenant ${effectiveTenantId || "default"}`);
      
      for (const [proxyName, proxyConfig] of Object.entries(mcpProxies)) {
        logger.info(`[MCP-PROTOCOL] Checking MCP proxy ${proxyName} (enabled: ${proxyConfig.enabled})`);
        // Only include enabled MCP proxies
        if (proxyConfig.enabled === true) {
          try {
            // Get cached tools for this proxy - try with effective tenant ID first, then fallback to undefined
            let cachedTools = toolCache.getTools(proxyName, effectiveTenantId);
            if (!cachedTools && effectiveTenantId) {
              // Fallback: try without tenant ID (for backwards compatibility)
              cachedTools = toolCache.getTools(proxyName, undefined);
            }
            logger.info(`[MCP-PROTOCOL] Cached tools for ${proxyName}: ${cachedTools ? cachedTools.length : 0}`);
            if (cachedTools && cachedTools.length > 0) {
              // Filter out disabled tools
              for (const tool of cachedTools) {
                const isToolDisabled = proxyConfig.disabledTools?.includes(tool.name) ?? false;
                if (!isToolDisabled) {
                  // Use cached tool data directly (MCP proxy tools may not be in HTTP registry)
                  allEnabledTools.push({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                  });
                  logger.info(`[MCP-PROTOCOL] Added MCP proxy tool: ${tool.name} (from ${proxyName})`);
                } else {
                  logger.info(`[MCP-PROTOCOL] Skipping disabled MCP proxy tool: ${tool.name} (from ${proxyName})`);
                }
              }
            } else {
              logger.warn(`[MCP-PROTOCOL] No cached tools found for MCP proxy ${proxyName} (tenantId: ${effectiveTenantId || "undefined"})`);
            }
          } catch (error) {
            logger.warn(`[MCP-PROTOCOL] Failed to get tools from MCP proxy ${proxyName}:`, error);
          }
        }
      }
      
      logger.info(`[MCP-PROTOCOL] Returning ${allEnabledTools.length} enabled tools: ${allEnabledTools.map(t => t.name).join(", ")}`);
      return allEnabledTools;
    } catch (error) {
      logger.error("[MCP-PROTOCOL] Failed to get tools list:", error);
      return [];
    }
  }

  private async callTool(mcpServer: any, name: string, args: Record<string, unknown>): Promise<any> {
    // Try to get tool from HTTP registry first
    const registeredTool = getTool(name);
    if (registeredTool) {
      try {
        const result = await registeredTool.handler(args);
        // Convert result to MCP format
        if (result && typeof result === "object" && "content" in result) {
          return result;
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: false,
        };
      } catch (error) {
        logger.error(`[MCP-PROTOCOL] Failed to call tool ${name}:`, error);
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    }

    // Fallback: Try to call the tool through the server's handlers
    try {
      const tools = (mcpServer as any)._tools || (mcpServer as any).tools;
      if (tools && tools[name] && typeof tools[name].handler === "function") {
        const result = await tools[name].handler(args);
        return {
          content: Array.isArray(result?.content) ? result.content : [{ type: "text", text: JSON.stringify(result) }],
          isError: result?.isError || false,
        };
      }
    } catch (error) {
      logger.error(`[MCP-PROTOCOL] Failed to call tool ${name}:`, error);
      throw error;
    }
    
    throw new Error(`Tool ${name} not found`);
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        resolve(body);
      });
      req.on("error", reject);
    });
  }
}

