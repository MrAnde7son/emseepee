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

function normalizeTenantId(tenantId?: string): string | null {
  if (tenantId === undefined || tenantId === null || tenantId === "") {
    return null;
  }
  return tenantId;
}

/**
 * Get config value from database
 */
export async function getConfigValue<T>(key: string, tenantId?: string): Promise<T | null> {
  // Check if database is initialized before trying to use it
  if (!isDatabaseInitialized()) {
    return null;
  }

  try {
    const config = getDatabaseConfig();
    const tenantParam = normalizeTenantId(tenantId);
    const result = await executeQueryOne<{ value: string | unknown }>(
      config.type === "postgres"
        ? `SELECT value FROM config WHERE key = $1 AND tenant_id IS NOT DISTINCT FROM $2`
        : `SELECT value FROM config WHERE key = ? AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)`,
      config.type === "postgres" ? [key, tenantParam] : [key, tenantParam, tenantParam]
    );

    if (!result) {
      if (tenantParam) {
        return getConfigValue<T>(key, undefined);
      }
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
export async function setConfigValue<T>(key: string, value: T, tenantId?: string): Promise<void> {
  // Check if database is initialized before trying to use it
  if (!isDatabaseInitialized()) {
    // Silently fail if database is not available - fall back to file storage
    logger.warn(`[CONFIG] Database not initialized. Cannot save config value ${key} to database.`);
    return;
  }

  try {
    const config = getDatabaseConfig();
    const tenantParam = normalizeTenantId(tenantId);
    
    // Serialize value to JSON string
    const serialized = JSON.stringify(value);

    // Check if exists
    const existing = await executeQueryOne<{ id: number }>(
      config.type === "postgres" 
        ? `SELECT id FROM config WHERE key = $1 AND tenant_id IS NOT DISTINCT FROM $2`
        : `SELECT id FROM config WHERE key = ? AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)`,
      config.type === "postgres" ? [key, tenantParam] : [key, tenantParam, tenantParam]
    );

    if (existing) {
      // Update
      if (config.type === "postgres") {
        await executeUpdate(
          `UPDATE config SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE key = $2 AND tenant_id IS NOT DISTINCT FROM $3`,
          [serialized, key, tenantParam]
        );
      } else {
        await executeUpdate(
          `UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ? AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)`,
          [serialized, key, tenantParam, tenantParam]
        );
      }
    } else {
      // Insert
      if (config.type === "postgres") {
        await executeUpdate(
          `INSERT INTO config (key, tenant_id, value) VALUES ($1, $2, $3::jsonb)`,
          [key, tenantParam, serialized]
        );
      } else {
        await executeUpdate(
          `INSERT INTO config (key, tenant_id, value) VALUES (?, ?, ?)`,
          [key, tenantParam, serialized]
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
export async function getMcpServerProxiesFromDb(tenantId?: string): Promise<McpServerProxyRegistry> {
  const result = await getConfigValue<McpServerProxyRegistry>(CONFIG_KEYS.MCP_SERVER_PROXIES, tenantId);
  return result || {};
}

/**
 * Save MCP server proxies to database
 */
export async function saveMcpServerProxiesToDb(proxies: McpServerProxyRegistry, tenantId?: string): Promise<void> {
  await setConfigValue(CONFIG_KEYS.MCP_SERVER_PROXIES, proxies, tenantId);
  if (isDatabaseInitialized()) {
    logger.info("[CONFIG] MCP server proxies saved to database");
  }
}

/**
 * Get tools proxies from database
 */
export async function getToolsProxiesFromDb(tenantId?: string): Promise<Record<string, ToolPolicyConfig | ThirdPartyToolConfig>> {
  const result = await getConfigValue<Record<string, ToolPolicyConfig | ThirdPartyToolConfig>>(
    CONFIG_KEYS.TOOLS_PROXIES,
    tenantId
  );
  return result || {};
}

/**
 * Save tools proxies to database
 */
export async function saveToolsProxiesToDb(
  tools: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>,
  tenantId?: string
): Promise<void> {
  await setConfigValue(CONFIG_KEYS.TOOLS_PROXIES, tools, tenantId);
  if (isDatabaseInitialized()) {
    logger.info("[CONFIG] Tools proxies saved to database");
  }
}

/**
 * Get policy rules from database
 */
export async function getPolicyRulesFromDb(tenantId?: string): Promise<PolicyRule[]> {
  const result = await getConfigValue<PolicyRule[]>(CONFIG_KEYS.POLICY_RULES, tenantId);
  return result || [];
}

/**
 * Save policy rules to database
 */
export async function savePolicyRulesToDb(rules: PolicyRule[], tenantId?: string): Promise<void> {
  await setConfigValue(CONFIG_KEYS.POLICY_RULES, rules, tenantId);
  if (isDatabaseInitialized()) {
    logger.info("[CONFIG] Policy rules saved to database");
  }
}

/**
 * Get all config from database
 */
export async function getAllConfigFromDb(tenantId?: string): Promise<{
  mcpServerProxies: McpServerProxyRegistry;
  toolsProxies: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>;
  policyRules: PolicyRule[];
}> {
  const [mcpServerProxies, toolsProxies, policyRules] = await Promise.all([
    getMcpServerProxiesFromDb(tenantId),
    getToolsProxiesFromDb(tenantId),
    getPolicyRulesFromDb(tenantId),
  ]);

  return {
    mcpServerProxies,
    toolsProxies,
    policyRules,
  };
}

