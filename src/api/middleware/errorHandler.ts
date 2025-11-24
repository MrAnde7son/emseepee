import { ServerResponse } from "http";
import { logger } from "../../logger.js";

export class ErrorHandler {
  static handle(error: unknown, res: ServerResponse, context: string): void {
    logger.error(`[API] ${context}:`, error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
    
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: errorMessage }));
  }
}

