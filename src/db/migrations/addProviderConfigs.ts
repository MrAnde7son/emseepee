import { getDatabaseConfig, executeUpdate, executeQuery } from "../connection.js";
import { logger } from "../../logger.js";

/**
 * Migration: Add provider_configs table if it doesn't exist
 * This handles the case where the database was created before provider_configs was added
 */
export async function addProviderConfigsTable(): Promise<void> {
  const config = getDatabaseConfig();
  
  try {
    // Check if table exists
    let tableExists = false;
    if (config.type === "postgres") {
      const result = await executeQuery<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'provider_configs'
        ) as exists`
      );
      tableExists = result[0]?.exists === true;
    } else {
      const result = await executeQuery<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='provider_configs'`
      );
      tableExists = result.length > 0;
    }

    if (tableExists) {
      logger.info("[MIGRATION] provider_configs table already exists");
      return;
    }

    logger.info("[MIGRATION] Adding provider_configs table...");

    if (config.type === "postgres") {
      await executeUpdate(`
        CREATE TABLE provider_configs (
          id SERIAL PRIMARY KEY,
          provider_id VARCHAR(255) UNIQUE NOT NULL,
          config JSONB NOT NULL,
          enabled BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await executeUpdate(`
        CREATE INDEX idx_provider_configs_provider_id ON provider_configs(provider_id)
      `);
      await executeUpdate(`
        CREATE INDEX idx_provider_configs_enabled ON provider_configs(enabled)
      `);
    } else {
      await executeUpdate(`
        CREATE TABLE provider_configs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider_id TEXT UNIQUE NOT NULL,
          config TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await executeUpdate(`CREATE INDEX idx_provider_configs_provider_id ON provider_configs(provider_id)`);
      await executeUpdate(`CREATE INDEX idx_provider_configs_enabled ON provider_configs(enabled)`);
    }

    logger.info("[MIGRATION] provider_configs table created successfully");
  } catch (error) {
    logger.error("[MIGRATION] Failed to add provider_configs table:", error);
    throw error;
  }
}

