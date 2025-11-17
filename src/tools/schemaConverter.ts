import { z } from "zod";
import type { ToolInputSchema } from "../config.js";

/**
 * Convert ToolInputSchema to Zod schema for MCP tool registration
 */
export function convertInputSchemaToZod(inputSchema: ToolInputSchema): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const zodSchema: Record<string, z.ZodTypeAny> = {};

  for (const [key, field] of Object.entries(inputSchema)) {
    let zodType: z.ZodTypeAny;

    switch (field.type) {
      case "string":
        zodType = z.string();
        break;
      case "number":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.unknown());
        break;
      case "object":
        zodType = z.record(z.unknown());
        break;
      default:
        zodType = z.unknown();
    }

    // Add description if provided
    if (field.description) {
      zodType = zodType.describe(field.description);
    }

    // Make optional if not required
    if (!field.required) {
      zodType = zodType.optional();
    }

    // Add default value if provided
    if (field.default !== undefined) {
      zodType = zodType.default(field.default);
    }

    // Add enum constraint if provided
    if (field.enum && field.enum.length > 0) {
      zodType = zodType.refine((val) => field.enum!.includes(val), {
        message: `Value must be one of: ${field.enum.join(", ")}`,
      });
    }

    zodSchema[key] = zodType;
  }

  return z.object(zodSchema);
}

