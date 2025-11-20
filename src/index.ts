
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

  // Environment variables and database are already initialized
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

// Initialize database and start API server before main()
async function initialize() {
  // Load environment variables first
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch (error) {
    if (error instanceof Error && !error.message.includes("ENOENT")) {
      logger.warn("Failed to load .env file:", error.message);
    }
  }

  // Initialize database
  try {
    const { initializeDatabase, isDatabaseInitialized } = await import("./db/connection.js");
    const { createSchema, schemaExists } = await import("./db/schema.js");
    
    await initializeDatabase();
    const exists = await schemaExists();
    if (!exists) {
      await createSchema();
    }
    
    // Verify initialization succeeded
    const isInit = isDatabaseInitialized();
    if (!isInit) {
      throw new Error("Database initialization completed but isDatabaseInitialized() returns false");
    }
    
    logger.info("[DB] Database initialized and ready");
    logger.info(`[DB] Verification: isDatabaseInitialized() = ${isInit}`);
  } catch (error) {
    logger.error("[DB] Database initialization failed:", error);
    if (error instanceof Error) {
      logger.error("[DB] Error details:", error.message, error.stack);
    }
    // Don't fall back silently - this is critical for events
    throw error;
  }

  // Start API server after database is initialized
  startApiServer();
}

// Initialize and start API server, then run main
initialize().then(() => {
  main().catch((err) => {
    logger.error("Fatal error in MCP gateway server:", err);
    process.exit(1);
  });
}).catch((err) => {
  logger.error("Fatal error during initialization:", err);
  process.exit(1);
});
