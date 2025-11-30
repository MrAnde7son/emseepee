#!/usr/bin/env node
/**
 * Migration script to migrate existing config.json to database
 * Run this once to migrate your existing configuration
 * 
 * Usage:
 *   node dist/db/migrate.js           # Migrate only if database is empty
 *   node dist/db/migrate.js --force   # Force overwrite existing config
 */

import { initializeDatabase, closeDatabase } from "./connection.js";
import { createSchema, schemaExists } from "./schema.js";
import {
  saveMcpServerProxiesToDb,
  saveToolsProxiesToDb,
  savePolicyRulesToDb,
  getAllConfigFromDb,
  getDistinctTenantIds,
} from "./services/configService.js";
import { loadConfigFromFile } from "../configLoader.js";
import { logger } from "../logger.js";

function resolveTenantId(args: string[]): string | undefined {
  const tenantFlagIndex = args.findIndex((arg) => arg === "--tenant" || arg === "-t");

  if (tenantFlagIndex !== -1) {
    const value = args[tenantFlagIndex + 1];
    if (value && !value.startsWith("-")) {
      return value;
    }
    logger.warn("[MIGRATE] --tenant flag provided without a value. Falling back to all tenants.");
  }

  return undefined;
}

async function resolveTenantsForMigration(explicitTenantId?: string): Promise<(string | undefined)[]> {
  if (explicitTenantId) {
    return [explicitTenantId];
  }

  const tenantIds = await getDistinctTenantIds();
  const normalizedTenants = Array.from(new Set(tenantIds.map((tenant) => tenant ?? undefined)));

  if (normalizedTenants.length === 0) {
    logger.info("[MIGRATE] No tenants found in database. Defaulting to global tenant.");
    return [undefined];
  }

  logger.info(
    `[MIGRATE] Running migration for tenants: ${normalizedTenants.map((tenant) => tenant ?? "global").join(", ")}`,
  );
  return normalizedTenants;
}

async function migrate(force = false, tenantId?: string) {
  let fileConfig: ReturnType<typeof loadConfigFromFile> | null = null;
  let configLoadAttempted = false;

  const getFileConfig = () => {
    if (configLoadAttempted) {
      return fileConfig;
    }

    configLoadAttempted = true;
    try {
      fileConfig = loadConfigFromFile();
      logger.info("[MIGRATE] Loaded configuration from config.json");
    } catch (error) {
      logger.error("[MIGRATE] Failed to load config.json:", error);
      logger.info("[MIGRATE] No existing config.json found. Database will start empty.");
      fileConfig = null;
    }

    return fileConfig;
  };

  try {
    // Initialize database
    await initializeDatabase();
    const exists = await schemaExists();
    if (!exists) {
      await createSchema();
      logger.info("[MIGRATE] Database schema created");
    }

    const tenants = await resolveTenantsForMigration(tenantId);

    for (const tenant of tenants) {
      logger.info(`[MIGRATE] Starting migration from config.json to database for tenant: ${tenant ?? "global"}...`);

      // Check if database already has data
      const existingConfig = await getAllConfigFromDb(tenant);
      const hasData =
        Object.keys(existingConfig.mcpServerProxies).length > 0 ||
        Object.keys(existingConfig.toolsProxies).length > 0 ||
        existingConfig.policyRules.length > 0;

      if (hasData && !force) {
        logger.warn(`[MIGRATE] Database already contains configuration for tenant ${tenant ?? "global"}. Skipping.`);
        logger.info(
          "[MIGRATE] If you want to overwrite, run with --force flag: node dist/db/migrate.js --force",
        );
        continue;
      }

      if (hasData && force) {
        logger.warn(
          `[MIGRATE] Database contains existing configuration for tenant ${tenant ?? "global"}. Overwriting with config.json...`,
        );
      }

      const loadedConfig = getFileConfig();
      if (!loadedConfig) {
        return;
      }

      // Migrate to database
      if (Object.keys(loadedConfig.mcpServerProxies).length > 0) {
        await saveMcpServerProxiesToDb(loadedConfig.mcpServerProxies, tenant);
        logger.info(`[MIGRATE] Migrated ${Object.keys(loadedConfig.mcpServerProxies).length} MCP server proxies`);
      }

      if (Object.keys(loadedConfig.toolsProxies).length > 0) {
        await saveToolsProxiesToDb(loadedConfig.toolsProxies, tenant);
        logger.info(`[MIGRATE] Migrated ${Object.keys(loadedConfig.toolsProxies).length} tool proxies`);
      }

      if (loadedConfig.policyRules.length > 0) {
        await savePolicyRulesToDb(loadedConfig.policyRules, tenant);
        logger.info(`[MIGRATE] Migrated ${loadedConfig.policyRules.length} policy rules`);
      }
    }

    logger.info("[MIGRATE] Migration completed successfully!");
    logger.info("[MIGRATE] Your configuration is now stored in the database.");
    logger.info("[MIGRATE] You can continue using config.json as a backup, but changes will be saved to the database.");

  } catch (error) {
    logger.error("[MIGRATE] Migration failed:", error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes("--force") || process.argv.includes("-f");
  const tenantId = resolveTenantId(process.argv.slice(2));
  migrate(force, tenantId);
}

export { migrate, resolveTenantId, resolveTenantsForMigration };

