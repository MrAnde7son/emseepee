import { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { getEvents } from "../serverHelpers.js";

export class EventsRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/events" && method === "GET") {
      await this.handleGetEvents(req, res);
      return true;
    }

    return false;
  }

  private async handleGetEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      
      if (url.searchParams.get("filterOptions") === "true") {
        const { getEventFilterOptions } = await import("../../db/services/eventService.js");
        const filterOptions = await getEventFilterOptions(auth.tenantId || undefined);
        this.sendJSON(res, 200, filterOptions);
        return;
      }
      
      const searchQuery = url.searchParams.get("q") || undefined;
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const filters = {
        decisions: url.searchParams.get("decision")?.split(",").filter(Boolean),
        providers: url.searchParams.get("provider") ? [url.searchParams.get("provider")!] : undefined,
        agents: url.searchParams.get("agent") ? [url.searchParams.get("agent")!] : undefined,
        tools: url.searchParams.get("tool") ? [url.searchParams.get("tool")!] : undefined,
        riskLevels: url.searchParams.get("risk")?.split(",").filter(Boolean),
      };
      const events = await getEvents(searchQuery, page, limit, filters, auth.tenantId || undefined);
      this.sendJSON(res, 200, events);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : "Failed to get events");
    }
  }
}

