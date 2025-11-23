import { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { getToolRegistry, getMcpServerProxies, isThirdPartyToolConfig, clearConfigCache } from "../../config.js";
import type { ToolInputSchema } from "../../config.js";
import { logger } from "../../logger.js";
import type { Tool, PaginatedResponse } from "../types.js";

export class ToolsRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/tools" && method === "GET") {
      await this.handleGetTools(req, res);
      return true;
    }

    if (path.startsWith("/api/tools/") && method === "GET") {
      const toolId = path.replace("/api/tools/", "");
      if (toolId && !toolId.includes("/")) {
        await this.handleGetToolSchema(req, res, toolId);
        return true;
      }
    }

    if (path.startsWith("/api/tools/") && method === "POST") {
      const pathAfterPrefix = path.replace("/api/tools/", "");
      if (pathAfterPrefix.endsWith("/enable")) {
        const toolId = pathAfterPrefix.replace("/enable", "");
        if (toolId) {
          await this.handleEnableTool(req, res, toolId);
          return true;
        }
      } else if (pathAfterPrefix.endsWith("/disable")) {
        const toolId = pathAfterPrefix.replace("/disable", "");
        if (toolId) {
          await this.handleDisableTool(req, res, toolId);
          return true;
        }
      }
    }

    return false;
  }

  private async handleGetTools(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const searchQuery = url.searchParams.get("q") || undefined;
      const tools = await this.getTools(page, limit, searchQuery);
      this.sendJSON(res, 200, tools);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to get tools");
    }
  }

  private async handleGetToolSchema(req: IncomingMessage, res: ServerResponse, toolId: string): Promise<void> {
    try {
      const toolSchema = await this.getToolInputSchema(toolId);
      this.sendJSON(res, 200, { inputSchema: toolSchema });
    } catch (error) {
      this.sendError(res, 404, error instanceof Error ? error.message : "Tool not found");
    }
  }

  private async handleEnableTool(req: IncomingMessage, res: ServerResponse, toolId: string): Promise<void> {
    try {
      const result = await this.enableTool(toolId);
      if (result.success) {
        this.sendJSON(res, 200, { success: true });
      } else {
        this.sendError(res, 500, result.error || "Failed to enable tool");
      }
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to enable tool");
    }
  }

  private async handleDisableTool(req: IncomingMessage, res: ServerResponse, toolId: string): Promise<void> {
    try {
      const result = await this.disableTool(toolId);
      if (result.success) {
        this.sendJSON(res, 200, { success: true });
      } else {
        this.sendError(res, 500, result.error || "Failed to disable tool");
      }
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to disable tool");
    }
  }

  // Business logic methods (extracted from server.ts)
  private async getTools(
    page: number = 1,
    limit: number = 50,
    searchQuery?: string
  ): Promise<PaginatedResponse<Tool>> {
    const tools: Tool[] = [];
    
    const toolRegistry = await getToolRegistry();
    
    for (const [category, categoryTools] of Object.entries(toolRegistry)) {
      for (const [toolName, toolConfig] of Object.entries(categoryTools)) {
        tools.push({
          id: toolName,
          name: toolName,
          source: category === "third_party" ? "third-party" : "builtin",
          category,
          riskLevel: toolConfig.sensitivity === "high" ? "high" : toolConfig.sensitivity === "medium" ? "medium" : "low",
          installed: toolConfig.enabled === true,
        });
      }
    }
    
    const mcpProxies = await getMcpServerProxies();
    for (const [proxyName, proxyConfig] of Object.entries(mcpProxies)) {
      if (proxyConfig.enabled !== true) {
        tools.push({
          id: `mcp-${proxyName}`,
          name: proxyName,
          source: "mcp",
          providerId: proxyName,
          category: "mcp",
          riskLevel: proxyConfig.defaultPolicy.sensitivity === "high" ? "high" : proxyConfig.defaultPolicy.sensitivity === "medium" ? "medium" : "low",
          installed: false,
        });
        continue;
      }
      
      try {
        const { McpServerProxyManager } = await import("../../tools/handlers/McpServerProxyHandler.js");
        const proxyManager = new McpServerProxyManager();
        
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Connection timeout")), 5000);
          });
          
          const discoveredTools = await Promise.race([
            proxyManager.connectAndDiscoverTools(proxyConfig),
            timeoutPromise,
          ]);
          
          for (const tool of discoveredTools) {
            const sensitivity = proxyConfig.defaultPolicy.sensitivity;
            const isToolDisabled = proxyConfig.disabledTools?.includes(tool.name) ?? false;
            const isInstalled = !isToolDisabled;
            
            tools.push({
              id: `${proxyName}:${tool.name}`,
              name: tool.name,
              source: "mcp",
              providerId: proxyName,
              category: "mcp",
              riskLevel: sensitivity === "high" ? "high" : sensitivity === "medium" ? "medium" : "low",
              installed: isInstalled,
            });
          }
          
          await proxyManager.cleanup();
        } catch (error) {
          logger.warn(`[ToolsRouteHandler] Could not discover tools from MCP proxy ${proxyName}:`, error);
          tools.push({
            id: `mcp-${proxyName}`,
            name: proxyName,
            source: "mcp",
            providerId: proxyName,
            category: "mcp",
            riskLevel: proxyConfig.defaultPolicy.sensitivity === "high" ? "high" : proxyConfig.defaultPolicy.sensitivity === "medium" ? "medium" : "low",
            installed: true,
          });
        }
      } catch (error) {
        logger.warn(`[ToolsRouteHandler] Error loading MCP proxy ${proxyName}:`, error);
        tools.push({
          id: `mcp-${proxyName}`,
          name: proxyName,
          source: "mcp",
          providerId: proxyName,
          category: "mcp",
          riskLevel: proxyConfig.defaultPolicy.sensitivity === "high" ? "high" : proxyConfig.defaultPolicy.sensitivity === "medium" ? "medium" : "low",
          installed: true,
        });
      }
    }
    
    let filteredTools = tools;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredTools = tools.filter((tool) =>
        tool.name.toLowerCase().includes(query) ||
        tool.category?.toLowerCase().includes(query) ||
        tool.providerId?.toLowerCase().includes(query)
      );
    }
    
    const total = filteredTools.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTools = filteredTools.slice(startIndex, endIndex);
    
    return { data: paginatedTools, total, page, limit, totalPages };
  }

  private async getToolInputSchema(toolId: string): Promise<Record<string, { type: string; description?: string; required?: boolean }>> {
    const toolRegistry = await getToolRegistry();
    
    for (const [category, categoryTools] of Object.entries(toolRegistry)) {
      if (categoryTools[toolId]) {
        const toolConfig = categoryTools[toolId];
        
        if (category === "third_party" && isThirdPartyToolConfig(toolConfig) && toolConfig.inputSchema) {
          const schema: Record<string, { type: string; description?: string; required?: boolean }> = {};
          const inputSchema = toolConfig.inputSchema as ToolInputSchema;
          for (const [key, field] of Object.entries(inputSchema)) {
            schema[key] = {
              type: field.type,
              description: field.description,
              required: field.required,
            };
          }
          return schema;
        }
        
        const builtInSchemas: Record<string, Record<string, { type: string; description?: string; required?: boolean }>> = {
          file_read_gateway: {
            path: { type: "string", description: "File path to read (absolute or project-relative)", required: true },
            encoding: { type: "string", description: "File encoding", required: false },
          },
          file_write_gateway: {
            path: { type: "string", description: "File path to write (absolute or project-relative)", required: true },
            contents: { type: "string", description: "Content to write to the file", required: true },
            encoding: { type: "string", description: "File encoding", required: false },
          },
          file_search_gateway: {
            pattern: { type: "string", description: "Search pattern or query string to find files", required: true },
            directory: { type: "string", description: "Directory to search in", required: false },
            fileType: { type: "string", description: "Optional file type filter (e.g., '*.ts', '*.js')", required: false },
            limit: { type: "number", description: "Maximum number of results", required: false },
          },
          web_search_gateway: {
            query: { type: "string", description: "Search query", required: true },
            limit: { type: "number", description: "Maximum number of results", required: false },
          },
          terminal_command: {
            command: { type: "string", description: "The command to execute (e.g., 'ls', 'git', 'npm')", required: true },
            args: { type: "array", description: "Array of command arguments", required: false },
            cwd: { type: "string", description: "Working directory for the command", required: false },
            env: { type: "object", description: "Additional environment variables", required: false },
            timeout: { type: "number", description: "Timeout in milliseconds", required: false },
            shell: { type: "boolean", description: "Whether to execute the command in a shell", required: false },
          },
        };
        
        if (builtInSchemas[toolId]) {
          return builtInSchemas[toolId];
        }
      }
    }
    
    const mcpProxies = await getMcpServerProxies();
    for (const [proxyName, proxyConfig] of Object.entries(mcpProxies)) {
      if (proxyConfig.enabled === true) {
        try {
          const { McpServerProxyManager } = await import("../../tools/handlers/McpServerProxyHandler.js");
          const proxyManager = new McpServerProxyManager();
          const discoveredTools = await proxyManager.connectAndDiscoverTools(proxyConfig);
          
          for (const tool of discoveredTools) {
            if (tool.name === toolId || `${proxyName}:${tool.name}` === toolId) {
              const schema: Record<string, { type: string; description?: string; required?: boolean }> = {};
              
              if (tool.inputSchema && typeof tool.inputSchema === "object" && "properties" in tool.inputSchema) {
                const properties = (tool.inputSchema as any).properties || {};
                const required = (tool.inputSchema as any).required || [];
                
                for (const [key, prop] of Object.entries(properties)) {
                  const propObj = prop as any;
                  schema[key] = {
                    type: propObj.type || "string",
                    description: propObj.description,
                    required: required.includes(key),
                  };
                }
              }
              
              await proxyManager.cleanup();
              return schema;
            }
          }
          
          await proxyManager.cleanup();
        } catch (error) {
          // Continue to next proxy
        }
      }
    }
    
    throw new Error(`Tool not found: ${toolId}`);
  }

  private async enableTool(toolId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { getMcpServerProxiesFromDb, getToolsProxiesFromDb, saveMcpServerProxiesToDb, saveToolsProxiesToDb } = await import("../../db/services/configService.js");
      const mcpProxies = await getMcpServerProxiesFromDb();
      const toolsProxies = await getToolsProxiesFromDb();
      
      if (toolId.includes(":")) {
        const [mcpName, toolName] = toolId.split(":", 2);
        if (!mcpProxies[mcpName]) {
          return { success: false, error: `MCP server ${mcpName} not found` };
        }
        
        const mcpConfig = mcpProxies[mcpName];
        if (mcpConfig.disabledTools) {
          mcpConfig.disabledTools = mcpConfig.disabledTools.filter(t => t !== toolName);
          if (mcpConfig.disabledTools.length === 0) {
            delete mcpConfig.disabledTools;
          }
        }
        
        mcpConfig.enabled = true;
        await saveMcpServerProxiesToDb(mcpProxies);
      } else {
        if (toolsProxies[toolId]) {
          toolsProxies[toolId].enabled = true;
          await saveToolsProxiesToDb(toolsProxies);
        } else {
          return { success: false, error: `Tool ${toolId} not found` };
        }
      }
      
      clearConfigCache();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async disableTool(toolId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { getMcpServerProxiesFromDb, getToolsProxiesFromDb, saveMcpServerProxiesToDb, saveToolsProxiesToDb } = await import("../../db/services/configService.js");
      const mcpProxies = await getMcpServerProxiesFromDb();
      const toolsProxies = await getToolsProxiesFromDb();
      
      if (toolId.includes(":")) {
        const [mcpName, toolName] = toolId.split(":", 2);
        if (!mcpProxies[mcpName]) {
          return { success: false, error: `MCP server ${mcpName} not found` };
        }
        
        const mcpConfig = mcpProxies[mcpName];
        if (!mcpConfig.disabledTools) {
          mcpConfig.disabledTools = [];
        }
        if (!mcpConfig.disabledTools.includes(toolName)) {
          mcpConfig.disabledTools.push(toolName);
        }
        await saveMcpServerProxiesToDb(mcpProxies);
      } else {
        if (toolsProxies[toolId]) {
          toolsProxies[toolId].enabled = false;
          await saveToolsProxiesToDb(toolsProxies);
        } else {
          return { success: false, error: `Tool ${toolId} not found` };
        }
      }
      
      clearConfigCache();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

