import { IncomingMessage } from "http";
import { extractTokenFromHeader, verifyToken, type JWTPayload } from "../auth.js";

export class AuthMiddleware {
  static extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers.authorization;
    return extractTokenFromHeader(authHeader);
  }

  static verifyToken(token: string): JWTPayload | null {
    return verifyToken(token);
  }

  static requireAuth(req: IncomingMessage): { userId: number; email: string; role: string } | null {
    const token = AuthMiddleware.extractToken(req);
    if (!token) {
      return null;
    }

    const payload = AuthMiddleware.verifyToken(token);
    if (!payload) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  }
}

