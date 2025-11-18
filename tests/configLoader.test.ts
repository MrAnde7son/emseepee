import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { loadConfigFromFile } from "../src/configLoader.js";
import type { ConfigFile } from "../src/configLoader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("Config Loader", () => {
  const testConfigPath = join(__dirname, "test-config.json");
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Clean up test config file
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
    // Restore environment
    process.env = originalEnv;
  });

  describe("File Loading", () => {
    it("should load configuration from valid JSON file", () => {
      const config: ConfigFile = {
        mcpServerProxies: {
          test_proxy: {
            name: "test_proxy",
            command: "node",
            args: ["test.js"],
            defaultPolicy: {
              allowedRoles: ["admin"],
              sensitivity: "low",
            },
          },
        },
        toolsProxies: {
          test_tool: {
            name: "test_tool",
            description: "Test tool",
            allowedRoles: ["coder_bot"],
            sensitivity: "medium",
            category: "file",
          },
        },
        policyRules: [
          {
            name: "test_rule",
            condition: {
              toolName: "test_tool",
            },
            action: {
              operation: "allow",
            },
          },
        ],
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile(testConfigPath);

      expect(result.mcpServerProxies).toHaveProperty("test_proxy");
      expect(result.toolsProxies).toHaveProperty("test_tool");
      expect(result.policyRules).toHaveLength(1);
      expect(result.policyRules[0].name).toBe("test_rule");
    });

    it("should return empty defaults when file does not exist", () => {
      const result = loadConfigFromFile("/nonexistent/path/config.json");

      expect(result.mcpServerProxies).toEqual({});
      expect(result.toolsProxies).toEqual({});
      expect(result.policyRules).toEqual([]);
    });

    it("should return empty defaults when file is missing optional sections", () => {
      const config: ConfigFile = {};
      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile(testConfigPath);

      expect(result.mcpServerProxies).toEqual({});
      expect(result.toolsProxies).toEqual({});
      expect(result.policyRules).toEqual([]);
    });

    it("should throw error for invalid JSON", () => {
      writeFileSync(testConfigPath, "invalid json {");

      expect(() => {
        loadConfigFromFile(testConfigPath);
      }).toThrow();
    });
  });

  describe("Environment Variable Substitution", () => {
    it("should substitute environment variables in strings", () => {
      process.env.TEST_TOKEN = "secret-token-123";
      process.env.TEST_URL = "https://api.example.com";

      const config: ConfigFile = {
        mcpServerProxies: {
          test_proxy: {
            name: "test_proxy",
            command: "node",
            args: ["test.js"],
            env: {
              TOKEN: "${TEST_TOKEN}",
              URL: "${TEST_URL}",
            },
            defaultPolicy: {
              allowedRoles: ["admin"],
              sensitivity: "low",
            },
          },
        },
        toolsProxies: {},
        policyRules: [],
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile(testConfigPath);

      expect(result.mcpServerProxies.test_proxy.env?.TOKEN).toBe("secret-token-123");
      expect(result.mcpServerProxies.test_proxy.env?.URL).toBe("https://api.example.com");
    });

    it("should substitute environment variables in nested objects", () => {
      process.env.API_KEY = "my-api-key";

      const config: ConfigFile = {
        toolsProxies: {
          test_tool: {
            name: "test_tool",
            description: "Test tool",
            allowedRoles: ["coder_bot"],
            sensitivity: "medium",
            category: "third_party",
            execution: {
              type: "http",
              method: "POST",
              url: "https://api.example.com/endpoint",
              headers: {
                Authorization: "Bearer ${API_KEY}",
              },
            },
            inputSchema: {},
          },
        },
        mcpServerProxies: {},
        policyRules: [],
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile(testConfigPath);

      const tool = result.toolsProxies.test_tool;
      if (tool && "execution" in tool && tool.execution.type === "http") {
        expect(tool.execution.headers?.Authorization).toBe("Bearer my-api-key");
      }
    });

    it("should substitute environment variables in arrays", () => {
      process.env.ARG1 = "value1";
      process.env.ARG2 = "value2";

      const config: ConfigFile = {
        mcpServerProxies: {
          test_proxy: {
            name: "test_proxy",
            command: "node",
            args: ["${ARG1}", "${ARG2}"],
            defaultPolicy: {
              allowedRoles: ["admin"],
              sensitivity: "low",
            },
          },
        },
        toolsProxies: {},
        policyRules: [],
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile(testConfigPath);

      expect(result.mcpServerProxies.test_proxy.args).toEqual(["value1", "value2"]);
    });

    it("should substitute environment variables in policy rule webhook URLs", () => {
      process.env.WEBHOOK_URL = "https://webhook.example.com/webhook";

      const config: ConfigFile = {
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [
          {
            name: "test_rule",
            condition: {
              toolName: "test_tool",
            },
            action: {
              operation: "webhook",
              webhookUrl: "${WEBHOOK_URL}",
              webhookMethod: "POST",
            },
          },
        ],
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile(testConfigPath);

      expect(result.policyRules[0].action.webhookUrl).toBe("https://webhook.example.com/webhook");
    });

    it("should handle missing environment variables", () => {
      // Ensure variable is not set
      delete process.env.MISSING_VAR;

      const config: ConfigFile = {
        mcpServerProxies: {
          test_proxy: {
            name: "test_proxy",
            command: "node",
            args: ["test.js"],
            env: {
              VAR: "${MISSING_VAR}",
            },
            defaultPolicy: {
              allowedRoles: ["admin"],
              sensitivity: "low",
            },
          },
        },
        toolsProxies: {},
        policyRules: [],
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile(testConfigPath);

      // Should substitute with empty string and log warning
      expect(result.mcpServerProxies.test_proxy.env?.VAR).toBe("");
    });

    it("should handle multiple environment variable references in same string", () => {
      process.env.HOST = "api.example.com";
      process.env.PORT = "8080";

      const config: ConfigFile = {
        toolsProxies: {
          test_tool: {
            name: "test_tool",
            description: "Test tool",
            allowedRoles: ["coder_bot"],
            sensitivity: "medium",
            category: "third_party",
            execution: {
              type: "http",
              method: "GET",
              url: "https://${HOST}:${PORT}/endpoint",
            },
            inputSchema: {},
          },
        },
        mcpServerProxies: {},
        policyRules: [],
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile(testConfigPath);

      const tool = result.toolsProxies.test_tool;
      if (tool && "execution" in tool && tool.execution.type === "http") {
        expect(tool.execution.url).toBe("https://api.example.com:8080/endpoint");
      }
    });
  });

  describe("Default Config Path", () => {
    it("should use CONFIG_PATH environment variable if set", () => {
      process.env.CONFIG_PATH = testConfigPath;

      const config: ConfigFile = {
        mcpServerProxies: {},
        toolsProxies: {
          env_tool: {
            name: "env_tool",
            description: "Tool from env path",
            allowedRoles: ["admin"],
            sensitivity: "low",
            category: "file",
          },
        },
        policyRules: [],
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const result = loadConfigFromFile();

      expect(result.toolsProxies).toHaveProperty("env_tool");
    });
  });
});

