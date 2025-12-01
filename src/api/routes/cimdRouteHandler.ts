import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { buildCimdDocument } from "../../config/cimd.js";

export class CimdRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/mcp/clients/gateway.json" && method === "GET") {
      this.sendJSON(res, 200, buildCimdDocument());
      return true;
    }

    return false;
  }
}

