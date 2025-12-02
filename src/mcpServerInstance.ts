/**
 * Global MCP server instance
 * Used to expose the server over HTTP in addition to stdio
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

let mcpServerInstance: McpServer | null = null;

export function setMcpServer(server: McpServer): void {
  mcpServerInstance = server;
}

export function getMcpServer(): McpServer | null {
  return mcpServerInstance;
}

