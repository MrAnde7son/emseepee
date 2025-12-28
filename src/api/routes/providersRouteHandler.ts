import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { ProviderService } from "../services/providerService.js";
import type { InstallProviderResponse } from "../types.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { logger } from "../../logger.js";

export class ProvidersRouteHandler extends BaseRouteHandler {
  private providerService = new ProviderService();

  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/providers" && method === "GET") {
      await this.handleGetProviders(req, res);
      return true;
    }

    if (path.startsWith("/api/providers/") && path.endsWith("/install") && method === "POST") {
      await this.handleInstallProvider(req, res, path);
      return true;
    }

    if (path.startsWith("/api/providers/") && path.endsWith("/uninstall") && method === "POST") {
      await this.handleUninstallProvider(req, res, path);
      return true;
    }

    return false;
  }

  private async handleGetProviders(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const providers = await this.providerService.getProviders(auth.tenantId || undefined);
      this.sendJSON(res, 200, providers);
    } catch (error) {
      ErrorHandler.handle(error, res, "Get providers error");
    }
  }

  private async handleInstallProvider(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const providerId = path.replace("/api/providers/", "").replace("/install", "");
      const body = await RequestParser.parseBody(req) as Record<string, unknown> | undefined;
      const config = body || {};

      const result = await this.providerService.installProvider(providerId, config, auth.tenantId || undefined);
      this.sendJSON(res, 200, result satisfies InstallProviderResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to install provider";
      if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        this.sendError(res, 401, "Authentication failed. Please check your API key.");
      } else if (errorMessage.includes("requires")) {
        this.sendError(res, 400, errorMessage);
      } else {
        ErrorHandler.handle(error, res, "Install provider error");
      }
    }
  }

  private async handleUninstallProvider(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const providerId = path.replace("/api/providers/", "").replace("/uninstall", "");
      logger.info(`[API] Uninstall provider request: ${providerId}`);

      await this.providerService.uninstallProvider(providerId, auth.tenantId || undefined);
      this.sendJSON(res, 200, { success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to uninstall provider";
      if (errorMessage.includes("not installed")) {
        this.sendError(res, 404, errorMessage);
      } else {
        ErrorHandler.handle(error, res, "Uninstall provider error");
      }
    }
  }
}
