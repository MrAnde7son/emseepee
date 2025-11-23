import { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { BaseRouteHandler } from "./routes/baseRouteHandler.js";
import { AuthRouteHandler } from "./routes/authRouteHandler.js";
import { ProvidersRouteHandler } from "./routes/providersRouteHandler.js";
import { ToolsRouteHandler } from "./routes/toolsRouteHandler.js";
import { PoliciesRouteHandler } from "./routes/policiesRouteHandler.js";
import { EventsRouteHandler } from "./routes/eventsRouteHandler.js";
import { AgentsRouteHandler } from "./routes/agentsRouteHandler.js";
import { McpRouteHandler } from "./routes/mcpRouteHandler.js";
import { TelemetryRouteHandler } from "./routes/telemetryRouteHandler.js";
import { UsersRouteHandler } from "./routes/usersRouteHandler.js";
import { CorsMiddleware } from "./middleware/cors.js";
import { ErrorHandler } from "./middleware/errorHandler.js";
import { logger } from "../logger.js";

export class Router {
  private handlers: BaseRouteHandler[] = [];

  constructor() {
    this.handlers = [
      new AuthRouteHandler(),
      new ProvidersRouteHandler(),
      new ToolsRouteHandler(),
      new PoliciesRouteHandler(),
      new EventsRouteHandler(),
      new AgentsRouteHandler(),
      new McpRouteHandler(),
      new TelemetryRouteHandler(),
      new UsersRouteHandler(),
    ];
  }

  registerHandler(handler: BaseRouteHandler): void {
    this.handlers.push(handler);
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method || "GET";

    CorsMiddleware.apply(res);

    if (method === "OPTIONS") {
      CorsMiddleware.handleOptions(res);
      return;
    }

    try {
      for (const handler of this.handlers) {
        const handled = await handler.handle(req, res, path, method);
        if (handled) {
          return;
        }
      }

      // No handler matched
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      ErrorHandler.handle(error, res, "Router error");
    }
  }
}

