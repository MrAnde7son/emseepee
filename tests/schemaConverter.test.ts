import { describe, it, expect } from "vitest";
import { z } from "zod";
import { convertInputSchemaToZod } from "../src/tools/schemaConverter.js";
import type { ToolInputSchema } from "../src/config.js";

describe("Schema Converter", () => {
  describe("Basic Type Conversion", () => {
    it("should convert string type to Zod string", () => {
      const inputSchema: ToolInputSchema = {
        name: {
          type: "string",
          description: "Name field",
          required: true,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.shape.name).toBeInstanceOf(z.ZodString);
      expect(zodSchema.parse({ name: "test" })).toEqual({ name: "test" });
      expect(() => zodSchema.parse({ name: 123 })).toThrow();
    });

    it("should convert number type to Zod number", () => {
      const inputSchema: ToolInputSchema = {
        count: {
          type: "number",
          description: "Count field",
          required: true,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.shape.count).toBeInstanceOf(z.ZodNumber);
      expect(zodSchema.parse({ count: 42 })).toEqual({ count: 42 });
      expect(() => zodSchema.parse({ count: "not a number" })).toThrow();
    });

    it("should convert boolean type to Zod boolean", () => {
      const inputSchema: ToolInputSchema = {
        enabled: {
          type: "boolean",
          description: "Enabled field",
          required: true,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.shape.enabled).toBeInstanceOf(z.ZodBoolean);
      expect(zodSchema.parse({ enabled: true })).toEqual({ enabled: true });
      expect(() => zodSchema.parse({ enabled: "true" })).toThrow();
    });

    it("should convert array type to Zod array", () => {
      const inputSchema: ToolInputSchema = {
        items: {
          type: "array",
          description: "Items field",
          required: true,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.shape.items).toBeInstanceOf(z.ZodArray);
      expect(zodSchema.parse({ items: [1, 2, 3] })).toEqual({ items: [1, 2, 3] });
      expect(zodSchema.parse({ items: ["a", "b"] })).toEqual({ items: ["a", "b"] });
    });

    it("should convert object type to Zod record", () => {
      const inputSchema: ToolInputSchema = {
        metadata: {
          type: "object",
          description: "Metadata field",
          required: true,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.shape.metadata).toBeInstanceOf(z.ZodRecord);
      expect(zodSchema.parse({ metadata: { key: "value" } })).toEqual({
        metadata: { key: "value" },
      });
    });
  });

  describe("Required Fields", () => {
    it("should make field required when required is true", () => {
      const inputSchema: ToolInputSchema = {
        requiredField: {
          type: "string",
          required: true,
        },
        optionalField: {
          type: "string",
          required: false,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      // Required field should be present
      expect(zodSchema.parse({ requiredField: "value", optionalField: "value" })).toEqual({
        requiredField: "value",
        optionalField: "value",
      });

      // Should fail without required field
      expect(() => zodSchema.parse({ optionalField: "value" })).toThrow();

      // Optional field can be omitted
      expect(zodSchema.parse({ requiredField: "value" })).toEqual({
        requiredField: "value",
      });
    });

    it("should make field optional when required is false or undefined", () => {
      const inputSchema: ToolInputSchema = {
        optional1: {
          type: "string",
          required: false,
        },
        optional2: {
          type: "string",
          // required not specified
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      // Both fields should be optional
      expect(zodSchema.parse({})).toEqual({});
      expect(zodSchema.parse({ optional1: "value" })).toEqual({ optional1: "value" });
      expect(zodSchema.parse({ optional2: "value" })).toEqual({ optional2: "value" });
    });
  });

  describe("Default Values", () => {
    it("should apply default value for string field", () => {
      const inputSchema: ToolInputSchema = {
        name: {
          type: "string",
          default: "default-name",
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.parse({})).toEqual({ name: "default-name" });
      expect(zodSchema.parse({ name: "custom-name" })).toEqual({ name: "custom-name" });
    });

    it("should apply default value for number field", () => {
      const inputSchema: ToolInputSchema = {
        limit: {
          type: "number",
          default: 10,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.parse({})).toEqual({ limit: 10 });
      expect(zodSchema.parse({ limit: 20 })).toEqual({ limit: 20 });
    });

    it("should apply default value for boolean field", () => {
      const inputSchema: ToolInputSchema = {
        enabled: {
          type: "boolean",
          default: true,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.parse({})).toEqual({ enabled: true });
      expect(zodSchema.parse({ enabled: false })).toEqual({ enabled: false });
    });
  });

  describe("Enum Constraints", () => {
    it("should enforce enum values for string field", () => {
      const inputSchema: ToolInputSchema = {
        status: {
          type: "string",
          enum: ["pending", "active", "completed"],
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.parse({ status: "pending" })).toEqual({ status: "pending" });
      expect(zodSchema.parse({ status: "active" })).toEqual({ status: "active" });
      expect(zodSchema.parse({ status: "completed" })).toEqual({ status: "completed" });
      expect(() => zodSchema.parse({ status: "invalid" })).toThrow();
    });

    it("should enforce enum values for number field", () => {
      const inputSchema: ToolInputSchema = {
        priority: {
          type: "number",
          enum: [1, 2, 3],
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      expect(zodSchema.parse({ priority: 1 })).toEqual({ priority: 1 });
      expect(zodSchema.parse({ priority: 2 })).toEqual({ priority: 2 });
      expect(() => zodSchema.parse({ priority: 4 })).toThrow();
    });
  });

  describe("Descriptions", () => {
    it("should include description in Zod schema", () => {
      const inputSchema: ToolInputSchema = {
        field: {
          type: "string",
          description: "This is a test field",
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      // Zod descriptions are stored in _def.description
      expect(zodSchema.shape.field._def.description).toBe("This is a test field");
    });
  });

  describe("Complex Schemas", () => {
    it("should handle multiple fields with different types", () => {
      const inputSchema: ToolInputSchema = {
        name: {
          type: "string",
          required: true,
          description: "Name of the item",
        },
        count: {
          type: "number",
          required: false,
          default: 0,
        },
        enabled: {
          type: "boolean",
          required: false,
          default: false,
        },
        tags: {
          type: "array",
          required: false,
        },
        metadata: {
          type: "object",
          required: false,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      const validInput = {
        name: "test",
        count: 5,
        enabled: true,
        tags: ["tag1", "tag2"],
        metadata: { key: "value" },
      };

      expect(zodSchema.parse(validInput)).toEqual(validInput);
    });

    it("should handle schema with all optional fields", () => {
      const inputSchema: ToolInputSchema = {
        optional1: {
          type: "string",
        },
        optional2: {
          type: "number",
        },
        optional3: {
          type: "boolean",
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      // Should accept empty object
      expect(zodSchema.parse({})).toEqual({});

      // Should accept partial objects
      expect(zodSchema.parse({ optional1: "value" })).toEqual({ optional1: "value" });
      expect(zodSchema.parse({ optional2: 42 })).toEqual({ optional2: 42 });
    });

    it("should handle schema with all required fields", () => {
      const inputSchema: ToolInputSchema = {
        required1: {
          type: "string",
          required: true,
        },
        required2: {
          type: "number",
          required: true,
        },
        required3: {
          type: "boolean",
          required: true,
        },
      };

      const zodSchema = convertInputSchemaToZod(inputSchema);

      // Should require all fields
      expect(() => zodSchema.parse({})).toThrow();
      expect(() => zodSchema.parse({ required1: "value" })).toThrow();

      const validInput = {
        required1: "value",
        required2: 42,
        required3: true,
      };

      expect(zodSchema.parse(validInput)).toEqual(validInput);
    });
  });
});

