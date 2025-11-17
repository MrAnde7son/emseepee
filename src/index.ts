
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getEnabledCategories, type ToolCategory } from "./config.js";
import { logger } from "./logger.js";
import { registerToolsByCategory } from "./tools/index.js";

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
    : getEnabledCategories(); // Default: enable all categories with tools

  logger.info(`[MCP-GATEWAY] Registering tools from categories: ${enabledCategories.join(", ")}`);

  // Register tools by category
  registerToolsByCategory(
    {
      server,
      getAgentContext,
    },
    enabledCategories
  );

  const transport = new StdioServerTransport();
  logger.info("Agent Tools MCP Gateway server starting...");
  await server.connect(transport);
}

main().catch((err) => {
  logger.error("Fatal error in MCP gateway server:", err);
  process.exit(1);
});
