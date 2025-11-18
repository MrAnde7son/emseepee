import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  McpServerProxyRegistry,
  ToolCategoryRegistry,
  McpServerProxyConfig,
  ThirdPartyToolConfig,
  ToolPolicyConfig,
  PolicyRule,
} from "./config.js";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Substitute environment variables in a string
 * Supports ${VAR_NAME} syntax
 */
function substituteEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      logger.warn(`[CONFIG] Environment variable ${varName} not found, using empty string`);
      return "";
    }
    return envValue;
  });
}

/**
 * Recursively substitute environment variables in an object
 */
function substituteEnvVarsInObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return substituteEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVarsInObject);
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsInObject(value);
    }
    return result;
  }
  return obj;
}

/**
 * Load configuration from JSON file
 * Unified structure: mcpServerProxies, toolsProxies, and policyRules
 */
export interface ConfigFile {
  mcpServerProxies?: Record<string, McpServerProxyConfig>;
  toolsProxies?: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>;
  policyRules?: PolicyRule[];
}

export function loadConfigFromFile(configPath?: string): {
  mcpServerProxies: McpServerProxyRegistry;
  toolsProxies: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>;
  policyRules: PolicyRule[];
} {
  // Default config path: config.json in project root
  const defaultConfigPath = join(__dirname, "..", "config.json");
  const finalConfigPath = configPath || process.env.CONFIG_PATH || defaultConfigPath;

  try {
    logger.info(`[CONFIG] Loading configuration from: ${finalConfigPath}`);
    const configContent = readFileSync(finalConfigPath, "utf-8");
    const configJson = JSON.parse(configContent) as ConfigFile;

    // Substitute environment variables
    const processedConfig = substituteEnvVarsInObject(configJson) as ConfigFile;

    return {
      mcpServerProxies: (processedConfig.mcpServerProxies || {}) as McpServerProxyRegistry,
      toolsProxies: (processedConfig.toolsProxies || {}) as Record<string, ToolPolicyConfig | ThirdPartyToolConfig>,
      policyRules: (processedConfig.policyRules || []) as PolicyRule[],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logger.info(`[CONFIG] Config file not found at ${finalConfigPath}, using defaults`);
      return {
        mcpServerProxies: {},
        toolsProxies: {},
        policyRules: [],
      };
    }
    logger.error(`[CONFIG] Error loading config file: ${finalConfigPath}`, error);
    throw error;
  }
}

