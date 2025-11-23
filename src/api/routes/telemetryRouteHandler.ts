import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { logger } from "../../logger.js";

export class TelemetryRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/telemetry/status" && method === "GET") {
      await this.handleGetStatus(req, res);
      return true;
    }

    if (path === "/api/telemetry/config" && method === "GET") {
      await this.handleGetConfig(req, res);
      return true;
    }

    if (path === "/api/telemetry/config" && method === "POST") {
      await this.handleUpdateConfig(req, res);
      return true;
    }

    return false;
  }

  private async handleGetStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const { getTelemetryStatus } = await import("../../telemetry/index.js");
      const status = getTelemetryStatus();
      this.sendJSON(res, 200, status);
    } catch (error) {
      ErrorHandler.handle(error, res, "Get telemetry status error");
    }
  }

  private async handleGetConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const { getTelemetryConfig } = await import("../../telemetry/config.js");
      const config = await getTelemetryConfig();
      const safeConfig = {
        ...config,
        apiKey: config.apiKey ? "***" : undefined,
      };
      this.sendJSON(res, 200, safeConfig);
    } catch (error) {
      ErrorHandler.handle(error, res, "Get telemetry config error");
    }
  }

  private async handleUpdateConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await RequestParser.parseBody(req) as {
        enabled?: boolean;
        mode?: "self-hosted" | "cloud";
        apiKey?: string;
        host?: string;
      };
      
      const {
        updateTelemetryEnabled,
        updateTelemetryMode,
        updatePostHogConfig,
      } = await import("../../telemetry/config.js");
      
      if (body.enabled !== undefined) {
        await updateTelemetryEnabled(body.enabled);
      }
      if (body.mode !== undefined) {
        await updateTelemetryMode(body.mode);
      }
      if (body.apiKey !== undefined || body.host !== undefined) {
        await updatePostHogConfig(body.apiKey, body.host);
      }
      
      const { initializeTelemetry } = await import("../../telemetry/index.js");
      await initializeTelemetry();
      
      this.sendJSON(res, 200, { success: true });
    } catch (error) {
      logger.error("[TelemetryRouteHandler] Update telemetry config error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update telemetry config";
      this.sendError(res, 500, errorMessage);
    }
  }
}

