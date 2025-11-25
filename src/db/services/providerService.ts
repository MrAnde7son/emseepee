import { executeQuery, executeUpdate, getDatabaseConfig } from "../connection.js";
import { logger } from "../../logger.js";

export interface ProviderConfig {
  providerId: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Save provider configuration to database
 */
export async function saveProviderConfig(
  providerId: string,
  config: Record<string, unknown>,
  tenantId?: string
): Promise<void> {
  const dbConfig = getDatabaseConfig();
  const now = new Date().toISOString();
  const tenantParam = tenantId ?? null;

  if (dbConfig.type === "postgres") {
    await executeUpdate(
      `INSERT INTO provider_configs (
        provider_id, tenant_id, config, enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (provider_id, tenant_id) DO UPDATE SET
        config = EXCLUDED.config,
        enabled = EXCLUDED.enabled,
        updated_at = EXCLUDED.updated_at`,
      [providerId, tenantParam, JSON.stringify(config), true, now, now]
    );
  } else {
    // SQLite
    await executeUpdate(
      `INSERT OR REPLACE INTO provider_configs (
        provider_id, tenant_id, config, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [providerId, tenantParam, JSON.stringify(config), 1, now, now]
    );
  }
}

/**
 * Get provider configuration from database
 */
export async function getProviderConfig(providerId: string, tenantId?: string): Promise<ProviderConfig | null> {
  const dbConfig = getDatabaseConfig();
  const tenantParam = tenantId ?? null;

  let result: any[];
  if (dbConfig.type === "postgres") {
    result = await executeQuery<{
      provider_id: string;
      config: string | unknown;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM provider_configs WHERE provider_id = $1 AND tenant_id IS NOT DISTINCT FROM $2`,
      [providerId, tenantParam]
    );
  } else {
    result = await executeQuery<{
      provider_id: string;
      config: string;
      enabled: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM provider_configs WHERE provider_id = ? AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)`,
      [providerId, tenantParam, tenantParam]
    );
  }

  if (result.length === 0) {
    if (tenantParam) {
      return getProviderConfig(providerId, undefined);
    }
    return null;
  }

  const row = result[0];
  const configValue = typeof row.config === "string" ? JSON.parse(row.config) : row.config;

  return {
    providerId: row.provider_id,
    config: configValue,
    enabled: dbConfig.type === "postgres" ? row.enabled : row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all provider configurations
 */
export async function getAllProviderConfigs(tenantId?: string): Promise<ProviderConfig[]> {
  const dbConfig = getDatabaseConfig();
  const tenantParam = tenantId ?? null;

  let result: any[];
  if (dbConfig.type === "postgres") {
    result = await executeQuery<{
      provider_id: string;
      config: string | unknown;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM provider_configs 
       WHERE enabled = true AND tenant_id IS NOT DISTINCT FROM $1`,
      [tenantParam]
    );
  } else {
    result = await executeQuery<{
      provider_id: string;
      config: string;
      enabled: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM provider_configs 
       WHERE enabled = 1 AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)`,
      [tenantParam, tenantParam]
    );
  }

  return result.map((row) => {
    const configValue = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
    return {
      providerId: row.provider_id,
      config: configValue,
      enabled: dbConfig.type === "postgres" ? row.enabled : row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Delete provider configuration
 */
export async function deleteProviderConfig(providerId: string, tenantId?: string): Promise<void> {
  const dbConfig = getDatabaseConfig();
  const tenantParam = tenantId ?? null;

  if (dbConfig.type === "postgres") {
    await executeUpdate(`DELETE FROM provider_configs WHERE provider_id = $1 AND tenant_id IS NOT DISTINCT FROM $2`, [providerId, tenantParam]);
  } else {
    await executeUpdate(`DELETE FROM provider_configs WHERE provider_id = ? AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)`, [providerId, tenantParam, tenantParam]);
  }
}

/**
 * Disable provider configuration (soft delete)
 */
export async function disableProviderConfig(providerId: string, tenantId?: string): Promise<void> {
  const dbConfig = getDatabaseConfig();
  const now = new Date().toISOString();
  const tenantParam = tenantId ?? null;

  if (dbConfig.type === "postgres") {
    await executeUpdate(
      `UPDATE provider_configs SET enabled = false, updated_at = $1 
       WHERE provider_id = $2 AND tenant_id IS NOT DISTINCT FROM $3`,
      [now, providerId, tenantParam]
    );
  } else {
    await executeUpdate(
      `UPDATE provider_configs SET enabled = 0, updated_at = ? 
       WHERE provider_id = ? AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)`,
      [now, providerId, tenantParam, tenantParam]
    );
  }
}

