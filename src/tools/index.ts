import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getToolsByCategory,
  isThirdPartyToolConfig,
  getMcpServerProxies,
  isOpenApiToolConfig,
  isDeclarativeThirdPartyToolConfig,
  type ToolCategory,
  type ThirdPartyToolConfig,
  type ToolPolicyConfig,
} from "../config.js";
import { logger } from "../logger.js";
import { FileOperationsHandler } from "./handlers/FileOperationsHandler.js";
import { WebOperationsHandler } from "./handlers/WebOperationsHandler.js";
import { TerminalCommandsHandler } from "./handlers/TerminalCommandsHandler.js";
import { GenericToolHandler } from "./handlers/GenericToolHandler.js";
import { OpenApiToolGenerator, OpenApiToolHandler } from "./handlers/OpenApiToolHandler.js";
import { McpServerProxyHandler, McpServerProxyManager } from "./handlers/McpServerProxyHandler.js";
import { convertInputSchemaToZod } from "./schemaConverter.js";
import type { AgentContext } from "./handlers/BaseGatewayHandler.js";
import { getAgentContext } from "./agentContext.js";
import { toolCache } from "./toolCache.js";
import { registerToolWithHttp } from "./toolRegistrationHelper.js";

// Global singleton manager instance
let globalProxyManager: McpServerProxyManager | null = null;

export interface ToolRegistrationContext {
  server: McpServer;
  getAgentContext: () => AgentContext;
}

/**
 * Wraps a tool handler with runtime enabled state checking.
 * All tools should use this wrapper to ensure consistent behavior.
 */
function wrapToolHandlerWithEnabledCheck(
  toolName: string,
  category: ToolCategory,
  handler: (args: Record<string, unknown>) => Promise<any>
): (args: Record<string, unknown>) => Promise<any> {
  return async (args: Record<string, unknown>) => {
    // Check enabled state at runtime by reading from config with tenant context
    const agentContext = getAgentContext();
    const categoryTools = await getToolsByCategory(category, agentContext?.tenantId);
    const toolConfig = categoryTools[toolName];
    const isEnabled = toolConfig?.enabled !== false;
    
    if (!isEnabled) {
      throw new Error(`Tool ${toolName} is disabled`);
    }
    
    return handler(args);
  };
}

/**
 * Register all file tools using FileOperationsHandler
 */
export async function registerFileTools(context: ToolRegistrationContext): Promise<void> {
  const { server, getAgentContext } = context;
  try {
    const fileTools = await getToolsByCategory("file");
    logger.info(`[MCP-GATEWAY] Loading file tools from config: ${Object.keys(fileTools).join(", ")}`);
    
    if (Object.keys(fileTools).length === 0) {
      logger.warn(`[MCP-GATEWAY] No file tools found in config!`);
      return;
    }

    // Initialize file operations handler
    const fileHandler = new FileOperationsHandler({
      read: fileTools.file_read_gateway,
      write: fileTools.file_write_gateway,
      search: fileTools.file_search_gateway,
    });

    // FILE READ GATEWAY
    // Register all tools so they appear in MCP proxy, but check enabled state at runtime
    if (fileTools.file_read_gateway) {
      logger.info(`[MCP-GATEWAY] Registering file_read_gateway`);
      const toolHandler = wrapToolHandlerWithEnabledCheck(
        "file_read_gateway",
        "file",
        async (args) => fileHandler.readFile(getAgentContext(), args as { path: string; encoding?: string })
      );
      
      const inputSchema = z.object({
        path: z.string().describe("File path to read (absolute or project-relative)."),
        encoding: z.string().optional().default("utf-8"),
      });
      
      try {
        logger.info(`[MCP-GATEWAY] About to call registerToolWithHttp for file_read_gateway`);
        registerToolWithHttp(
          server,
          "file_read_gateway",
          fileTools.file_read_gateway.description,
          inputSchema,
          toolHandler
        );
        logger.info(`[MCP-GATEWAY] Successfully called registerToolWithHttp for file_read_gateway`);
      } catch (error) {
        logger.error(`[MCP-GATEWAY] Error calling registerToolWithHttp for file_read_gateway:`, error);
        throw error;
      }
    }

    // FILE SEARCH GATEWAY
    if (fileTools.file_search_gateway) {
      logger.info(`[MCP-GATEWAY] Registering file_search_gateway`);
      const toolHandler = wrapToolHandlerWithEnabledCheck(
        "file_search_gateway",
        "file",
        async (args) => fileHandler.searchFiles(getAgentContext(), args as any)
      );
      
      const inputSchema = z.object({
        pattern: z.string().describe("Search pattern or query string to find files."),
        directory: z.string().optional().describe("Directory to search in (absolute or project-relative). If not provided, searches from project root."),
        fileType: z.string().optional().describe("Optional file type filter (e.g., '*.ts', '*.js')."),
        limit: z.number().int().min(1).max(100).optional().default(20),
      });
      
      registerToolWithHttp(
        server,
        "file_search_gateway",
        fileTools.file_search_gateway.description,
        inputSchema,
        toolHandler
      );
    }

    // FILE WRITE GATEWAY
    if (fileTools.file_write_gateway) {
      logger.info(`[MCP-GATEWAY] Registering file_write_gateway`);
      const toolHandler = wrapToolHandlerWithEnabledCheck(
        "file_write_gateway",
        "file",
        async (args) => fileHandler.writeFile(getAgentContext(), args as any)
      );
      
      const inputSchema = z.object({
        path: z.string().describe("File path to write (absolute or project-relative)."),
        contents: z.string().describe("Content to write to the file."),
        encoding: z.string().optional().default("utf-8"),
      });
      
      registerToolWithHttp(
        server,
        "file_write_gateway",
        fileTools.file_write_gateway.description,
        inputSchema,
        toolHandler
      );
    }
  } catch (error) {
    logger.error(`[MCP-GATEWAY] Error registering file tools:`, error);
    throw error;
  }
}

