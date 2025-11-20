import { logger } from "../logger.js";

export type DatabaseType = "postgres" | "sqlite";

export interface DatabaseConfig {
  type: DatabaseType;
  // PostgreSQL config
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  // SQLite config (for in-memory, use ":memory:")
  filename?: string;
}

let dbConnection: unknown = null;

/**
 * Get database configuration from environment variables
 */
export function getDatabaseConfig(): DatabaseConfig {
  // Check if PostgreSQL is configured
  const postgresHost = process.env.POSTGRES_HOST;
  const postgresPort = process.env.POSTGRES_PORT;
  const postgresDatabase = process.env.POSTGRES_DATABASE;
  const postgresUser = process.env.POSTGRES_USER;
  const postgresPassword = process.env.POSTGRES_PASSWORD;

  if (postgresHost && postgresDatabase && postgresUser) {
    return {
      type: "postgres",
      host: postgresHost,
      port: postgresPort ? parseInt(postgresPort, 10) : 5432,
      database: postgresDatabase,
      user: postgresUser,
      password: postgresPassword,
    };
  }

  // Default to file-based SQLite (more reliable than in-memory)
  return {
    type: "sqlite",
    filename: "./data/gateway.db",
  };
}

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<unknown> {
  if (dbConnection) {
    return dbConnection;
  }

  const config = getDatabaseConfig();
  logger.info(`[DB] Initializing ${config.type} database connection...`);

  // Type for better-sqlite3 Database constructor
  type DatabaseConstructor = new (filename: string) => { close: () => void; prepare: (query: string) => unknown; transaction: <T>(fn: () => T) => T };

  try {
    if (config.type === "postgres") {
      const { Pool } = await import("pg");
      const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      await pool.query("SELECT 1");
      logger.info("[DB] PostgreSQL connection established");
      dbConnection = pool;
      return pool;
    } else {
      // SQLite - try to import, but handle gracefully if not available
      let Database: DatabaseConstructor;
      let filename = config.filename || "./data/gateway.db";
      
      // Ensure data directory exists
      if (filename !== ":memory:") {
        const { mkdir } = await import("fs/promises");
        const { dirname } = await import("path");
        try {
          await mkdir(dirname(filename), { recursive: true });
        } catch (mkdirError) {
          // Directory might already exist, ignore
        }
      }
      
      try {
        const sqliteModule = await import("better-sqlite3");
        Database = (sqliteModule.default || sqliteModule) as DatabaseConstructor;
        const db = new Database(filename);
        logger.info(`[DB] SQLite connection established (${filename})`);
        dbConnection = db;
        return db;
      } catch (sqliteError) {
        logger.warn("[DB] SQLite error:", sqliteError);
        throw sqliteError;
      }
    }
  } catch (error) {
    logger.error("[DB] Failed to initialize database:", error);
    throw error;
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return dbConnection !== null;
}

/**
 * Get the database connection (must be initialized first)
 */
export function getDatabase(): unknown {
  if (!dbConnection) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return dbConnection;
}

/**
 * Execute a query (works for both PostgreSQL and SQLite)
 */
export async function executeQuery<T = unknown>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const db = getDatabase();
  const config = getDatabaseConfig();

  if (config.type === "postgres") {
    const pool = db as { query: (text: string, params: unknown[]) => Promise<{ rows: T[] }> };
    const result = await pool.query(query, params);
    return result.rows;
  } else {
    // SQLite
    const dbInstance = db as { prepare: (query: string) => { all: (params: unknown[]) => T[] } };
    const stmt = dbInstance.prepare(query);
    return stmt.all(params);
  }
}

/**
 * Execute a query that returns a single row
 */
export async function executeQueryOne<T = unknown>(
  query: string,
  params: unknown[] = []
): Promise<T | null> {
  const db = getDatabase();
  const config = getDatabaseConfig();

  if (config.type === "postgres") {
    const pool = db as { query: (text: string, params: unknown[]) => Promise<{ rows: T[] }> };
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  } else {
    // SQLite
    const dbInstance = db as { prepare: (query: string) => { get: (params: unknown[]) => T | undefined } };
    const stmt = dbInstance.prepare(query);
    const result = stmt.get(params);
    return (result as T) || null;
  }
}

/**
 * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE)
 */
export async function executeUpdate(
  query: string,
  params: unknown[] = []
): Promise<{ changes: number; lastInsertRowid?: number }> {
  const db = getDatabase();
  const config = getDatabaseConfig();

  if (config.type === "postgres") {
    const pool = db as { query: (text: string, params: unknown[]) => Promise<{ rowCount: number }> };
    const result = await pool.query(query, params);
    return { changes: result.rowCount || 0 };
  } else {
    // SQLite
    const dbInstance = db as { prepare: (query: string) => { run: (params: unknown[]) => { changes: number; lastInsertRowid: number } } };
    const stmt = dbInstance.prepare(query);
    const result = stmt.run(params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }
}

/**
 * Execute a transaction
 */
export async function executeTransaction<T>(
  callback: (db: unknown) => Promise<T>
): Promise<T> {
  const db = getDatabase();
  const config = getDatabaseConfig();

  if (config.type === "postgres") {
    const pool = db as { connect: () => Promise<{ query: (text: string, params?: unknown[]) => Promise<unknown>; release: () => void }> };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    // SQLite - better-sqlite3 transactions are synchronous
    const dbInstance = db as { transaction: <T>(fn: () => T) => T };
    return new Promise<T>((resolve, reject) => {
      try {
        const result = dbInstance.transaction(() => {
          // For SQLite, we need to execute queries synchronously within the transaction
          // So we'll use a wrapper that provides async query methods
          const transactionDb = {
            query: async (query: string, params: unknown[] = []): Promise<{ rows: unknown[] }> => {
              const stmt = (db as { prepare: (q: string) => { all: (p: unknown[]) => unknown[] } }).prepare(query);
              const rows = stmt.all(params);
              return { rows };
            },
            update: async (query: string, params: unknown[] = []): Promise<{ changes: number }> => {
              const stmt = (db as { prepare: (q: string) => { run: (p: unknown[]) => { changes: number } } }).prepare(query);
              const result = stmt.run(params);
              return { changes: result.changes };
            },
          };
          return callback(transactionDb);
        });
        resolve(result as T);
      } catch (error) {
        reject(error);
      }
    });
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (!dbConnection) {
    return;
  }

  const config = getDatabaseConfig();
  try {
    if (config.type === "postgres") {
      const pool = dbConnection as { end: () => Promise<void> };
      await pool.end();
      logger.info("[DB] PostgreSQL connection closed");
    } else {
      const db = dbConnection as { close: () => void };
      db.close();
      logger.info("[DB] SQLite connection closed");
    }
  } catch (error) {
    logger.error("[DB] Error closing database connection:", error);
  } finally {
    dbConnection = null;
  }
}

