import { createServer } from "http";
import { logger } from "../logger.js";
import { Router } from "./router.js";

const PORT = process.env.GATEWAY_API_PORT ? parseInt(process.env.GATEWAY_API_PORT, 10) : 8000;

// Create router instance
const router = new Router();

/**
 * Handle API routes
 */
async function handleRequest(req: import("http").IncomingMessage, res: import("http").ServerResponse): Promise<void> {
  await router.handleRequest(req, res);
}

/**
 * Start the HTTP server
 */
export function startApiServer(): void {
  const server = createServer(handleRequest);
  
  server.listen(PORT, () => {
    logger.info(`[API] Gateway API server listening on http://localhost:${PORT}`);
  });
  
  server.on("error", (error) => {
    logger.error("[API] Server error:", error);
  });
}
