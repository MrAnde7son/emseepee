import { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { getPolicyRules } from "../../config.js";
import type { PolicyRule } from "../../config.js";
import type { Policy } from "../types.js";
import {
  getPolicies,
  addPolicy,
  updatePolicy,
  archivePolicy,
  restorePolicy,
  deletePolicy,
  inferScopeFromCondition,
  extractScopeTarget,
} from "../serverHelpers.js";

export class PoliciesRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/policies" && method === "GET") {
      await this.handleGetPolicies(req, res);
      return true;
    }

    if (path.startsWith("/api/policies/") && method === "GET") {
      const id = path.replace("/api/policies/", "");
      if (!id.includes("/archive") && !id.includes("/restore")) {
        await this.handleGetPolicy(req, res, id);
        return true;
      }
    }

    if (path === "/api/policies" && method === "POST") {
      await this.handleCreatePolicy(req, res);
      return true;
    }

    if (method === "POST" && path.startsWith("/api/policies/") && path.endsWith("/archive")) {
      const id = path.replace("/api/policies/", "").replace("/archive", "");
      await this.handleArchivePolicy(req, res, id);
      return true;
    }

    if (method === "POST" && path.startsWith("/api/policies/") && path.endsWith("/restore")) {
      const id = path.replace("/api/policies/", "").replace("/restore", "");
      await this.handleRestorePolicy(req, res, id);
      return true;
    }

    if (path.startsWith("/api/policies/") && method === "PUT") {
      const id = path.replace("/api/policies/", "");
      await this.handleUpdatePolicy(req, res, id);
      return true;
    }

    if (path.startsWith("/api/policies/") && method === "DELETE") {
      const id = path.replace("/api/policies/", "");
      await this.handleDeletePolicy(req, res, id);
      return true;
    }

    return false;
  }

  private async handleGetPolicies(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const filters = {
        search: url.searchParams.get("q") || undefined,
        scope: url.searchParams.get("scope") || undefined,
        effect: url.searchParams.get("effect") || undefined,
        enabled: url.searchParams.get("status") || undefined,
        priority: url.searchParams.get("priority") || undefined,
      };
      const policies = await getPolicies(includeArchived, page, limit, filters, auth.tenantId || undefined);
      this.sendJSON(res, 200, policies);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to get policies");
    }
  }

  private async handleGetPolicy(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const rules = await getPolicyRules(auth.tenantId || undefined);
      const index = parseInt(id.replace("policy-", ""), 10);
      if (isNaN(index) || index < 0 || index >= rules.length) {
        this.sendError(res, 404, "Policy not found");
        return;
      }
      const rule = rules[index];
      const scope = inferScopeFromCondition(rule.condition);
      const policy = {
        id,
        name: rule.name,
        description: rule.description,
        scope,
        scopeTarget: extractScopeTarget(rule.condition, scope),
        effect: rule.action.operation === "block" ? "deny" : rule.action.operation === "allow" ? "allow" : rule.action.operation === "log" ? "log" : rule.action.operation === "custom" ? "custom" : "webhook",
        customCode: rule.action.operation === "custom" ? rule.action.customCode : undefined,
        priority: rule.priority ?? 0,
        enabled: !(rule.archived ?? false),
        archived: rule.archived ?? false,
        condition: rule.condition,
        stopOnMatch: rule.stopOnMatch,
        actionMessage: rule.action.message,
        webhookUrl: rule.action.webhookUrl,
        webhookMethod: rule.action.webhookMethod,
      };
      this.sendJSON(res, 200, policy);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to get policy");
    }
  }

  private async handleCreatePolicy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const body = await RequestParser.parseBody(req) as Partial<PolicyRule> | Partial<Policy> & { scopeTarget?: string };
      const isPolicyFormat = "effect" in body || "scope" in body || "enabled" in body;
      
      if (isPolicyFormat) {
        const policyData = body as Partial<Policy> & { scopeTarget?: string };
        if (!policyData.name) {
          this.sendError(res, 400, "Missing required field: name");
          return;
        }
      } else {
        const policyRule = body as Partial<PolicyRule>;
        if (!policyRule.condition || !policyRule.action) {
          this.sendError(res, 400, "Missing required fields: condition and action");
          return;
        }
      }
      
      const policy = await addPolicy(body, auth.tenantId || undefined);
      this.sendJSON(res, 201, policy);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to create policy");
    }
  }

  private async handleUpdatePolicy(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const body = await RequestParser.parseBody(req) as Partial<PolicyRule> | Partial<Policy>;
      const isPolicyRuleUpdate = "condition" in body || "action" in body;
      if (isPolicyRuleUpdate && (!body.condition || !body.action)) {
        this.sendError(res, 400, "Missing required fields: condition and action");
        return;
      }
      const policy = await updatePolicy(id, body, auth.tenantId || undefined);
      this.sendJSON(res, 200, policy);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update policy";
      if (errorMessage.includes("not found")) {
        this.sendError(res, 404, errorMessage);
      } else {
        this.sendError(res, 500, errorMessage);
      }
    }
  }

  private async handleArchivePolicy(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      await archivePolicy(id, auth.tenantId || undefined);
      this.sendJSON(res, 200, { success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to archive policy";
      if (errorMessage.includes("not found")) {
        this.sendError(res, 404, errorMessage);
      } else {
        this.sendError(res, 500, errorMessage);
      }
    }
  }

  private async handleRestorePolicy(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      await restorePolicy(id, auth.tenantId || undefined);
      this.sendJSON(res, 200, { success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to restore policy";
      if (errorMessage.includes("not found")) {
        this.sendError(res, 404, errorMessage);
      } else {
        this.sendError(res, 500, errorMessage);
      }
    }
  }

  private async handleDeletePolicy(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      await deletePolicy(id, auth.tenantId || undefined);
      this.sendJSON(res, 204, {});
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete policy";
      if (errorMessage.includes("not found")) {
        this.sendError(res, 404, errorMessage);
      } else {
        this.sendError(res, 500, errorMessage);
      }
    }
  }
}

