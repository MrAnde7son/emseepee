import { executeQuery, executeQueryOne, executeUpdate, getDatabaseConfig, isDatabaseInitialized } from "../connection.js";
import type {
  McpServerProxyRegistry,
  ToolPolicyConfig,
  ThirdPartyToolConfig,
  PolicyRule,
} from "../../config.js";
import { logger } from "../../logger.js";

const CONFIG_KEYS = {
  MCP_SERVER_PROXIES: "mcpServerProxies",
  TOOLS_PROXIES: "toolsProxies",
  POLICY_RULES: "policyRules",
} as const;

/**
 * Get config value from database
 */
async function getConfigValue<T>(key: string): Promise<T | null> {
  // Check if database is initialized before trying to use it
  if (!isDatabaseInitialized()) {
    return null;
  }

  try {
    const config = getDatabaseConfig();
    const result = await executeQueryOne<{ value: string | unknown }>(
      config.type === "postgres"
        ? `SELECT value FROM config WHERE key = $1`
        : `SELECT value FROM config WHERE key = ?`,
      [key]
    );

    if (!result) {
      return null;
    }

    // Parse JSON value
    // Both PostgreSQL and SQLite store as text/JSONB, but we need to handle them
    if (typeof result.value === "string") {
      return JSON.parse(result.value) as T;
    } else {
      // PostgreSQL JSONB might be returned as object
      return result.value as T;
    }
  } catch (error) {
    // If database query fails, return null to fall back to file
    logger.warn(`[CONFIG] Failed to get config value ${key} from database:`, error);
    return null;
  }
}

/**
 * Set config value in database
 */
async function setConfigValue<T>(key: string, value: T): Promise<void> {
  // Check if database is initialized before trying to use it
  if (!isDatabaseInitialized()) {
    // Silently fail if database is not available - fall back to file storage
    logger.warn(`[CONFIG] Database not initialized. Cannot save config value ${key} to database.`);
    return;
  }

  try {
    const config = getDatabaseConfig();
    
    // Serialize value to JSON string
    const serialized = JSON.stringify(value);

    // Check if exists
    const existing = await executeQueryOne<{ id: number }>(
      config.type === "postgres" 
        ? `SELECT id FROM config WHERE key = $1`
        : `SELECT id FROM config WHERE key = ?`,
      [key]
    );

    if (existing) {
      // Update
      if (config.type === "postgres") {
        await executeUpdate(
          `UPDATE config SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE key = $2`,
          [serialized, key]
        );
      } else {
        await executeUpdate(
          `UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`,
          [serialized, key]
        );
      }
    } else {
      // Insert
      if (config.type === "postgres") {
        await executeUpdate(
          `INSERT INTO config (key, value) VALUES ($1, $2::jsonb)`,
          [key, serialized]
        );
      } else {
        await executeUpdate(
          `INSERT INTO config (key, value) VALUES (?, ?)`,
          [key, serialized]
        );
      }
    }
  } catch (error) {
    logger.error(`[CONFIG] Failed to set config value ${key} in database:`, error);
    throw error;
  }
}

/**
 * Get MCP server proxies from database
 */
export async function getMcpServerProxiesFromDb(): Promise<McpServerProxyRegistry> {
  const result = await getConfigValue<McpServerProxyRegistry>(CONFIG_KEYS.MCP_SERVER_PROXIES);
  return result || {};
}

/**
 * Save MCP server proxies to database
 */
export async function saveMcpServerProxiesToDb(proxies: McpServerProxyRegistry): Promise<void> {
  await setConfigValue(CONFIG_KEYS.MCP_SERVER_PROXIES, proxies);
  if (isDatabaseInitialized()) {
    logger.info("[CONFIG] MCP server proxies saved to database");
  }
}

/**
 * Get tools proxies from database
 */
export async function getToolsProxiesFromDb(): Promise<Record<string, ToolPolicyConfig | ThirdPartyToolConfig>> {
  const result = await getConfigValue<Record<string, ToolPolicyConfig | ThirdPartyToolConfig>>(
    CONFIG_KEYS.TOOLS_PROXIES
  );
  return result || {};
}

/**
 * Save tools proxies to database
 */
export async function saveToolsProxiesToDb(
  tools: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>
): Promise<void> {
  await setConfigValue(CONFIG_KEYS.TOOLS_PROXIES, tools);
  if (isDatabaseInitialized()) {
    logger.info("[CONFIG] Tools proxies saved to database");
  }
}

/**
 * Get policy rules from database
 */
export async function getPolicyRulesFromDb(): Promise<PolicyRule[]> {
  const result = await getConfigValue<PolicyRule[]>(CONFIG_KEYS.POLICY_RULES);
  return result || [];
}

/**
 * Save policy rules to database
 */
export async function savePolicyRulesToDb(rules: PolicyRule[]): Promise<void> {
  await setConfigValue(CONFIG_KEYS.POLICY_RULES, rules);
  if (isDatabaseInitialized()) {
    logger.info("[CONFIG] Policy rules saved to database");
  }
}

/**
 * Get all config from database
 */
export async function getAllConfigFromDb(): Promise<{
  mcpServerProxies: McpServerProxyRegistry;
  toolsProxies: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>;
  policyRules: PolicyRule[];
}> {
  const [mcpServerProxies, toolsProxies, policyRules] = await Promise.all([
    getMcpServerProxiesFromDb(),
    getToolsProxiesFromDb(),
    getPolicyRulesFromDb(),
  ]);

  return {
    mcpServerProxies,
    toolsProxies,
    policyRules,
  };
}

