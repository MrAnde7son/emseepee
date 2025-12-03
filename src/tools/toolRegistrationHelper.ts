/**
 * Helper to register tools in both MCP server and HTTP registry
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool as registerHttpTool, getAllTools, getTool } from "../mcpToolRegistry.js";
import { logger } from "../logger.js";

/**
 * Register a tool with both the MCP server (for stdio) and HTTP registry (for HTTP access)
 */
export function registerToolWithHttp(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: any,
  handler: (args: Record<string, unknown>) => Promise<any>
): void {
  try {
    // Check if tool is already registered in HTTP registry
    const existingTool = getTool(name);
    if (existingTool) {
      logger.info(`[TOOL-REG] Tool ${name} is already registered in HTTP registry, skipping registration`);
      return;
    }

    // Register with MCP server (for stdio transport)
    // Note: MCP server will throw if tool is already registered, so we catch and handle that
    try {
      server.registerTool(name, { description, inputSchema }, handler);
    } catch (error: any) {
      // If tool is already registered in MCP server, that's okay - just log and continue
      if (error?.message?.includes("already registered")) {
        logger.info(`[TOOL-REG] Tool ${name} is already registered in MCP server, skipping MCP registration`);
      } else {
        throw error; // Re-throw if it's a different error
      }
    }

    // Also register for HTTP access
    // Convert Zod schema to plain object schema for HTTP
    const httpSchema = convertZodToPlainSchema(inputSchema);
    
    registerHttpTool(name, description, httpSchema, handler);
    
    // Verify registration
    const allTools = getAllTools();
    logger.info(`[TOOL-REG] Registered ${name} for both stdio and HTTP (total in registry: ${allTools.length})`);
  } catch (error) {
    logger.error(`[TOOL-REG] Failed to register tool ${name}:`, error);
    throw error;
  }
}

/**
 * Convert Zod schema to plain object schema for HTTP
 * This is a simplified conversion - may need enhancement for complex schemas
 */
function convertZodToPlainSchema(zodSchema: any): any {
  // If it's already a plain object, return as-is
  if (zodSchema && typeof zodSchema === "object" && !zodSchema._def) {
    return zodSchema;
  }

  // If it's a Zod object, convert it
  if (zodSchema && zodSchema._def && zodSchema._def.typeName === "ZodObject") {
    const shape = zodSchema._def.shape();
    const result: any = {};
    
    for (const [key, value] of Object.entries(shape)) {
      const zodField = value as any;
      const fieldDef: any = {
        type: getZodType(zodField),
      };
      
      if (zodField._def?.description) {
        fieldDef.description = zodField._def.description;
      }
      
      if (zodField._def?.typeName === "ZodOptional" || zodField._def?.typeName === "ZodDefault") {
        fieldDef.required = false;
        if (zodField._def?.typeName === "ZodDefault" && zodField._def.defaultValue) {
          fieldDef.default = zodField._def.defaultValue();
        }
      } else {
        fieldDef.required = true;
      }
      
      result[key] = fieldDef;
    }
    
    return {
      type: "object",
      properties: result,
      required: Object.keys(result).filter(key => result[key].required),
    };
  }

  // Fallback: return as plain object
  return zodSchema;
}

function getZodType(zodField: any): string {
  if (!zodField || !zodField._def) {
    return "string";
  }

  const typeName = zodField._def.typeName;
  
  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    return getZodType(zodField._def.innerType || zodField._def.type);
  }
  
  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return "array";
    case "ZodObject":
      return "object";
    default:
      return "string";
  }
}

