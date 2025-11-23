import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { getMcpServerProxies } from "../../config.js";
import { clearConfigCache } from "../../config.js";
import type { Sensitivity } from "../../config.js";
import { ErrorHandler } from "../middleware/errorHandler.js";

export class McpRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path.startsWith("/api/mcp/") && method === "POST") {
      const pathAfterPrefix = path.replace("/api/mcp/", "");
      if (pathAfterPrefix.endsWith("/enable")) {
        const mcpId = pathAfterPrefix.replace("/enable", "");
        if (mcpId) {
          await this.handleEnableMcpServer(req, res, mcpId);
          return true;
        }
      } else if (pathAfterPrefix.endsWith("/disable")) {
        const mcpId = pathAfterPrefix.replace("/disable", "");
        if (mcpId) {
          await this.handleDisableMcpServer(req, res, mcpId);
          return true;
        }
      }
    }

    if (path.startsWith("/api/mcp/") && method === "PUT") {
      const pathAfterPrefix = path.replace("/api/mcp/", "");
      if (pathAfterPrefix && !pathAfterPrefix.endsWith("/enable") && !pathAfterPrefix.endsWith("/disable")) {
        const mcpId = pathAfterPrefix.replace(/\/+$/, "");
        if (mcpId && mcpId.length > 0) {
          await this.handleUpdateMcpServer(req, res, mcpId);
          return true;
        }
      }
    }

    if (path.startsWith("/api/mcp/") && method === "GET") {
      const pathAfterPrefix = path.replace("/api/mcp/", "");
      if (pathAfterPrefix && !pathAfterPrefix.endsWith("/enable") && !pathAfterPrefix.endsWith("/disable")) {
        const mcpId = pathAfterPrefix.replace(/\/+$/, "");
        if (mcpId) {
          await this.handleGetMcpServer(req, res, mcpId);
          return true;
        }
      }
    }

    return false;
  }

  private async handleEnableMcpServer(req: IncomingMessage, res: ServerResponse, mcpId: string): Promise<void> {
    try {
      const result = await this.enableMcpServer(mcpId);
      if (result.success) {
        this.sendJSON(res, 200, { success: true });
      } else {
        this.sendError(res, 500, result.error || "Failed to enable MCP server");
      }
    } catch (error) {
      ErrorHandler.handle(error, res, "Enable MCP server error");
    }
  }

  private async handleDisableMcpServer(req: IncomingMessage, res: ServerResponse, mcpId: string): Promise<void> {
    try {
      const result = await this.disableMcpServer(mcpId);
      if (result.success) {
        this.sendJSON(res, 200, { success: true });
      } else {
        this.sendError(res, 500, result.error || "Failed to disable MCP server");
      }
    } catch (error) {
      ErrorHandler.handle(error, res, "Disable MCP server error");
    }
  }

  private async handleGetMcpServer(req: IncomingMessage, res: ServerResponse, mcpId: string): Promise<void> {
    try {
      const mcpDetails = await this.getMcpServerDetails(mcpId);
      if (mcpDetails) {
        this.sendJSON(res, 200, mcpDetails);
      } else {
        this.sendError(res, 404, `MCP server ${mcpId} not found`);
      }
    } catch (error) {
      ErrorHandler.handle(error, res, "Get MCP server error");
    }
  }

  private async handleUpdateMcpServer(req: IncomingMessage, res: ServerResponse, mcpId: string): Promise<void> {
    try {
      const body = await RequestParser.parseBody(req) as Partial<{
        name: string;
        description?: string;
        command?: string;
        args?: string[];
        serverUrl?: string;
        headers?: Record<string, string>;
        env?: Record<string, string>;
        cwd?: string;
        enabled?: boolean;
        icon?: string;
        defaultPolicy: {
          allowedRoles: string[];
          sensitivity: Sensitivity;
        };
        disabledTools?: string[];
      }>;
      const updated = await this.updateMcpServerConfig(mcpId, body);
      this.sendJSON(res, 200, updated);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update MCP server configuration";
      if (errorMessage.includes("not found")) {
        this.sendError(res, 404, errorMessage);
      } else {
        this.sendError(res, 400, errorMessage);
      }
    }
  }

  private async enableMcpServer(mcpId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { getMcpServerProxiesFromDb, saveMcpServerProxiesToDb } = await import("../../db/services/configService.js");
      const mcpProxies = await getMcpServerProxiesFromDb();
      
      if (!mcpProxies[mcpId]) {
        return { success: false, error: `MCP server ${mcpId} not found` };
      }
      
      mcpProxies[mcpId].enabled = true;
      await saveMcpServerProxiesToDb(mcpProxies);
      clearConfigCache();
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async disableMcpServer(mcpId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { getMcpServerProxiesFromDb, saveMcpServerProxiesToDb } = await import("../../db/services/configService.js");
      const mcpProxies = await getMcpServerProxiesFromDb();
      
      if (!mcpProxies[mcpId]) {
        return { success: false, error: `MCP server ${mcpId} not found` };
      }
      
      mcpProxies[mcpId].enabled = false;
      await saveMcpServerProxiesToDb(mcpProxies);
      clearConfigCache();
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getMcpServerDetails(mcpId: string): Promise<{
    id: string;
    name: string;
    description?: string;
    command?: string;
    args?: string[];
    serverUrl?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    cwd?: string;
    enabled?: boolean;
    icon?: string;
    defaultPolicy: {
      allowedRoles: string[];
      sensitivity: string;
    };
    disabledTools?: string[];
  } | null> {
    const mcpProxies = await getMcpServerProxies();
    const proxyConfig = mcpProxies[mcpId];
    
    if (!proxyConfig) {
      return null;
    }
    
    return {
      id: mcpId,
      name: proxyConfig.name,
      description: proxyConfig.description,
      command: proxyConfig.command,
      args: proxyConfig.args,
      serverUrl: proxyConfig.serverUrl,
      headers: proxyConfig.headers,
      env: proxyConfig.env,
      cwd: proxyConfig.cwd,
      enabled: proxyConfig.enabled,
      icon: proxyConfig.icon,
      defaultPolicy: {
        allowedRoles: proxyConfig.defaultPolicy.allowedRoles,
        sensitivity: proxyConfig.defaultPolicy.sensitivity,
      },
      disabledTools: proxyConfig.disabledTools,
    };
  }

  private async updateMcpServerConfig(
    mcpId: string,
    updates: Partial<{
      name: string;
      description?: string;
      command?: string;
      args?: string[];
      serverUrl?: string;
      headers?: Record<string, string>;
      env?: Record<string, string>;
      cwd?: string;
      enabled?: boolean;
      icon?: string;
      defaultPolicy: {
        allowedRoles: string[];
        sensitivity: Sensitivity;
      };
      disabledTools?: string[];
    }>
  ): Promise<{
    id: string;
    name: string;
    description?: string;
    command?: string;
    args?: string[];
    serverUrl?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    cwd?: string;
    enabled?: boolean;
    icon?: string;
    defaultPolicy: {
      allowedRoles: string[];
      sensitivity: Sensitivity;
    };
    disabledTools?: string[];
  }> {
    const { getMcpServerProxiesFromDb, saveMcpServerProxiesToDb } = await import("../../db/services/configService.js");
    const mcpProxies = await getMcpServerProxiesFromDb();
    
    if (!mcpProxies[mcpId]) {
      throw new Error(`MCP server ${mcpId} not found`);
    }
    
    const existingConfig = mcpProxies[mcpId];
    
    if (updates.name !== undefined) existingConfig.name = updates.name;
    if (updates.description !== undefined) existingConfig.description = updates.description;
    if (updates.command !== undefined) existingConfig.command = updates.command;
    if (updates.args !== undefined) existingConfig.args = updates.args;
    if (updates.serverUrl !== undefined) existingConfig.serverUrl = updates.serverUrl;
    if (updates.headers !== undefined) existingConfig.headers = updates.headers;
    if (updates.env !== undefined) existingConfig.env = updates.env;
    if (updates.cwd !== undefined) existingConfig.cwd = updates.cwd;
    if (updates.enabled !== undefined) existingConfig.enabled = updates.enabled;
    if (updates.icon !== undefined) existingConfig.icon = updates.icon;
    if (updates.defaultPolicy !== undefined) existingConfig.defaultPolicy = updates.defaultPolicy;
    if (updates.disabledTools !== undefined) existingConfig.disabledTools = updates.disabledTools;
    
    await saveMcpServerProxiesToDb(mcpProxies);
    clearConfigCache();
    
    return {
      id: mcpId,
      name: existingConfig.name,
      description: existingConfig.description,
      command: existingConfig.command,
      args: existingConfig.args,
      serverUrl: existingConfig.serverUrl,
      headers: existingConfig.headers,
      env: existingConfig.env,
      cwd: existingConfig.cwd,
      enabled: existingConfig.enabled,
      icon: existingConfig.icon,
      defaultPolicy: {
        allowedRoles: existingConfig.defaultPolicy.allowedRoles,
        sensitivity: existingConfig.defaultPolicy.sensitivity,
      },
      disabledTools: existingConfig.disabledTools,
    };
  }
}