/**
 * Register all web tools using WebOperationsHandler
 */
export async function registerWebTools(context: ToolRegistrationContext): Promise<void> {
  const { server, getAgentContext } = context;
  const webTools = await getToolsByCategory("web");
  logger.info(`[MCP-GATEWAY] Loading web tools from config: ${Object.keys(webTools).join(", ")}`);

  // Initialize web operations handler
  const webHandler = new WebOperationsHandler(webTools.web_search_gateway);

  // WEB SEARCH GATEWAY
  if (webTools.web_search_gateway) {
    logger.info(`[MCP-GATEWAY] Registering web_search_gateway`);
    const toolHandler = wrapToolHandlerWithEnabledCheck(
      "web_search_gateway",
      "web",
      async (args) => webHandler.searchWeb(getAgentContext(), args as any)
    );
    
    const inputSchema = z.object({
      query: z.string().describe("Search query string."),
      limit: z.number().int().min(1).max(20).optional().default(5).describe("Maximum number of results to return (1-20)."),
      provider: z.enum(["tavily", "serpapi", "google", "bing", "duckduckgo", "auto"]).optional().default("auto").describe("Search provider to use. 'auto' selects based on available API keys. Options: tavily (AI-optimized), serpapi (Google results), google (Custom Search), bing, duckduckgo (fallback, no API key required)."),
    });
    
    registerToolWithHttp(
      server,
      "web_search_gateway",
      webTools.web_search_gateway.description,
      inputSchema,
      toolHandler
    );
  } else {
    logger.info(`[MCP-GATEWAY] Skipping web_search_gateway (not found in config)`);
  }
}

/**
 * Register all terminal tools using TerminalCommandsHandler
 */
export async function registerTerminalTools(context: ToolRegistrationContext): Promise<void> {
  const { server, getAgentContext } = context;
  const terminalTools = await getToolsByCategory("terminal");
  logger.info(`[MCP-GATEWAY] Loading terminal tools from config: ${Object.keys(terminalTools).join(", ")}`);

  // TERMINAL COMMAND
  if (terminalTools.terminal_command) {
    logger.info(`[MCP-GATEWAY] Registering terminal_command`);
    const terminalHandler = new TerminalCommandsHandler(terminalTools.terminal_command);
    
    const toolHandler = wrapToolHandlerWithEnabledCheck(
      "terminal_command",
      "terminal",
      async (args) => terminalHandler.executeCommand(getAgentContext(), args as any)
    );
    
    const inputSchema = z.object({
      command: z.string().describe("The command to execute (e.g., 'ls', 'git', 'npm')."),
      args: z.array(z.string()).optional().describe("Array of command arguments."),
      cwd: z.string().optional().describe("Working directory for the command. If not provided, uses current working directory."),
      env: z.record(z.string()).optional().describe("Additional environment variables to set for the command execution."),
      timeout: z.number().int().min(0).optional().default(30000).describe("Timeout in milliseconds (0 = no timeout). Default: 30000 (30 seconds)."),
      shell: z.boolean().optional().default(true).describe("Whether to execute the command in a shell. Default: true."),
    });
    
    registerToolWithHttp(
      server,
      "terminal_command",
      terminalTools.terminal_command.description,
      inputSchema,
      toolHandler
    );
  } else {
    logger.info(`[MCP-GATEWAY] Skipping terminal_command (not found in config)`);
  }
}

