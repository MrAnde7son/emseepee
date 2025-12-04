
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getEnabledCategories, type ToolCategory, startConfigWatcher } from "./config.js";
import { logger } from "./logger.js";
import { registerToolsByCategory, registerMcpServerProxies } from "./tools/index.js";
import { startApiServer } from "./api/server.js";
import { initializeTelemetry, trackTelemetry } from "./telemetry/index.js";
import { setMcpServer, getMcpServer } from "./mcpServerInstance.js";

async function main() {
  logger.info("[MCP-GATEWAY] Starting main() function - tool registration will begin");
  
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

  // Reuse the server instance from initialize() if it exists
  // This ensures tools registered during initialization are preserved
  let server = getMcpServer();
  if (!server) {
    logger.info("[MCP-GATEWAY] No existing server instance found, creating new one");
    server = new McpServer(
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
  } else {
    logger.info("[MCP-GATEWAY] Reusing existing server instance from initialization");
  }

  // getAgentContext is now dynamic - it reads from AsyncLocalStorage
  // During tool registration (startup), there's no request context, so it returns a default
  // During tool execution (HTTP requests), the context is set by the route handler
  const { getAgentContext: getContext } = await import("./tools/agentContext.js");
  function getAgentContext() {
    return getContext() || {
      agentId: "system",
      agentRole: "system",
      env: process.env.AGENT_ENV || "dev",
      tenantId: undefined,
    };
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
  try {
    await registerToolsByCategory(context, enabledCategories);
    logger.info(`[MCP-GATEWAY] Tool registration completed`);
  } catch (error) {
    logger.error(`[MCP-GATEWAY] Failed to register tools:`, error);
    throw error;
  }

  // Register MCP server proxies (async - connects to upstream servers)
  try {
    await registerMcpServerProxies(context);
    logger.info(`[MCP-GATEWAY] MCP server proxy registration completed`);
  } catch (error) {
    logger.error(`[MCP-GATEWAY] Failed to register MCP server proxies:`, error);
    // Don't throw - proxies are optional
  }

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
        const { addIdpConnections } = await import("./db/migrations/addIdpConnections.js");
        await addIdpConnections();
        const { extendAgentsForNhi } = await import("./db/migrations/extendAgentsForNhi.js");
        await extendAgentsForNhi();
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

  // Register tools BEFORE starting API server so they're available for HTTP requests
  // This ensures tools are registered even when using HTTP-only mode (without stdio)
  try {
    logger.info("[INIT] Registering tools for HTTP access...");
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

    // getAgentContext is now dynamic - it reads from AsyncLocalStorage
    // During tool registration (startup), there's no request context, so it returns a default
    // During tool execution (HTTP requests), the context is set by the route handler
    const { getAgentContext: getContext } = await import("./tools/agentContext.js");
    function getAgentContext() {
      return getContext() || {
        agentId: "system",
        agentRole: "system",
        env: process.env.AGENT_ENV || "dev",
        tenantId: undefined,
      };
    }

    // Configure which categories to enable
    const enabledCategoriesEnv = process.env.ENABLED_TOOL_CATEGORIES;
    let enabledCategories: ToolCategory[];
    
    if (enabledCategoriesEnv) {
      enabledCategories = enabledCategoriesEnv.split(",") as ToolCategory[];
    } else {
      // Always register built-in tools (file, web, terminal) at startup
      enabledCategories = ["file", "web", "terminal"];
      const dynamicEnabled = await getEnabledCategories();
      for (const cat of dynamicEnabled) {
        if (!enabledCategories.includes(cat)) {
          enabledCategories.push(cat);
        }
      }
    }

    logger.info(`[INIT] Registering tools from categories: ${enabledCategories.join(", ")}`);

    const context = {
      server,
      getAgentContext,
    };

    // Register tools by category
    logger.info(`[INIT] About to call registerToolsByCategory`);
    await registerToolsByCategory(context, enabledCategories);
    logger.info(`[INIT] Tool registration completed - checking HTTP registry...`);
    
    // Verify tools were registered
    const { getAllTools } = await import("./mcpToolRegistry.js");
    const registeredTools = getAllTools();
    logger.info(`[INIT] HTTP registry now has ${registeredTools.length} tools: ${registeredTools.map(t => t.name).join(", ")}`);

    // Register MCP server proxies (async - connects to upstream servers)
    registerMcpServerProxies(context).catch((error) => {
      logger.warn(`[INIT] Failed to register MCP server proxies:`, error);
      // Don't throw - proxies are optional
    });
  } catch (error) {
    logger.error("[INIT] Failed to register tools:", error);
    // Don't throw - allow API server to start even if tool registration fails
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
