import { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { evaluatePolicy } from "../../policy.js";
import type { ToolPolicyConfig } from "../../config.js";
import { MicrosoftCopilotIntegration, type Microsoft365CopilotIntegrationConfig } from "../../integrations/microsoft/copilot/MicrosoftCopilotIntegration.js";
import { logger } from "../../logger.js";

export class AgentsRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/agents" && method === "GET") {
      await this.handleGetAgents(req, res);
      return true;
    }

    if (path.startsWith("/api/agents/") && method === "GET") {
      const agentId = path.replace("/api/agents/", "");
      if (agentId && !agentId.includes("/")) {
        await this.handleGetAgent(req, res, agentId);
        return true;
      }
    }

    if (path.startsWith("/api/agents/") && path.endsWith("/invoke") && method === "POST") {
      const agentId = path.replace("/api/agents/", "").replace("/invoke", "");
      if (agentId) {
        await this.handleInvokeAgent(req, res, agentId);
        return true;
      }
    }

    if (path === "/api/agents" && method === "POST") {
      await this.handleCreateAgent(req, res);
      return true;
    }

    if (path.startsWith("/api/agents/") && method === "PUT") {
      const agentId = path.replace("/api/agents/", "");
      if (agentId && !agentId.includes("/")) {
        await this.handleUpdateAgent(req, res, agentId);
        return true;
      }
    }

    if (path.startsWith("/api/agents/") && method === "DELETE") {
      const agentId = path.replace("/api/agents/", "");
      if (agentId && !agentId.includes("/")) {
        await this.handleDeleteAgent(req, res, agentId);
        return true;
      }
    }

    return false;
  }

  private async handleGetAgents(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const { getAgentRegistry } = await import("../../agents/registry.js");
      const registry = getAgentRegistry();
      const providerId = url.searchParams.get("providerId") || undefined;
      const role = url.searchParams.get("role") || undefined;
      const tenantId = url.searchParams.get("tenantId") || undefined;
      
      let agents;
      if (providerId) {
        agents = await registry.getAgentsByProvider(providerId);
      } else if (role) {
        agents = await registry.getAgentsByRole(role);
      } else if (tenantId) {
        agents = await registry.getAgentsByTenant(tenantId);
      } else {
        agents = await registry.listAgents();
      }
      
      this.sendJSON(res, 200, agents);
    } catch (error) {
      ErrorHandler.handle(error, res, "Get agents error");
    }
  }

  private async handleGetAgent(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const { getAgentRegistry } = await import("../../agents/registry.js");
      const registry = getAgentRegistry();
      const agent = await registry.getAgent(agentId);
      
      if (!agent) {
        this.sendError(res, 404, "Agent not found");
        return;
      }
      
      this.sendJSON(res, 200, agent);
    } catch (error) {
      ErrorHandler.handle(error, res, "Get agent error");
    }
  }

  private async handleCreateAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const body = await RequestParser.parseBody(req) as {
        providerId: string;
        name: string;
        description?: string;
        providerNativeId?: string;
        role?: string;
        env?: string;
        tenantId?: string;
        owner?: string;
        metadata?: Record<string, unknown>;
        enabled?: boolean;
      };
      
      if (!body.providerId || !body.name) {
        this.sendError(res, 400, "Provider ID and name are required");
        return;
      }
      
      const { getAgentRegistry } = await import("../../agents/registry.js");
      const registry = getAgentRegistry();
      const agent = await registry.createAgent(body.providerId, {
        name: body.name,
        description: body.description,
        providerNativeId: body.providerNativeId,
        role: body.role,
        env: body.env,
        tenantId: body.tenantId,
        owner: body.owner,
        metadata: body.metadata,
        enabled: body.enabled ?? true,
      });
      
      this.sendJSON(res, 201, agent);
    } catch (error) {
      ErrorHandler.handle(error, res, "Create agent error");
    }
  }

  private async handleUpdateAgent(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const body = await RequestParser.parseBody(req) as Partial<{
        name: string;
        description: string;
        role: string;
        env: string;
        tenantId: string;
        owner: string;
        metadata: Record<string, unknown>;
        enabled: boolean;
      }>;
      
      const { getAgentRegistry } = await import("../../agents/registry.js");
      const registry = getAgentRegistry();
      const agent = await registry.updateAgent(agentId, body);
      
      this.sendJSON(res, 200, agent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update agent";
      const statusCode = errorMessage.includes("not found") ? 404 : 500;
      this.sendError(res, statusCode, errorMessage);
    }
  }

  private async handleDeleteAgent(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const { getAgentRegistry } = await import("../../agents/registry.js");
      const registry = getAgentRegistry();
      await registry.deleteAgent(agentId);
      
      this.sendJSON(res, 200, { success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete agent";
      const statusCode = errorMessage.includes("not found") ? 404 : 500;
      this.sendError(res, statusCode, errorMessage);
    }
  }

  private async handleInvokeAgent(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const body = await RequestParser.parseBody(req) as { userId: string; message: string; context?: unknown };

      if (!body?.message) {
        this.sendError(res, 400, "Message is required to invoke an agent");
        return;
      }

      const { getAgentRegistry } = await import("../../agents/registry.js");
      const registry = getAgentRegistry();
      const agent = await registry.getAgent(agentId);

      if (!agent) {
        this.sendError(res, 404, "Agent not found");
        return;
      }

      if (agent.providerId !== "microsoft_copilot") {
        this.sendError(res, 400, "Agent invocation is only supported for Microsoft Copilot agents");
        return;
      }

      const { getProviderConfig } = await import("../../db/services/providerService.js");
      const providerConfig = await getProviderConfig("microsoft_copilot", auth.tenantId ?? undefined);

      if (!providerConfig) {
        this.sendError(res, 400, "Microsoft Copilot provider is not configured");
        return;
      }

      const toolConfig: ToolPolicyConfig = {
        name: "microsoft_copilot.invoke",
        description: "Invoke a Microsoft Copilot agent via Hakuna",
        allowedRoles: ["admin", "member", "user"],
        sensitivity: "medium",
        category: "third_party",
        enabled: true,
      };

      const decision = await evaluatePolicy({
        tool: toolConfig,
        agentId: agent.id,
        agentRole: agent.role || "assistant",
        env: agent.env || "default",
        args: { message: body.message, context: body.context, userId: body.userId },
        providerId: agent.providerId,
        tenantId: agent.tenantId,
      });

      if (decision.decision === "deny") {
        this.sendError(res, 403, decision.reason || "Invocation blocked by policy");
        return;
      }

      const integration = new MicrosoftCopilotIntegration();
      const result = await integration.invokeCopilotAgent(
        agent,
        { userId: body.userId, message: body.message, context: body.context },
        providerConfig.config as unknown as Microsoft365CopilotIntegrationConfig
      );

      logger.info(`[AGENTS] Invoked Copilot agent ${agent.id} via Hakuna`, {
        conversationId: result.conversationId,
        provider: agent.providerId,
      });

      this.sendJSON(res, 200, result);
    } catch (error) {
      ErrorHandler.handle(error, res, "Invoke agent error");
    }
  }
}