/**
 * Register all third-party integration tools using GenericToolHandler
 * These tools are configured declaratively - no code needed!
 */
export async function registerThirdPartyTools(context: ToolRegistrationContext): Promise<void> {
  const { server, getAgentContext } = context;
  const thirdPartyTools = await getToolsByCategory("third_party");

  if (Object.keys(thirdPartyTools).length === 0) {
    logger.info("[MCP-GATEWAY] No third-party tools configured");
    return;
  }

  // Register each third-party tool based on its configuration
  // Register all tools so they appear in MCP proxy, but check enabled state at runtime
  for (const [toolName, toolConfig] of Object.entries(thirdPartyTools)) {
    if (!isThirdPartyToolConfig(toolConfig)) {
      logger.warn(`[MCP-GATEWAY] Tool ${toolName} is not a valid third-party tool configuration`);
      continue;
    }

    if (isOpenApiToolConfig(toolConfig)) {
      const generator = new OpenApiToolGenerator(toolConfig);
      const operations = await generator.getGeneratedTools();

      for (const operation of operations) {
        const handler = new OpenApiToolHandler(operation, toolConfig);
        // Wrap with enabled check - OpenAPI tools use the parent tool name for config lookup
        const wrappedHandler = wrapToolHandlerWithEnabledCheck(
          toolName,
          "third_party",
          async (args) => handler.execute(getAgentContext(), args)
        );
        
        registerToolWithHttp(
          server,
          operation.name,
          operation.description,
          operation.inputSchema,
          wrappedHandler
        );

        logger.info(`[MCP-GATEWAY] Registered OpenAPI tool: ${operation.name}`);
      }
      continue;
    }

    if (!isDeclarativeThirdPartyToolConfig(toolConfig)) {
      logger.warn(`[MCP-GATEWAY] Tool ${toolName} has unsupported third-party configuration`);
      continue;
    }

    // Create handler for this tool
    const handler = new GenericToolHandler(toolConfig);

    // Convert input schema to Zod schema
    const zodSchema = convertInputSchemaToZod(toolConfig.inputSchema);

    // Register the tool with both MCP server and HTTP registry
    // Wrap with enabled check for consistent runtime behavior
    const wrappedHandler = wrapToolHandlerWithEnabledCheck(
      toolName,
      "third_party",
      async (args) => handler.execute(getAgentContext(), args)
    );

    registerToolWithHttp(
      server,
      toolName,
      toolConfig.description,
      zodSchema,
      wrappedHandler
    );

    logger.info(`[MCP-GATEWAY] Registered third-party tool: ${toolName}`);
  }
}

/**
 * Register MCP server proxies
 * Connects to upstream MCP servers and automatically exposes all their tools through the gateway
 */
export async function registerMcpServerProxies(
  context: ToolRegistrationContext
): Promise<void> {
  const { server, getAgentContext } = context;
  // Use singleton manager to allow disconnecting specific proxies
  if (!globalProxyManager) {
    globalProxyManager = new McpServerProxyManager();
  }
  const proxyManager = globalProxyManager;
  const mcpServerProxies = await getMcpServerProxies();

  if (Object.keys(mcpServerProxies).length === 0) {
    logger.info("[MCP-GATEWAY] No MCP server proxies configured");
    return;
  }

  // Process each configured proxy
  for (const [proxyName, proxyConfig] of Object.entries(mcpServerProxies)) {
    if (proxyConfig.enabled !== true) {
      continue;
    }

    try {
      logger.info(`[MCP-GATEWAY] Connecting to MCP server proxy: ${proxyName}`);

      // Connect and discover tools
      const discoveredTools = await proxyManager.connectAndDiscoverTools(proxyConfig);

      // Cache discovered tools (tenant-aware)
      // At startup, we don't have a tenant context, so use undefined
      // Tools will be cached per-tenant when fetched via API
      const tenantId = undefined; // Startup registration is global
      toolCache.setTools(
        proxyName,
        discoveredTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
        proxyConfig,
        tenantId
      );

      // Register each discovered tool
      for (const tool of discoveredTools) {
        // Skip if tool is disabled
        if (proxyConfig.disabledTools?.includes(tool.name)) {
          logger.info(
            `[MCP-GATEWAY] Skipping disabled tool: ${tool.name} (from ${proxyName})`
          );
          continue;
        }

        // Create policy config for this tool
        const toolPolicy: ToolPolicyConfig = {
          name: tool.name,
          description: tool.description,
          allowedRoles: proxyConfig.defaultPolicy.allowedRoles,
          sensitivity: proxyConfig.defaultPolicy.sensitivity,
          category: "third_party",
        };

        // Create handler
        const handler = new McpServerProxyHandler(proxyConfig, toolPolicy, proxyManager);

        // Convert input schema from MCP format to Zod
        const zodSchema = convertMcpInputSchemaToZod(tool.inputSchema);

        // Register the tool with both MCP server and HTTP registry
        registerToolWithHttp(
          server,
          tool.name,
          tool.description,
          zodSchema,
          async (args) => {
            return handler.execute(getAgentContext(), args);
          }
        );

        logger.info(
          `[MCP-GATEWAY] Registered proxied tool: ${tool.name} (from ${proxyName})`
        );
      }
    } catch (error) {
      logger.error(
        `[MCP-GATEWAY] Failed to register MCP server proxy ${proxyName}:`,
        error
      );
      // Continue with other proxies even if one fails
    }
  }
}

