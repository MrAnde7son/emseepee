import { getDatabaseConfig, executeQuery, executeUpdate } from "../connection.js";
import { logger } from "../../logger.js";

/**
 * Migration: ensure agents table has an owner column
 * Handles older databases created before owner was added to the schema.
 */
export async function addOwnerColumnToAgents(): Promise<void> {
  const config = getDatabaseConfig();

  try {
    // If the agents table itself is missing, skip quietly (fresh DBs will create via schema)
    let tableExists = false;
    if (config.type === "postgres") {
      const result = await executeQuery<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'agents'
        ) as exists`
      );
      tableExists = result[0]?.exists === true;
    } else {
      const result = await executeQuery<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='agents'`
      );
      tableExists = result.length > 0;
    }

    if (!tableExists) {
      logger.info("[MIGRATION] agents table missing; creating with owner column...");
      if (config.type === "postgres") {
        await executeUpdate(`
          CREATE TABLE IF NOT EXISTS agents (
            id SERIAL PRIMARY KEY,
            hakuna_id VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            provider_id VARCHAR(255) NOT NULL,
            provider_native_id VARCHAR(255),
            role VARCHAR(255),
            env VARCHAR(255),
            tenant_id VARCHAR(255),
            owner VARCHAR(255),
            metadata JSONB,
            enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP
          )
        `);
        await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_hakuna_id ON agents(hakuna_id)`);
        await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_provider_id ON agents(provider_id)`);
        await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role)`);
        await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id)`);
      } else {
        await executeUpdate(`
          CREATE TABLE IF NOT EXISTS agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hakuna_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            provider_id TEXT NOT NULL,
            provider_native_id TEXT,
            role TEXT,
            env TEXT,
            tenant_id TEXT,
            owner TEXT,
            metadata TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME
          )
        `);
        await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_hakuna_id ON agents(hakuna_id)`);
        await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_provider_id ON agents(provider_id)`);
        await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role)`);
        await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id)`);
      }
      logger.info("[MIGRATION] agents table created with owner column");
      return;
    }

    // Detect whether the column already exists
    let hasColumn = false;
    if (config.type === "postgres") {
      const result = await executeQuery<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'agents'
          AND column_name = 'owner'
        ) as exists`
      );
      hasColumn = result[0]?.exists === true;
    } else {
      const result = await executeQuery<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>(
        `PRAGMA table_info(agents)`
      );
      hasColumn = result.some((row) => row.name === "owner");
    }

    if (hasColumn) {
      logger.info("[MIGRATION] agents.owner column already exists");
      return;
    }

    logger.info("[MIGRATION] Adding owner column to agents table...");
    if (config.type === "postgres") {
      await executeUpdate(`ALTER TABLE agents ADD COLUMN owner VARCHAR(255)`);
    } else {
      await executeUpdate(`ALTER TABLE agents ADD COLUMN owner TEXT`);
    }
    logger.info("[MIGRATION] owner column added to agents table");
  } catch (error) {
    logger.error("[MIGRATION] Failed to add owner column to agents table:", error);
    throw error;
  }
}
