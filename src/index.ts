
import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getEnabledCategories, type ToolCategory } from "./config.js";
import { logger } from "./logger.js";
import { registerToolsByCategory, registerMcpServerProxies } from "./tools/index.js";

// Load environment variables from .env file
config();

async function main() {
  const server = new McpServer(
    {
      name: "agent-tools-gateway",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // For POC: fake agent context. Later you can map this to real identity.
  function getAgentContext() {
    const agentId = "cursor-agent";
    const agentRole = "coder_bot";
    const env = process.env.AGENT_ENV || "dev";
    return { agentId, agentRole, env };
  }

  // Configure which categories to enable
  // Can be controlled via environment variable or config
  const enabledCategoriesEnv = process.env.ENABLED_TOOL_CATEGORIES;
  const enabledCategories: ToolCategory[] = enabledCategoriesEnv
    ? (enabledCategoriesEnv.split(",") as ToolCategory[])
    : await getEnabledCategories(); // Default: enable all categories with tools

  logger.info(`[MCP-GATEWAY] Registering tools from categories: ${enabledCategories.join(", ")}`);

  const context = {
    server,
    getAgentContext,
  };

  // Register tools by category
  await registerToolsByCategory(context, enabledCategories);

  // Register MCP server proxies (async - connects to upstream servers)
  await registerMcpServerProxies(context);

  const transport = new StdioServerTransport();
  logger.info("Agent Tools MCP Gateway server starting...");
  await server.connect(transport);
}

main().catch((err) => {
  logger.error("Fatal error in MCP gateway server:", err);
  process.exit(1);
});
