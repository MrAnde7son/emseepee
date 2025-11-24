import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { ErrorHandler } from "../middleware/errorHandler.js";

export class UsersRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
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
}

