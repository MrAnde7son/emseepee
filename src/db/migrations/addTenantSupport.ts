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

async function columnExistsPostgres(table: string, column: string): Promise<boolean> {
  const result = await executeQuery<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
    ) as exists`,
    [table, column]
  );
  return result[0]?.exists === true;
}

async function columnExistsSqlite(table: string, column: string): Promise<boolean> {
  const result = await executeQuery<{ name: string }>(`PRAGMA table_info(${table})`);
  return result.some((row) => row.name === column);
}

async function rebuildSqliteTable(
  table: string,
  newSchema: string,
  copyStatement: string
): Promise<void> {
  await executeUpdate(`ALTER TABLE ${table} RENAME TO ${table}_old`);
  await executeUpdate(newSchema);
  await executeUpdate(copyStatement);
  await executeUpdate(`DROP TABLE ${table}_old`);
}

async function ensureTenantColumnPostgres(
  table: string,
  columnType: string = "VARCHAR(255)"
): Promise<void> {
  const hasColumn = await columnExistsPostgres(table, "tenant_id");
  if (!hasColumn) {
    await executeUpdate(`ALTER TABLE ${table} ADD COLUMN tenant_id ${columnType}`);
  }
}

async function ensureTenantIndexesPostgres(table: string, columns: string[]): Promise<void> {
  for (const column of columns) {
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_${table}_${column} ON ${table}(${column})`);
  }
}

async function addTenantSupportPostgres(): Promise<void> {
  const hasConfig = await tableExistsPostgres("config");
  if (hasConfig) {
    await ensureTenantColumnPostgres("config");
    await executeUpdate(`ALTER TABLE config DROP CONSTRAINT IF EXISTS config_key_key`);
    await executeUpdate(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'config' AND constraint_name = 'config_key_tenant_unique'
        ) THEN
          ALTER TABLE config ADD CONSTRAINT config_key_tenant_unique UNIQUE (key, tenant_id);
        END IF;
      END$$;
    `);
  }

  const hasProviderConfigs = await tableExistsPostgres("provider_configs");
  if (hasProviderConfigs) {
    await ensureTenantColumnPostgres("provider_configs");
    await executeUpdate(`ALTER TABLE provider_configs DROP CONSTRAINT IF EXISTS provider_configs_provider_id_key`);
    await executeUpdate(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'provider_configs' AND constraint_name = 'provider_configs_provider_tenant_unique'
        ) THEN
          ALTER TABLE provider_configs ADD CONSTRAINT provider_configs_provider_tenant_unique UNIQUE (provider_id, tenant_id);
        END IF;
      END$$;
    `);
    await ensureTenantIndexesPostgres("provider_configs", ["tenant_id"]);
  }

  const hasUsers = await tableExistsPostgres("users");
  if (hasUsers) {
    await ensureTenantColumnPostgres("users");
    await ensureTenantIndexesPostgres("users", ["tenant_id"]);
  }

  const hasEvents = await tableExistsPostgres("events");
  if (hasEvents) {
    await ensureTenantColumnPostgres("events");
    await ensureTenantIndexesPostgres("events", ["tenant_id"]);
  }
}

async function addTenantSupportSqlite(): Promise<void> {
  // Users table can be altered in place
  const usersHasTenant = await columnExistsSqlite("users", "tenant_id");
  if (!usersHasTenant) {
    await executeUpdate(`ALTER TABLE users ADD COLUMN tenant_id TEXT`);
  }

  // Events table can be altered in place
  const eventsHasTenant = await columnExistsSqlite("events", "tenant_id");
  if (!eventsHasTenant) {
    await executeUpdate(`ALTER TABLE events ADD COLUMN tenant_id TEXT`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id)`);
  }

  // Config table requires rebuild to replace UNIQUE constraint
  const configHasTenant = await columnExistsSqlite("config", "tenant_id");
  if (!configHasTenant) {
    await rebuildSqliteTable(
      "config",
      `
        CREATE TABLE config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL,
          tenant_id TEXT,
          value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (key, tenant_id)
        )
      `,
      `
        INSERT INTO config (key, tenant_id, value, created_at, updated_at)
        SELECT key, NULL, value, created_at, updated_at FROM config_old
      `
    );
  }

  // Provider configs also require rebuild to support composite unique constraint
  const providerConfigsHasTenant = await columnExistsSqlite("provider_configs", "tenant_id");
  if (!providerConfigsHasTenant) {
    await rebuildSqliteTable(
      "provider_configs",
      `
        CREATE TABLE provider_configs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider_id TEXT NOT NULL,
          tenant_id TEXT,
          config TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (provider_id, tenant_id)
        )
      `,
      `
        INSERT INTO provider_configs (provider_id, tenant_id, config, enabled, created_at, updated_at)
        SELECT provider_id, NULL, config, enabled, created_at, updated_at FROM provider_configs_old
      `
    );
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant_id ON provider_configs(tenant_id)`);
  }
}

export async function addTenantSupport(): Promise<void> {
  const config = getDatabaseConfig();
  try {
    if (config.type === "postgres") {
      await addTenantSupportPostgres();
    } else {
      await addTenantSupportSqlite();
    }
    logger.info("[MIGRATION] Tenant support ensured for config, provider configs, users, and events tables");
  } catch (error) {
    logger.error("[MIGRATION] Failed to add tenant support:", error);
    throw error;
  }
}

