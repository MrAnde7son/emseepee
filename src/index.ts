
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getEnabledCategories, type ToolCategory, startConfigWatcher } from "./config.js";
import { logger } from "./logger.js";
import { registerToolsByCategory, registerMcpServerProxies } from "./tools/index.js";
import { startApiServer } from "./api/server.js";
import { initializeTelemetry, trackTelemetry } from "./telemetry/index.js";
import { setMcpServer } from "./mcpServerInstance.js";

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

  // Store server instance globally for HTTP access
  setMcpServer(server);

  // For POC: fake agent context. Later you can map this to real identity.
  function getAgentContext() {
    const agentId = "cursor-agent";
    const agentRole = "coder_bot";
    const env = process.env.AGENT_ENV || "dev";
    const tenantId = process.env.TENANT_ID || undefined;
    return { agentId, agentRole, env, tenantId };
  }

  // Configure which categories to enable
  // Can be controlled via environment variable or config
  const enabledCategoriesEnv = process.env.ENABLED_TOOL_CATEGORIES;
  let enabledCategories: ToolCategory[];
  
  if (enabledCategoriesEnv) {
    enabledCategories = enabledCategoriesEnv.split(",") as ToolCategory[];
  } else {
    // Always register built-in tools (file, web, terminal) at startup
    // The HTTP handler will filter by enabled state dynamically
    enabledCategories = ["file", "web", "terminal"];
    const dynamicEnabled = await getEnabledCategories();
    // Also include any dynamically enabled categories (like third_party)
    for (const cat of dynamicEnabled) {
      if (!enabledCategories.includes(cat)) {
        enabledCategories.push(cat);
      }
    }
  }

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
  logger.info("Hakuna Gateway server starting...");
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
    } else {
      // Run migrations for existing databases
      try {
        const { addProviderConfigsTable } = await import("./db/migrations/addProviderConfigs.js");
        await addProviderConfigsTable();
        const { addOwnerColumnToAgents } = await import("./db/migrations/addOwnerToAgents.js");
        await addOwnerColumnToAgents();
        const { addTenantSupport } = await import("./db/migrations/addTenantSupport.js");
        await addTenantSupport();
        const { addMcpOauthClients } = await import("./db/migrations/addMcpOauthClients.js");
        await addMcpOauthClients();
      } catch (error) {
        logger.warn("[DB] Migration failed (non-critical):", error);
        // Continue anyway - migration failures shouldn't block startup
      }

      // Upgrade configuration safely (adds new defaults without overwriting customer config)
      try {
        const { upgradeConfigSafely } = await import("./db/migrate.js");
        await upgradeConfigSafely();
      } catch (error) {
        logger.warn("[DB] Config upgrade failed (non-critical):", error);
        // Continue anyway - upgrade failures shouldn't block startup
      }
    }
    
    // Verify initialization succeeded
    if (!isDatabaseInitialized()) {
      throw new Error("Database initialization completed but isDatabaseInitialized() returns false");
    }
    
    logger.info("[DB] Database initialized and ready");
  } catch (error) {
    logger.error("[DB] Database initialization failed:", error);
    if (error instanceof Error) {
      logger.error("[DB] Error details:", error.message, error.stack);
    }
    // Don't fall back silently - this is critical for events
    throw error;
  }

  // Initialize agent registry (async - loads from database configs)
  try {
    const { initializeAgentRegistry } = await import("./agents/index.js");
    await initializeAgentRegistry();
  } catch (error) {
    logger.warn("[INIT] Failed to initialize agent registry:", error);
  }

  // Start API server after database is initialized
  startApiServer();

  // Initialize telemetry (non-blocking)
  initializeTelemetry().catch((error) => {
    logger.warn("[TELEMETRY] Failed to initialize telemetry:", error);
  });
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
