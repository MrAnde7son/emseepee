import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import {
  createOrUpdateIdpConnection,
  deleteIdpConnection,
  getIdpConnectionsByTenant,
} from "../../db/services/idpConnectionService.js";
import type { IdpType } from "../../integrations/idp/types.js";
import { RequestParser } from "../middleware/requestParser.js";

export class IdpRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/idp/connections" && method === "GET") {
      await this.handleListConnections(req, res);
      return true;
    }

    if (path === "/api/idp/connections" && method === "POST") {
      await this.handleCreateOrUpdate(req, res);
      return true;
    }

    if (path.startsWith("/api/idp/connections/") && method === "DELETE") {
      const id = Number(path.replace("/api/idp/connections/", ""));
      if (!Number.isNaN(id)) {
        await this.handleDelete(req, res, id);
        return true;
      }
    }

    return false;
  }

  private async handleListConnections(req: IncomingMessage, res: ServerResponse) {
    const auth = this.requireAuth(req);
    if (!auth?.tenantId) {
      this.sendError(res, 401, "Unauthorized");
      return;
    }

    try {
      const connections = await getIdpConnectionsByTenant(auth.tenantId);
      this.sendJSON(res, 200, { connections });
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to fetch IdP connections");
    }
  }

  private async handleCreateOrUpdate(req: IncomingMessage, res: ServerResponse) {
    const auth = this.requireAuth(req);
    if (!auth?.tenantId) {
      this.sendError(res, 401, "Unauthorized");
      return;
    }

    try {
      const body = await RequestParser.parseBody(req) as { type: IdpType; issuer: string; clientId: string; clientSecret?: string; metadata?: Record<string, unknown> };
      if (!body?.type || !body.issuer || !body.clientId) {
        this.sendError(res, 400, "Missing required fields");
        return;
      }

      const connection = await createOrUpdateIdpConnection({
        tenantId: auth.tenantId,
        type: body.type,
        issuer: body.issuer,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        metadata: body.metadata,
      });
      this.sendJSON(res, 200, { connection });
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to save IdP connection");
    }
  }

  private async handleDelete(req: IncomingMessage, res: ServerResponse, id: number) {
    const auth = this.requireAuth(req);
    if (!auth?.tenantId) {
      this.sendError(res, 401, "Unauthorized");
      return;
    }

    try {
      await deleteIdpConnection(id, auth.tenantId);
      this.sendJSON(res, 200, { success: true });
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to delete IdP connection");
    }
  }
}
