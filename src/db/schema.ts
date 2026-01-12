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
        key VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(255),
        value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (key, tenant_id)
      )
    `);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        tenant_id VARCHAR(255),
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
      CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id);
    `);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        tenant_id VARCHAR(255),
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
        emseepee_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        provider_id VARCHAR(255) NOT NULL,
        provider_native_id VARCHAR(255),
        role VARCHAR(255),
        env VARCHAR(255),
        kind VARCHAR(50) DEFAULT 'agent',
        idp_type VARCHAR(50),
        idp_object_id VARCHAR(255),
        tenant_id VARCHAR(255),
        owner VARCHAR(255),
        metadata JSONB,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP
      )
    `);

    await executeUpdate(`
      CREATE INDEX IF NOT EXISTS idx_agents_emseepee_id ON agents(emseepee_id);
      CREATE INDEX IF NOT EXISTS idx_agents_provider_id ON agents(provider_id);
      CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);
      CREATE INDEX IF NOT EXISTS idx_agents_kind ON agents(kind);
      CREATE INDEX IF NOT EXISTS idx_agents_idp_type ON agents(idp_type);
      CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id);
    `);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        id SERIAL PRIMARY KEY,
        provider_id VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(255),
        config JSONB NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (provider_id, tenant_id)
      )
    `);

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

    await executeUpdate(`
      CREATE INDEX IF NOT EXISTS idx_provider_configs_provider_id ON provider_configs(provider_id);
      CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant_id ON provider_configs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_provider_configs_enabled ON provider_configs(enabled);
    `);

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
  } else {
    // SQLite schema
    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        tenant_id TEXT,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (key, tenant_id)
      )
    `);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        tenant_id TEXT,
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
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id)`);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        tenant_id TEXT,
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
        emseepee_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        provider_id TEXT NOT NULL,
        provider_native_id TEXT,
        role TEXT,
        env TEXT,
        kind TEXT DEFAULT 'agent',
        idp_type TEXT,
        idp_object_id TEXT,
        tenant_id TEXT,
        owner TEXT,
        metadata TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME
      )
    `);

    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_emseepee_id ON agents(emseepee_id)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_provider_id ON agents(provider_id)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_kind ON agents(kind)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_idp_type ON agents(idp_type)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id)`);

    await executeUpdate(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        tenant_id TEXT,
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (provider_id, tenant_id)
      )
    `);

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

    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_provider_configs_provider_id ON provider_configs(provider_id)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant_id ON provider_configs(tenant_id)`);
    await executeUpdate(`CREATE INDEX IF NOT EXISTS idx_provider_configs_enabled ON provider_configs(enabled)`);

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

