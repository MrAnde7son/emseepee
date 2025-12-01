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

export async function addMcpClientsTable(): Promise<void> {
  const config = getDatabaseConfig();

  if (config.type === "postgres") {
    const exists = await tableExistsPostgres("mcp_clients");
    if (exists) {
      return;
    }

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS mcp_clients (
        client_id_url TEXT PRIMARY KEY,
        client_name TEXT,
        client_uri TEXT,
        logo_uri TEXT,
        redirect_uris JSONB,
        raw_json JSONB,
        first_seen_at TIMESTAMP,
        last_seen_at TIMESTAMP,
        last_fetched_at TIMESTAMP
      )
    `);
    logger.info("[DB] mcp_clients table created (PostgreSQL)");
  } else {
    const exists = await tableExistsSqlite("mcp_clients");
    if (exists) {
      return;
    }

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS mcp_clients (
        client_id_url TEXT PRIMARY KEY,
        client_name TEXT,
        client_uri TEXT,
        logo_uri TEXT,
        redirect_uris TEXT,
        raw_json TEXT,
        first_seen_at DATETIME,
        last_seen_at DATETIME,
        last_fetched_at DATETIME
      )
    `);
    logger.info("[DB] mcp_clients table created (SQLite)");
  }
}

