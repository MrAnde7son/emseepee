#!/usr/bin/env node
/**
 * Migration script to migrate existing config.json to database
 * Run this once to migrate your existing configuration
 */

import { initializeDatabase, closeDatabase } from "./connection.js";
import { createSchema, schemaExists } from "./schema.js";
import { 
  saveMcpServerProxiesToDb, 
  saveToolsProxiesToDb, 
  savePolicyRulesToDb,
  getAllConfigFromDb 
} from "./services/configService.js";
import { loadConfigFromFile } from "../configLoader.js";
import { logger } from "../logger.js";

async function migrate() {
  try {
    logger.info("[MIGRATE] Starting migration from config.json to database...");

    // Initialize database
    await initializeDatabase();
    const exists = await schemaExists();
    if (!exists) {
      await createSchema();
      logger.info("[MIGRATE] Database schema created");
    }

    // Check if database already has data
    const existingConfig = await getAllConfigFromDb();
    const hasData = Object.keys(existingConfig.mcpServerProxies).length > 0 ||
                    Object.keys(existingConfig.toolsProxies).length > 0 ||
                    existingConfig.policyRules.length > 0;

    if (hasData) {
      logger.warn("[MIGRATE] Database already contains configuration. Skipping migration.");
      logger.info("[MIGRATE] If you want to overwrite, clear the database first.");
      return;
    }

    // Load from file
    let fileConfig;
    try {
      fileConfig = loadConfigFromFile();
      logger.info("[MIGRATE] Loaded configuration from config.json");
    } catch (error) {
      logger.error("[MIGRATE] Failed to load config.json:", error);
      logger.info("[MIGRATE] No existing config.json found. Database will start empty.");
      return;
    }

    // Migrate to database
    if (Object.keys(fileConfig.mcpServerProxies).length > 0) {
      await saveMcpServerProxiesToDb(fileConfig.mcpServerProxies);
      logger.info(`[MIGRATE] Migrated ${Object.keys(fileConfig.mcpServerProxies).length} MCP server proxies`);
    }

    if (Object.keys(fileConfig.toolsProxies).length > 0) {
      await saveToolsProxiesToDb(fileConfig.toolsProxies);
      logger.info(`[MIGRATE] Migrated ${Object.keys(fileConfig.toolsProxies).length} tool proxies`);
    }

    if (fileConfig.policyRules.length > 0) {
      await savePolicyRulesToDb(fileConfig.policyRules);
      logger.info(`[MIGRATE] Migrated ${fileConfig.policyRules.length} policy rules`);
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
  migrate();
}

export { migrate };

