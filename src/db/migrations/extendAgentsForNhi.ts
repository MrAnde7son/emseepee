import { executeQuery, executeUpdate, getDatabaseConfig } from "../connection.js";
import { logger } from "../../logger.js";

async function columnExistsPostgres(table: string, column: string): Promise<boolean> {
  const result = await executeQuery<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    ) as exists`,
    [table, column]
  );
  return result[0]?.exists === true;
}

async function columnExistsSqlite(table: string, column: string): Promise<boolean> {
  const result = await executeQuery<{ name: string }>(`PRAGMA table_info(${table})`);
  return result.some((row) => row.name === column);
}

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
  isPostgres: boolean
): Promise<void> {
  const exists = isPostgres
    ? await columnExistsPostgres(table, column)
    : await columnExistsSqlite(table, column);
  if (exists) {
    return;
  }

  await executeUpdate(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export async function extendAgentsForNhi(): Promise<void> {
  const config = getDatabaseConfig();
  const isPostgres = config.type === "postgres";

  if (isPostgres) {
    await addColumnIfMissing("agents", "kind", "VARCHAR(50) DEFAULT 'agent'", true);
    await addColumnIfMissing("agents", "idp_type", "VARCHAR(50)", true);
    await addColumnIfMissing("agents", "idp_object_id", "VARCHAR(255)", true);
    await addColumnIfMissing("agents", "metadata", "JSONB", true);
    logger.info("[DB] agents table extended for NHI (PostgreSQL)");
  } else {
    await addColumnIfMissing("agents", "kind", "TEXT DEFAULT 'agent'", false);
    await addColumnIfMissing("agents", "idp_type", "TEXT", false);
    await addColumnIfMissing("agents", "idp_object_id", "TEXT", false);
    await addColumnIfMissing("agents", "metadata", "TEXT", false);
    logger.info("[DB] agents table extended for NHI (SQLite)");
  }
}
