import { ServerResponse } from "http";

export class ResponseHelper {
  static sendJSON(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  static sendError(res: ServerResponse, statusCode: number, error: string): void {
    ResponseHelper.sendJSON(res, statusCode, { error });
  }
}

