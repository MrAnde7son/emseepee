import { executeQuery, executeUpdate, getDatabaseConfig } from "../connection.js";
import type { Agent } from "../../config.js";
import { logger } from "../../logger.js";

/**
 * Save an agent to the database
 */
export async function saveAgentToDb(agent: Agent): Promise<void> {
  const config = getDatabaseConfig();
  
  if (config.type === "postgres") {
    await executeUpdate(
      `INSERT INTO agents (
        hakuna_id, name, description, provider_id, provider_native_id,
        role, env, tenant_id, owner, metadata, enabled, created_at, updated_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (hakuna_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        provider_id = EXCLUDED.provider_id,
        provider_native_id = EXCLUDED.provider_native_id,
        role = EXCLUDED.role,
        env = EXCLUDED.env,
        tenant_id = EXCLUDED.tenant_id,
        owner = EXCLUDED.owner,
        metadata = EXCLUDED.metadata,
        enabled = EXCLUDED.enabled,
        updated_at = EXCLUDED.updated_at,
        last_seen_at = EXCLUDED.last_seen_at`,
      [
        agent.id,
        agent.name,
        agent.description ?? null,
        agent.providerId,
        agent.providerNativeId ?? null,
        agent.role ?? null,
        agent.env ?? null,
        agent.tenantId ?? null,
        agent.owner ?? null,
        agent.metadata ? JSON.stringify(agent.metadata) : null,
        agent.enabled,
        agent.createdAt || new Date().toISOString(),
        agent.updatedAt || new Date().toISOString(),
        agent.lastSeenAt ?? null,
      ]
    );
  } else {
    // SQLite
    await executeUpdate(
      `INSERT OR REPLACE INTO agents (
        hakuna_id, name, description, provider_id, provider_native_id,
        role, env, tenant_id, owner, metadata, enabled, created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        agent.name,
        agent.description ?? null,
        agent.providerId,
        agent.providerNativeId ?? null,
        agent.role ?? null,
        agent.env ?? null,
        agent.tenantId ?? null,
        agent.owner ?? null,
        agent.metadata ? JSON.stringify(agent.metadata) : null,
        agent.enabled ? 1 : 0,
        agent.createdAt || new Date().toISOString(),
        agent.updatedAt || new Date().toISOString(),
        agent.lastSeenAt ?? null,
      ]
    );
  }
}

/**
 * Get an agent from the database by Hakuna ID
 */
export async function getAgentFromDb(hakunaId: string): Promise<Agent | null> {
  const config = getDatabaseConfig();
  
  let result: any[];
  if (config.type === "postgres") {
    result = await executeQuery<{
      hakuna_id: string;
      name: string;
      description: string | null;
      provider_id: string;
      provider_native_id: string | null;
      role: string | null;
      env: string | null;
      tenant_id: string | null;
      owner: string | null;
      metadata: string | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
      last_seen_at: string | null;
    }>(
      `SELECT * FROM agents WHERE hakuna_id = $1`,
      [hakunaId]
    );
  } else {
    result = await executeQuery<{
      hakuna_id: string;
      name: string;
      description: string | null;
      provider_id: string;
      provider_native_id: string | null;
      role: string | null;
      env: string | null;
      tenant_id: string | null;
      owner: string | null;
      metadata: string | null;
      enabled: number;
      created_at: string;
      updated_at: string;
      last_seen_at: string | null;
    }>(
      `SELECT * FROM agents WHERE hakuna_id = ?`,
      [hakunaId]
    );
  }

  if (result.length === 0) {
    return null;
  }

  const row = result[0];
  return {
    id: row.hakuna_id,
    name: row.name,
    description: row.description ?? undefined,
    providerId: row.provider_id,
    providerNativeId: row.provider_native_id ?? undefined,
    role: row.role ?? undefined,
    env: row.env ?? undefined,
    tenantId: row.tenant_id ?? undefined,
    owner: row.owner !== null ? row.owner : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    enabled: config.type === "postgres" ? row.enabled : row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at ?? undefined,
  };
}

/**
 * Get all agents from the database
 */
export async function getAllAgentsFromDb(): Promise<Agent[]> {
  const config = getDatabaseConfig();
  
  let result: any[];
  if (config.type === "postgres") {
    result = await executeQuery<{
      hakuna_id: string;
      name: string;
      description: string | null;
      provider_id: string;
      provider_native_id: string | null;
      role: string | null;
      env: string | null;
      tenant_id: string | null;
      owner: string | null;
      metadata: string | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
      last_seen_at: string | null;
    }>(`SELECT * FROM agents ORDER BY created_at DESC`);
  } else {
    result = await executeQuery<{
      hakuna_id: string;
      name: string;
      description: string | null;
      provider_id: string;
      provider_native_id: string | null;
      role: string | null;
      env: string | null;
      tenant_id: string | null;
      owner: string | null;
      metadata: string | null;
      enabled: number;
      created_at: string;
      updated_at: string;
      last_seen_at: string | null;
    }>(`SELECT * FROM agents ORDER BY created_at DESC`);
  }

  return result.map((row) => ({
    id: row.hakuna_id,
    name: row.name,
    description: row.description ?? undefined,
    providerId: row.provider_id,
    providerNativeId: row.provider_native_id ?? undefined,
    role: row.role ?? undefined,
    env: row.env ?? undefined,
    tenantId: row.tenant_id ?? undefined,
    owner: row.owner !== null ? row.owner : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    enabled: config.type === "postgres" ? row.enabled : row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at ?? undefined,
  }));
}

/**
 * Get agents by provider ID
 */
export async function getAgentsByProviderFromDb(providerId: string): Promise<Agent[]> {
  const config = getDatabaseConfig();
  
  let result: any[];
  if (config.type === "postgres") {
    result = await executeQuery<{
      hakuna_id: string;
      name: string;
      description: string | null;
      provider_id: string;
      provider_native_id: string | null;
      role: string | null;
      env: string | null;
      tenant_id: string | null;
      owner: string | null;
      metadata: string | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
      last_seen_at: string | null;
    }>(
      `SELECT * FROM agents WHERE provider_id = $1 ORDER BY created_at DESC`,
      [providerId]
    );
  } else {
    result = await executeQuery<{
      hakuna_id: string;
      name: string;
      description: string | null;
      provider_id: string;
      provider_native_id: string | null;
      role: string | null;
      env: string | null;
      tenant_id: string | null;
      owner: string | null;
      metadata: string | null;
      enabled: number;
      created_at: string;
      updated_at: string;
      last_seen_at: string | null;
    }>(
      `SELECT * FROM agents WHERE provider_id = ? ORDER BY created_at DESC`,
      [providerId]
    );
  }

  return result.map((row) => ({
    id: row.hakuna_id,
    name: row.name,
    description: row.description ?? undefined,
    providerId: row.provider_id,
    providerNativeId: row.provider_native_id ?? undefined,
    role: row.role ?? undefined,
    env: row.env ?? undefined,
    tenantId: row.tenant_id ?? undefined,
    owner: row.owner !== null ? row.owner : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    enabled: config.type === "postgres" ? row.enabled : row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at ?? undefined,
  }));
}

/**
 * Delete an agent from the database
 */
export async function deleteAgentFromDb(hakunaId: string): Promise<void> {
  const config = getDatabaseConfig();
  
  if (config.type === "postgres") {
    await executeUpdate(`DELETE FROM agents WHERE hakuna_id = $1`, [hakunaId]);
  } else {
    await executeUpdate(`DELETE FROM agents WHERE hakuna_id = ?`, [hakunaId]);
  }
}

/**
 * Update agent last seen timestamp
 */
export async function updateAgentLastSeen(hakunaId: string): Promise<void> {
  const config = getDatabaseConfig();
  const now = new Date().toISOString();
  
  if (config.type === "postgres") {
    await executeUpdate(
      `UPDATE agents SET last_seen_at = $1 WHERE hakuna_id = $2`,
      [now, hakunaId]
    );
  } else {
    await executeUpdate(
      `UPDATE agents SET last_seen_at = ? WHERE hakuna_id = ?`,
      [now, hakunaId]
    );
  }
}

