
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getEnabledCategories, type ToolCategory, startConfigWatcher } from "./config.js";
import { logger } from "./logger.js";
import { registerToolsByCategory, registerMcpServerProxies } from "./tools/index.js";
import { startApiServer } from "./api/server.js";

async function main() {
  // Set up error handlers after logger is initialized
  // Handle unhandled promise rejections to prevent unexpected output
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled promise rejection:", reason);
    // Don't exit - let the server continue if possible
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
    process.exit(1);
  });

  // Load environment variables from .env file using dynamic import
  // This avoids any potential issues with top-level imports
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch (error) {
    // Silently ignore dotenv errors - .env file is optional
    // Only log if it's a real error (not just missing file)
    if (error instanceof Error && !error.message.includes("ENOENT")) {
      logger.warn("Failed to load .env file:", error.message);
    }
  }
  const server = new McpServer(
    {
      name: "hakuna",
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

  // Start watching config.json for changes (hot-reload)
  startConfigWatcher();

  const transport = new StdioServerTransport();
  logger.info("Hakuna MCP Gateway server starting...");
  await server.connect(transport);
}

// Start API server alongside MCP server
startApiServer();

main().catch((err) => {
  logger.error("Fatal error in MCP gateway server:", err);
  process.exit(1);
});
