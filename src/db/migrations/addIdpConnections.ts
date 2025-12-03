import { executeQuery, executeUpdate, getDatabaseConfig } from "../connection.js";
import { logger } from "../../logger.js";

async function tableExistsPostgres(table: string): Promise<boolean> {
  const result = await executeQuery<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) as exists`,
    [table]
  );
  return result[0]?.exists === true;
}

async function tableExistsSqlite(table: string): Promise<boolean> {
  const result = await executeQuery<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [table]
  );
  return result.length > 0;
}

export async function addIdpConnections(): Promise<void> {
  const config = getDatabaseConfig();
  if (config.type === "postgres") {
    const exists = await tableExistsPostgres("idp_connections");
    if (exists) {
      return;
    }

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS idp_connections (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        issuer VARCHAR(1024) NOT NULL,
        client_id VARCHAR(255) NOT NULL,
        client_secret VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tenant_id, type)
      )
    `);

    await executeUpdate(`
      CREATE INDEX IF NOT EXISTS idx_idp_connections_tenant_id ON idp_connections(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_idp_connections_type ON idp_connections(type);
      CREATE INDEX IF NOT EXISTS idx_idp_connections_tenant_type ON idp_connections(tenant_id, type);
    `);
    logger.info("[DB] idp_connections table created (PostgreSQL)");
  } else {
    const exists = await tableExistsSqlite("idp_connections");
    if (exists) {
      return;
    }

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS idp_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        type TEXT NOT NULL,
        issuer TEXT NOT NULL,
        client_id TEXT NOT NULL,
        client_secret TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tenant_id, type)
      )
    `);

    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_idp_connections_tenant_id ON idp_connections(tenant_id)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_idp_connections_type ON idp_connections(type)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_idp_connections_tenant_type ON idp_connections(tenant_id, type)`);
    logger.info("[DB] idp_connections table created (SQLite)");
  }
}
