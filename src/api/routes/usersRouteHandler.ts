import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { logger } from "../../logger.js";
import { MicrosoftCopilotIntegration, type Microsoft365CopilotIntegrationConfig } from "../../integrations/microsoft/copilot/MicrosoftCopilotIntegration.js";

export class UsersRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/users" && method === "GET") {
      await this.handleListUsers(req, res);
      return true;
    }

    if (path.startsWith("/api/users/") && method === "PUT") {
      const userIdStr = path.replace("/api/users/", "");
      const userId = parseInt(userIdStr, 10);
      if (!isNaN(userId)) {
        await this.handleUpdateUser(req, res, userId);
        return true;
      }
    }

    return false;
  }

  private async handleUpdateUser(req: IncomingMessage, res: ServerResponse, userId: number): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      if (auth.userId !== userId) {
        this.sendError(res, 403, "Forbidden: You can only update your own profile");
        return;
      }

      const body = await RequestParser.parseBody(req) as { name?: string | null; password?: string };
      const { updateUser } = await import("../../db/services/userService.js");
      
      const updatedUser = await updateUser(userId, {
        name: body.name !== undefined && body.name !== null ? body.name : undefined,
        password: body.password,
      });

      this.sendJSON(res, 200, {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "Update user error");
    }
  }

  private async handleListUsers(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const { listUsers } = await import("../../db/services/userService.js");
      const users = await listUsers();

      const sanitizedUsers = users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        source: "local" as const,
        active: true,
      }));

      const { getProviderConfig } = await import("../../db/services/providerService.js");
      const providerConfig = await getProviderConfig("microsoft_copilot", auth.tenantId ?? undefined);
      let microsoftUsers: Array<{ id: string; email?: string; name?: string | null; role: string; tenantId?: string | null; createdAt?: string; updatedAt?: string; source: string; active?: boolean }> = [];

      if (providerConfig) {
        try {
          const integration = new MicrosoftCopilotIntegration();
          const config = providerConfig.config as unknown as Microsoft365CopilotIntegrationConfig;
          microsoftUsers = await integration.listUsers(config).then((result) =>
            result.map((user) => ({
              id: user.id,
              email: user.email,
              name: user.displayName,
              role: user.active === false ? "disabled" : "member",
              tenantId: (typeof config.tenantId === "string" ? config.tenantId : null) as string | null,
              source: user.source,
              active: user.active,
            }))
          );
        } catch (integrationError) {
          logger.warn("[USERS] Failed to fetch Microsoft 365 users:", integrationError);
        }
      }

      this.sendJSON(res, 200, [...sanitizedUsers, ...microsoftUsers]);
    } catch (error) {
      ErrorHandler.handle(error, res, "List users error");
    }
  }
}

