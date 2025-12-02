import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { logger } from "../../logger.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { getMcpServer } from "../../mcpServerInstance.js";
import { getTool, getAllTools } from "../../mcpToolRegistry.js";
import { getToolRegistry } from "../../config.js";

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
      const response = await this.handleMcpMethod(request, mcpServer);
      
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

  private async handleMcpMethod(request: any, mcpServer: any): Promise<any> {
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
          const tools = await this.getToolsList(mcpServer);
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

          const result = await this.callTool(mcpServer, name, args || {});
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

  private async getToolsList(mcpServer: any): Promise<any[]> {
    // First, try to get enabled tools dynamically from config
    try {
      const registry = await getToolRegistry();
      const allEnabledTools: any[] = [];
      
      // Collect enabled tools from all categories
      for (const category of ["file", "web", "terminal"] as const) {
        const categoryTools = registry[category];
        for (const [toolName, toolConfig] of Object.entries(categoryTools)) {
          // Tools are enabled by default unless explicitly disabled
          if (toolConfig.enabled !== false) {
            // Get the tool handler from HTTP registry or MCP server
            const httpTool = getTool(toolName);
            if (httpTool) {
              allEnabledTools.push({
                name: toolName,
                description: toolConfig.description,
                inputSchema: httpTool.inputSchema,
              });
            } else {
              // Tool not in HTTP registry, try to get from MCP server
              try {
                const tools = (mcpServer as any)?._tools || (mcpServer as any)?.tools;
                if (tools && tools[toolName]) {
                  const mcpTool = tools[toolName];
                  allEnabledTools.push({
                    name: toolName,
                    description: toolConfig.description,
                    inputSchema: mcpTool.inputSchema || mcpTool.schema?.inputSchema || {},
                  });
                }
              } catch (error) {
                logger.warn(`[MCP-PROTOCOL] Could not get tool ${toolName} from MCP server:`, error);
              }
            }
          }
        }
      }
      
      if (allEnabledTools.length > 0) {
        logger.info(`[MCP-PROTOCOL] Returning ${allEnabledTools.length} enabled tools from config: ${allEnabledTools.map(t => t.name).join(", ")}`);
        return allEnabledTools;
      }
    } catch (error) {
      logger.warn("[MCP-PROTOCOL] Failed to get tools from config, falling back to registry:", error);
    }
    
    // Fallback: Get tools from the HTTP registry
    const registeredTools = getAllTools();
    logger.info(`[MCP-PROTOCOL] HTTP registry has ${registeredTools.length} tools`);
    
    if (registeredTools.length > 0) {
      const toolsList = registeredTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
      logger.info(`[MCP-PROTOCOL] Returning ${toolsList.length} tools from HTTP registry: ${toolsList.map(t => t.name).join(", ")}`);
      return toolsList;
    }

    // Fallback: Try to access tools from the server's internal state
    try {
      const tools = (mcpServer as any)._tools || (mcpServer as any).tools;
      if (tools && typeof tools === "object") {
        return Object.entries(tools).map(([name, tool]: [string, any]) => ({
          name,
          description: tool.description || "",
          inputSchema: tool.inputSchema || {},
        }));
      }
    } catch (error) {
      logger.warn("[MCP-PROTOCOL] Failed to get tools list:", error);
    }
    
    return [];
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

