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

// Global singleton manager instance
let globalProxyManager: McpServerProxyManager | null = null;

export interface ToolRegistrationContext {
  server: McpServer;
  getAgentContext: () => AgentContext;
}

/**
 * Register all file tools using FileOperationsHandler
 */
export async function registerFileTools(context: ToolRegistrationContext): Promise<void> {
  const { server, getAgentContext } = context;
  const fileTools = await getToolsByCategory("file");

  // Initialize file operations handler
  const fileHandler = new FileOperationsHandler({
    read: fileTools.file_read_gateway,
    write: fileTools.file_write_gateway,
    search: fileTools.file_search_gateway,
  });

  // FILE READ GATEWAY
  if (fileTools.file_read_gateway && fileTools.file_read_gateway.enabled === true) {
    server.registerTool(
      "file_read_gateway",
      {
        description: fileTools.file_read_gateway.description,
        inputSchema: {
          path: z.string().describe("File path to read (absolute or project-relative)."),
          encoding: z.string().optional().default("utf-8"),
        },
      },
      async (args) => {
        return fileHandler.readFile(getAgentContext(), args);
      }
    );
  }

  // FILE SEARCH GATEWAY
  if (fileTools.file_search_gateway && fileTools.file_search_gateway.enabled === true) {
    server.registerTool(
      "file_search_gateway",
      {
        description: fileTools.file_search_gateway.description,
        inputSchema: {
          pattern: z.string().describe("Search pattern or query string to find files."),
          directory: z.string().optional().describe("Directory to search in (absolute or project-relative). If not provided, searches from project root."),
          fileType: z.string().optional().describe("Optional file type filter (e.g., '*.ts', '*.js')."),
          limit: z.number().int().min(1).max(100).optional().default(20),
        },
      },
      async (args) => {
        return fileHandler.searchFiles(getAgentContext(), args);
      }
    );
  }

  // FILE WRITE GATEWAY
  if (fileTools.file_write_gateway && fileTools.file_write_gateway.enabled === true) {
    server.registerTool(
      "file_write_gateway",
      {
        description: fileTools.file_write_gateway.description,
        inputSchema: {
          path: z.string().describe("File path to write (absolute or project-relative)."),
          contents: z.string().describe("Content to write to the file."),
          encoding: z.string().optional().default("utf-8"),
        },
      },
      async (args) => {
        return fileHandler.writeFile(getAgentContext(), args);
      }
    );
  }
}

/**
 * Register all web tools using WebOperationsHandler
 */
export async function registerWebTools(context: ToolRegistrationContext): Promise<void> {
  const { server, getAgentContext } = context;
  const webTools = await getToolsByCategory("web");

  // Initialize web operations handler
  const webHandler = new WebOperationsHandler(webTools.web_search_gateway);

  // WEB SEARCH GATEWAY
  if (webTools.web_search_gateway && webTools.web_search_gateway.enabled === true) {
    server.registerTool(
      "web_search_gateway",
      {
        description: webTools.web_search_gateway.description,
        inputSchema: {
          query: z.string().describe("Search query string."),
          limit: z.number().int().min(1).max(20).optional().default(5).describe("Maximum number of results to return (1-20)."),
          provider: z.enum(["tavily", "serpapi", "google", "bing", "duckduckgo", "auto"]).optional().default("auto").describe("Search provider to use. 'auto' selects based on available API keys. Options: tavily (AI-optimized), serpapi (Google results), google (Custom Search), bing, duckduckgo (fallback, no API key required)."),
        },
      },
      async (args) => {
        return webHandler.searchWeb(getAgentContext(), args);
      }
    );
  }
}

/**
 * Register all terminal tools using TerminalCommandsHandler
 */
export async function registerTerminalTools(context: ToolRegistrationContext): Promise<void> {
  const { server, getAgentContext } = context;
  const terminalTools = await getToolsByCategory("terminal");

  // TERMINAL COMMAND
  if (terminalTools.terminal_command && terminalTools.terminal_command.enabled === true) {
    const terminalHandler = new TerminalCommandsHandler(terminalTools.terminal_command);
    
    server.registerTool(
      "terminal_command",
      {
        description: terminalTools.terminal_command.description,
        inputSchema: {
          command: z.string().describe("The command to execute (e.g., 'ls', 'git', 'npm')."),
          args: z.array(z.string()).optional().describe("Array of command arguments."),
          cwd: z.string().optional().describe("Working directory for the command. If not provided, uses current working directory."),
          env: z.record(z.string()).optional().describe("Additional environment variables to set for the command execution."),
          timeout: z.number().int().min(0).optional().default(30000).describe("Timeout in milliseconds (0 = no timeout). Default: 30000 (30 seconds)."),
          shell: z.boolean().optional().default(true).describe("Whether to execute the command in a shell. Default: true."),
        },
      },
      async (args) => {
        return terminalHandler.executeCommand(getAgentContext(), args);
      }
    );
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
  for (const [toolName, toolConfig] of Object.entries(thirdPartyTools)) {
    if (!isThirdPartyToolConfig(toolConfig)) {
      logger.warn(`[MCP-GATEWAY] Tool ${toolName} is not a valid third-party tool configuration`);
      continue;
    }

    // Skip if tool is not enabled (must be explicitly true)
    if (toolConfig.enabled !== true) {
      logger.info(`[MCP-GATEWAY] Skipping disabled third-party tool: ${toolName}`);
      continue;
    }

    if (isOpenApiToolConfig(toolConfig)) {
      const generator = new OpenApiToolGenerator(toolConfig);
      const operations = await generator.getGeneratedTools();

      for (const operation of operations) {
        const handler = new OpenApiToolHandler(operation, toolConfig);
        server.registerTool(
          operation.name,
          {
            description: operation.description,
            inputSchema: operation.inputSchema,
          },
          async (args) => handler.execute(getAgentContext(), args)
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

    // Register the tool with MCP server
    server.registerTool(
      toolName,
      {
        description: toolConfig.description,
        inputSchema: zodSchema,
      },
      async (args) => {
        return handler.execute(getAgentContext(), args);
      }
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
    // Skip if proxy is not enabled (must be explicitly true)
    if (proxyConfig.enabled !== true) {
      logger.info(`[MCP-GATEWAY] Skipping disabled MCP server proxy: ${proxyName}`);
      continue;
    }

    try {
      logger.info(`[MCP-GATEWAY] Connecting to MCP server proxy: ${proxyName}`);

      // Connect and discover tools
      const discoveredTools = await proxyManager.connectAndDiscoverTools(proxyConfig);

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

        // Register the tool
        server.registerTool(
          tool.name,
          {
            description: tool.description,
            inputSchema: zodSchema,
          },
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
  if (enabledCategories.includes("file")) {
    await registerFileTools(context);
  }
  if (enabledCategories.includes("web")) {
    await registerWebTools(context);
  }
  if (enabledCategories.includes("terminal")) {
    await registerTerminalTools(context);
  }
  if (enabledCategories.includes("third_party")) {
    await registerThirdPartyTools(context);
  }
}
