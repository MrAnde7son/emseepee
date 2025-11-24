import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { generateToken } from "../auth.js";
import { logger } from "../../logger.js";
import { ErrorHandler } from "../middleware/errorHandler.js";

export class AuthRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path === "/api/auth/register" && method === "POST") {
      await this.handleRegister(req, res);
      return true;
    }

    if (path === "/api/auth/login" && method === "POST") {
      await this.handleLogin(req, res);
      return true;
    }

    if (path === "/api/auth/me" && method === "GET") {
      await this.handleMe(req, res);
      return true;
    }

    return false;
  }

  private async handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await RequestParser.parseBody(req) as { name?: string; email: string; password: string };
      
      if (!body.email || !body.password) {
        this.sendError(res, 400, "Email and password are required");
        return;
      }

      if (body.password.length < 8) {
        this.sendError(res, 400, "Password must be at least 8 characters long");
        return;
      }

      const { createUser, getUserByEmail } = await import("../../db/services/userService.js");
      
      const existingUser = await getUserByEmail(body.email);
      if (existingUser) {
        this.sendError(res, 409, "User with this email already exists");
        return;
      }

      const user = await createUser({
        email: body.email,
        name: body.name,
        password: body.password,
        role: "user",
      });

      const token = generateToken(user.id, user.email, user.role);

      this.sendJSON(res, 201, {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "Registration error");
    }
  }

  private async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await RequestParser.parseBody(req) as { email: string; password: string };
      
      if (!body.email || !body.password) {
        this.sendError(res, 400, "Email and password are required");
        return;
      }

      const { verifyPassword } = await import("../../db/services/userService.js");
      
      const user = await verifyPassword(body.email, body.password);
      if (!user) {
        this.sendError(res, 401, "Invalid email or password");
        return;
      }

      const token = generateToken(user.id, user.email, user.role);

      this.sendJSON(res, 200, {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "Login error");
    }
  }

  private async handleMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const { getUserById } = await import("../../db/services/userService.js");
      const user = await getUserById(auth.userId);
      
      if (!user) {
        this.sendError(res, 404, "User not found");
        return;
      }

      this.sendJSON(res, 200, {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "Auth me error");
    }
  }
}

