import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getToolsByCategory, isThirdPartyToolConfig, MCP_SERVER_PROXIES, type ToolCategory, type ThirdPartyToolConfig, type ToolPolicyConfig } from "../config.js";
import { logger } from "../logger.js";
import { FileOperationsHandler } from "./handlers/FileOperationsHandler.js";
import { WebOperationsHandler } from "./handlers/WebOperationsHandler.js";
import { GenericToolHandler } from "./handlers/GenericToolHandler.js";
import { McpServerProxyHandler, McpServerProxyManager } from "./handlers/McpServerProxyHandler.js";
import { convertInputSchemaToZod } from "./schemaConverter.js";
import type { AgentContext } from "./handlers/BaseGatewayHandler.js";

export interface ToolRegistrationContext {
  server: McpServer;
  getAgentContext: () => AgentContext;
}

/**
 * Register all file tools using FileOperationsHandler
 */
export function registerFileTools(context: ToolRegistrationContext): void {
  const { server, getAgentContext } = context;
  const fileTools = getToolsByCategory("file");

  // Initialize file operations handler
  const fileHandler = new FileOperationsHandler({
    read: fileTools.file_read_gateway,
    write: fileTools.file_write_gateway,
    search: fileTools.file_search_gateway,
  });

  // FILE READ GATEWAY
  if (fileTools.file_read_gateway) {
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
  if (fileTools.file_search_gateway) {
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
  if (fileTools.file_write_gateway) {
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
 * Register all browser tools using WebOperationsHandler
 */
export function registerBrowserTools(context: ToolRegistrationContext): void {
  const { server, getAgentContext } = context;
  const browserTools = getToolsByCategory("browser");

  // Initialize web operations handler
  const webHandler = new WebOperationsHandler(browserTools.web_search_gateway);

  // WEB SEARCH GATEWAY
  if (browserTools.web_search_gateway) {
    server.registerTool(
      "web_search_gateway",
      {
        description: browserTools.web_search_gateway.description,
        inputSchema: {
          query: z.string().describe("Search query string."),
          limit: z.number().int().min(1).max(20).optional().default(5),
        },
      },
      async (args) => {
        return webHandler.searchWeb(getAgentContext(), args);
      }
    );
  }
}

/**
 * Register all third-party integration tools using GenericToolHandler
 * These tools are configured declaratively - no code needed!
 */
export function registerThirdPartyTools(context: ToolRegistrationContext): void {
  const { server, getAgentContext } = context;
  const thirdPartyTools = getToolsByCategory("third_party");

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
  const proxyManager = new McpServerProxyManager();

  if (Object.keys(MCP_SERVER_PROXIES).length === 0) {
    logger.info("[MCP-GATEWAY] No MCP server proxies configured");
    return;
  }

  // Process each configured proxy
  for (const [proxyName, proxyConfig] of Object.entries(MCP_SERVER_PROXIES)) {
    try {
      logger.info(`[MCP-GATEWAY] Connecting to MCP server proxy: ${proxyName}`);

      // Connect and discover tools
      const discoveredTools = await proxyManager.connectAndDiscoverTools(proxyConfig);

      // Register each discovered tool
      for (const tool of discoveredTools) {
        // Create policy config for this tool
        const toolPolicyOverride = proxyConfig.toolPolicyOverrides?.[tool.name];
        const toolPolicy: ToolPolicyConfig = {
          name: tool.name,
          description: tool.description,
          allowedRoles:
            toolPolicyOverride?.allowedRoles || proxyConfig.defaultPolicy.allowedRoles,
          sensitivity:
            toolPolicyOverride?.sensitivity || proxyConfig.defaultPolicy.sensitivity,
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
export function registerToolsByCategory(
  context: ToolRegistrationContext,
  enabledCategories: ToolCategory[] = ["file", "browser", "third_party"]
): void {
  if (enabledCategories.includes("file")) {
    registerFileTools(context);
  }
  if (enabledCategories.includes("browser")) {
    registerBrowserTools(context);
  }
  if (enabledCategories.includes("third_party")) {
    registerThirdPartyTools(context);
  }
}
