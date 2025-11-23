import { getDatabaseConfig, executeUpdate, executeQuery } from "./connection.js";
import { logger } from "../logger.js";

/**
 * Create database schema
 */
export async function createSchema(): Promise<void> {
  const config = getDatabaseConfig();
  logger.info("[DB] Creating database schema...");

  if (config.type === "postgres") {
    // PostgreSQL schema
    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS config (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        provider VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255) NOT NULL,
        tool_name VARCHAR(255) NOT NULL,
        intent_summary TEXT,
        decision VARCHAR(50) NOT NULL,
        risk_level VARCHAR(50),
        latency_ms INTEGER,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeUpdate(`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id);
      CREATE INDEX IF NOT EXISTS idx_events_tool_name ON events(tool_name);
      CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider);
    `);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeUpdate(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

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
        metadata JSONB,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP
      )
    `);

    await executeUpdate(`
      CREATE INDEX IF NOT EXISTS idx_agents_hakuna_id ON agents(hakuna_id);
      CREATE INDEX IF NOT EXISTS idx_agents_provider_id ON agents(provider_id);
      CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);
      CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id);
    `);
  } else {
    // SQLite schema
    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        timestamp DATETIME NOT NULL,
        provider TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        intent_summary TEXT,
        decision TEXT NOT NULL,
        risk_level TEXT,
        latency_ms INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // SQLite requires each statement to be executed separately
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_events_tool_name ON events(tool_name)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider)`);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeUpdate(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

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

  logger.info("[DB] Database schema created successfully");
}

/**
 * Check if schema exists
 */
export async function schemaExists(): Promise<boolean> {
  try {
    const config = getDatabaseConfig();
    if (config.type === "postgres") {
      const result = await executeQuery<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'config'
        ) as exists`
      );
      return result[0]?.exists === true;
    } else {
      const result = await executeQuery<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='config'`
      );
      return result.length > 0;
    }
  } catch {
    return false;
  }
}

