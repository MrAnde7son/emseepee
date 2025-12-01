import { IncomingMessage, ServerResponse } from "http";
import { ResponseHelper } from "../middleware/response.js";
import { AuthMiddleware } from "../middleware/auth.js";
import type { RequestClientMetadata } from "../middleware/clientMetadata.js";

export interface AuthContext {
  userId: number;
  email: string;
  role: string;
  tenantId?: string | null;
  clientMetadata?: RequestClientMetadata;
}

export abstract class BaseRouteHandler {
  protected requireAuth(req: IncomingMessage): AuthContext | null {
    return AuthMiddleware.requireAuth(req);
  }

  protected sendJSON(res: ServerResponse, statusCode: number, data: unknown): void {
    ResponseHelper.sendJSON(res, statusCode, data);
  }

  protected sendError(res: ServerResponse, statusCode: number, error: string): void {
    ResponseHelper.sendError(res, statusCode, error);
  }

  abstract handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean>;
}