/**
 * Convert MCP input schema to Zod schema
 */
/**
 * Disconnect an MCP server proxy (e.g., after OAuth token update)
 */
export async function disconnectMcpServerProxy(proxyName: string): Promise<void> {
  if (globalProxyManager) {
    await globalProxyManager.disconnect(proxyName);
  }
}

function convertMcpInputSchemaToZod(inputSchema: unknown): z.ZodObject<Record<string, z.ZodTypeAny>> {
  // MCP schemas are JSON Schema format, we need to convert to Zod
  // This is a simplified converter - you may need to enhance it for complex schemas
  if (!inputSchema || typeof inputSchema !== "object") {
    return z.object({});
  }

  const schema = inputSchema as Record<string, unknown>;
  const zodSchema: Record<string, z.ZodTypeAny> = {};

  if (schema.properties && typeof schema.properties === "object") {
    const properties = schema.properties as Record<string, unknown>;

    for (const [key, prop] of Object.entries(properties)) {
      const propSchema = prop as Record<string, unknown>;
      let zodType: z.ZodTypeAny;

      // Determine type
      if (propSchema.type === "string") {
        zodType = z.string();
      } else if (propSchema.type === "number" || propSchema.type === "integer") {
        zodType = z.number();
      } else if (propSchema.type === "boolean") {
        zodType = z.boolean();
      } else if (propSchema.type === "array") {
        zodType = z.array(z.unknown());
      } else if (propSchema.type === "object") {
        zodType = z.record(z.unknown());
      } else {
        zodType = z.unknown();
      }

      // Add description
      if (typeof propSchema.description === "string") {
        zodType = zodType.describe(propSchema.description);
      }

      // Make optional if not required
      const required = (schema.required as string[]) || [];
      if (!required.includes(key)) {
        zodType = zodType.optional();
      }

      // Add default if present
      if (propSchema.default !== undefined) {
        zodType = zodType.default(propSchema.default);
      }

      zodSchema[key] = zodType;
    }
  }

  return z.object(zodSchema);
}

/**
 * Register tools by category. Can selectively enable/disable categories.
 */
export async function registerToolsByCategory(
  context: ToolRegistrationContext,
  enabledCategories: ToolCategory[] = ["file", "web", "terminal", "third_party"]
): Promise<void> {
  logger.info(`[MCP-GATEWAY] registerToolsByCategory called with categories: ${enabledCategories.join(", ")}`);
  
  if (enabledCategories.includes("file")) {
    logger.info(`[MCP-GATEWAY] Registering file tools...`);
    await registerFileTools(context);
    logger.info(`[MCP-GATEWAY] File tools registration completed`);
  }
  if (enabledCategories.includes("web")) {
    logger.info(`[MCP-GATEWAY] Registering web tools...`);
    await registerWebTools(context);
    logger.info(`[MCP-GATEWAY] Web tools registration completed`);
  }
  if (enabledCategories.includes("terminal")) {
    logger.info(`[MCP-GATEWAY] Registering terminal tools...`);
    await registerTerminalTools(context);
    logger.info(`[MCP-GATEWAY] Terminal tools registration completed`);
  }
  if (enabledCategories.includes("third_party")) {
    logger.info(`[MCP-GATEWAY] Registering third-party tools...`);
    await registerThirdPartyTools(context);
    logger.info(`[MCP-GATEWAY] Third-party tools registration completed`);
  }
  
  // Verify final state
  const { getAllTools } = await import("../mcpToolRegistry.js");
  const allTools = getAllTools();
  logger.info(`[MCP-GATEWAY] registerToolsByCategory completed. Total tools in HTTP registry: ${allTools.length}`);
}
