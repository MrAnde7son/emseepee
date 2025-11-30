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
  const result = await executeQuery<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]);
  return result.length > 0;
}

export async function addMcpOauthClients(): Promise<void> {
  const config = getDatabaseConfig();
  if (config.type === "postgres") {
    const exists = await tableExistsPostgres("mcp_oauth_clients");
    if (exists) {
      return;
    }

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
        id SERIAL PRIMARY KEY,
        mcp_id VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(255),
        client_id VARCHAR(255) NOT NULL,
        client_secret VARCHAR(255),
        registration_client_uri VARCHAR(1024),
        registration_access_token VARCHAR(1024),
        redirect_uri VARCHAR(1024),
        issuer VARCHAR(1024),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (mcp_id, tenant_id)
      )
    `);
    logger.info("[DB] mcp_oauth_clients table created (PostgreSQL)");
  } else {
    const exists = await tableExistsSqlite("mcp_oauth_clients");
    if (exists) {
      return;
    }

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mcp_id TEXT NOT NULL,
        tenant_id TEXT,
        client_id TEXT NOT NULL,
        client_secret TEXT,
        registration_client_uri TEXT,
        registration_access_token TEXT,
        redirect_uri TEXT,
        issuer TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (mcp_id, tenant_id)
      )
    `);
    logger.info("[DB] mcp_oauth_clients table created (SQLite)");
  }
}
