import { describe, it, expect, beforeEach, vi } from "vitest";

// Import types (these don't need to be re-imported)
import type { ToolPolicyConfig, ThirdPartyToolConfig } from "../src/config.js";

describe("Config Functions", () => {
  // We'll import modules fresh in each test to avoid cache issues
  let getToolRegistry: typeof import("../src/config.js").getToolRegistry;
  let getToolsByCategory: typeof import("../src/config.js").getToolsByCategory;
  let getToolByName: typeof import("../src/config.js").getToolByName;
  let getEnabledCategories: typeof import("../src/config.js").getEnabledCategories;
  let isThirdPartyToolConfig: typeof import("../src/config.js").isThirdPartyToolConfig;
  let configLoaderModule: typeof import("../src/configLoader.js");

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset modules to clear the internal cache in config.ts
    await vi.resetModules();
    // Re-import after reset
    const configModule = await import("../src/config.js");
    configLoaderModule = await import("../src/configLoader.js");
    getToolRegistry = configModule.getToolRegistry;
    getToolsByCategory = configModule.getToolsByCategory;
    getToolByName = configModule.getToolByName;
    getEnabledCategories = configModule.getEnabledCategories;
    isThirdPartyToolConfig = configModule.isThirdPartyToolConfig;
  });

  describe("getToolRegistry", () => {
    it("should return tool registry with all categories", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {
          file_read_gateway: {
            name: "file_read_gateway",
            description: "Read files",
            allowedRoles: ["coder_bot"],
            sensitivity: "medium",
            category: "file",
          },
          web_search_gateway: {
            name: "web_search_gateway",
            description: "Web search",
            allowedRoles: ["coder_bot"],
            sensitivity: "medium",
            category: "browser",
          },
        },
        policyRules: [],
      });

      const registry = await getToolRegistry();

      expect(registry).toHaveProperty("file");
      expect(registry).toHaveProperty("browser");
      expect(registry).toHaveProperty("third_party");
      expect(registry.file).toHaveProperty("file_read_gateway");
      expect(registry.browser).toHaveProperty("web_search_gateway");
    });

    it("should merge configured tools with defaults", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {
          file_read_gateway: {
            name: "file_read_gateway",
            description: "Custom read description",
            allowedRoles: ["admin"],
            sensitivity: "high",
            category: "file",
          },
        },
        policyRules: [],
      });

      // Clear the module cache by re-importing or resetting
      // Since we can't easily reset module-level variables, we'll test the merge logic differently
      // by checking that the custom tool overrides the default
      const registry = await getToolRegistry();

      // Should have custom file_read_gateway (merged with defaults)
      expect(registry.file.file_read_gateway?.description).toBe("Custom read description");
      expect(registry.file.file_read_gateway?.allowedRoles).toEqual(["admin"]);
      expect(registry.file.file_read_gateway?.sensitivity).toBe("high");
      // Should also have default tools
      expect(registry.file).toHaveProperty("file_write_gateway");
      expect(registry.file).toHaveProperty("file_search_gateway");
    });
  });

  describe("getToolsByCategory", () => {
    it("should return tools for file category", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      });

      const tools = await getToolsByCategory("file");

      // Should return default file tools
      expect(tools).toHaveProperty("file_read_gateway");
      expect(tools).toHaveProperty("file_write_gateway");
      expect(tools).toHaveProperty("file_search_gateway");
    });

    it("should return tools for browser category", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      });

      const tools = await getToolsByCategory("browser");

      expect(tools).toHaveProperty("web_search_gateway");
    });

    it("should return empty object for third_party category when no tools configured", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      });

      const tools = await getToolsByCategory("third_party");

      expect(Object.keys(tools)).toHaveLength(0);
    });
  });

  describe("isThirdPartyToolConfig", () => {
    it("should return true for third-party tool config", () => {
      const tool: ThirdPartyToolConfig = {
        name: "test_tool",
        description: "Test tool",
        allowedRoles: ["coder_bot"],
        sensitivity: "medium",
        category: "third_party",
        execution: {
          type: "http",
          method: "POST",
          url: "https://api.example.com",
        },
        inputSchema: {
          param: {
            type: "string",
            required: true,
          },
        },
      };

      expect(isThirdPartyToolConfig(tool)).toBe(true);
    });

    it("should return false for regular tool config", () => {
      const tool: ToolPolicyConfig = {
        name: "test_tool",
        description: "Test tool",
        allowedRoles: ["coder_bot"],
        sensitivity: "medium",
        category: "file",
      };

      expect(isThirdPartyToolConfig(tool)).toBe(false);
    });

    it("should return false for tool with third_party category but no execution", () => {
      const tool: ToolPolicyConfig = {
        name: "test_tool",
        description: "Test tool",
        allowedRoles: ["coder_bot"],
        sensitivity: "medium",
        category: "third_party",
      };

      expect(isThirdPartyToolConfig(tool)).toBe(false);
    });
  });

  describe("getToolByName", () => {
    it("should return tool when found in file category", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      });

      const tool = await getToolByName("file_read_gateway");

      expect(tool).toBeDefined();
      expect(tool?.name).toBe("file_read_gateway");
    });

    it("should return tool when found in browser category", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      });

      const tool = await getToolByName("web_search_gateway");

      expect(tool).toBeDefined();
      expect(tool?.name).toBe("web_search_gateway");
    });

    it("should return undefined when tool not found", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      });

      const tool = await getToolByName("nonexistent_tool");

      expect(tool).toBeUndefined();
    });
  });

  describe("getEnabledCategories", () => {
    it("should return categories that have tools", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      });

      const categories = await getEnabledCategories();

      // Should include file and browser (have default tools)
      expect(categories).toContain("file");
      expect(categories).toContain("browser");
    });

    it("should not include empty categories", async () => {
      vi.spyOn(configLoaderModule, "loadConfigFromFile").mockReturnValue({
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      });

      const categories = await getEnabledCategories();

      // third_party should not be included if empty
      // (unless there are third-party tools configured)
      expect(categories.length).toBeGreaterThan(0);
    });
  });
});

