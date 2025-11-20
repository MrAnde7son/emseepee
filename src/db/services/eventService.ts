// Import connection functions - using static import to ensure same module instance
import { executeQuery, executeUpdate, getDatabaseConfig, isDatabaseInitialized, initializeDatabase as initDb } from "../connection.js";
import { createSchema, schemaExists } from "../schema.js";
import { logger } from "../../logger.js";

export interface GatewayEvent {
  id: string;
  timestamp: string;
  provider: string;
  agentId: string;
  toolName: string;
  intentSummary: string;
  decision: "allow" | "deny" | "log";
  riskLevel?: "low" | "medium" | "high";
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

const MAX_EVENTS = 10000; // Keep last 10k events

/**
 * Save event to database
 */
export async function saveEvent(event: Omit<GatewayEvent, "id" | "timestamp">): Promise<void> {
  // Check if database is initialized
  let isInitialized = isDatabaseInitialized();
  
  if (!isInitialized) {
    logger.warn("[EVENT-SERVICE] Database not initialized, attempting to initialize...");
    try {
      await initDb();
      const exists = await schemaExists();
      if (!exists) {
        await createSchema();
      }
      logger.info("[EVENT-SERVICE] Database initialization completed");
      
      // Verify it's now initialized
      isInitialized = isDatabaseInitialized();
      logger.info(`[EVENT-SERVICE] After initialization, isDatabaseInitialized() returns: ${isInitialized}`);
      
      if (!isInitialized) {
        throw new Error("Database initialization completed but isDatabaseInitialized() still returns false");
      }
    } catch (initError) {
      logger.error("[EVENT-SERVICE] Failed to initialize database:", initError);
      if (initError instanceof Error) {
        logger.error("[EVENT-SERVICE] Init error details:", initError.message, initError.stack);
      }
      throw new Error("Database not initialized and initialization failed");
    }
  }

  try {
    const eventId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    const config = getDatabaseConfig();

  const metadata = event.metadata ? JSON.stringify(event.metadata) : null;

  if (config.type === "postgres") {
    await executeUpdate(
      `INSERT INTO events (event_id, timestamp, provider, agent_id, tool_name, intent_summary, decision, risk_level, latency_ms, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        eventId,
        timestamp,
        event.provider,
        event.agentId,
        event.toolName,
        event.intentSummary,
        event.decision,
        event.riskLevel || null,
        event.latencyMs || null,
        metadata,
      ]
    );
  } else {
    await executeUpdate(
      `INSERT INTO events (event_id, timestamp, provider, agent_id, tool_name, intent_summary, decision, risk_level, latency_ms, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        timestamp,
        event.provider,
        event.agentId,
        event.toolName,
        event.intentSummary,
        event.decision,
        event.riskLevel || null,
        event.latencyMs || null,
        metadata,
      ]
    );
  }

    logger.info(`[EVENT-SERVICE] Successfully saved event: ${event.toolName} by ${event.agentId}`);

    // Clean up old events (keep only last MAX_EVENTS)
    await cleanupOldEvents();
  } catch (error) {
    // Log error and rethrow so caller knows it failed
    logger.error("[EVENT-SERVICE] Failed to save event to database:", error);
    if (error instanceof Error) {
      logger.error("[EVENT-SERVICE] Error details:", error.message, error.stack);
    }
    throw error;
  }
}

/**
 * Get events from database
 */
export async function getEvents(limit: number = MAX_EVENTS): Promise<GatewayEvent[]> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
    logger.warn("[EVENT-SERVICE] Database not initialized, returning empty events list");
    return [];
  }

  try {
    const config = getDatabaseConfig();
  
  let query: string;
  if (config.type === "postgres") {
    query = `SELECT 
      event_id as id,
      timestamp,
      provider,
      agent_id as "agentId",
      tool_name as "toolName",
      intent_summary as "intentSummary",
      decision,
      risk_level as "riskLevel",
      latency_ms as "latencyMs",
      metadata
    FROM events
    ORDER BY timestamp DESC
    LIMIT $1`;
  } else {
    query = `SELECT 
      event_id as id,
      timestamp,
      provider,
      agent_id as agentId,
      tool_name as toolName,
      intent_summary as intentSummary,
      decision,
      risk_level as riskLevel,
      latency_ms as latencyMs,
      metadata
    FROM events
    ORDER BY timestamp DESC
    LIMIT ?`;
  }

  const results = await executeQuery<{
    id: string;
    timestamp: string;
    provider: string;
    agentId: string;
    toolName: string;
    intentSummary: string;
    decision: string;
    riskLevel: string | null;
    latencyMs: number | null;
    metadata: string | null;
  }>(query, [limit]);

  logger.info(`[EVENT-SERVICE] Retrieved ${results.length} events from database`);

  return results.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    provider: row.provider,
    agentId: row.agentId,
    toolName: row.toolName,
    intentSummary: row.intentSummary,
    decision: row.decision as "allow" | "deny" | "log",
    riskLevel: row.riskLevel as "low" | "medium" | "high" | undefined,
    latencyMs: row.latencyMs || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  }));
  } catch (error) {
    logger.error("[EVENT-SERVICE] Failed to get events from database:", error);
    if (error instanceof Error) {
      logger.error("[EVENT-SERVICE] Error details:", error.message, error.stack);
    }
    return [];
  }
}

/**
 * Search events
 */
export async function searchEvents(searchQuery: string, limit: number = MAX_EVENTS): Promise<GatewayEvent[]> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
    logger.warn("[EVENT-SERVICE] Database not initialized, returning empty events list");
    return [];
  }

  try {
    const config = getDatabaseConfig();
    const query = searchQuery.toLowerCase();
  
  let sql: string;
  if (config.type === "postgres") {
    sql = `SELECT 
      event_id as id,
      timestamp,
      provider,
      agent_id as "agentId",
      tool_name as "toolName",
      intent_summary as "intentSummary",
      decision,
      risk_level as "riskLevel",
      latency_ms as "latencyMs",
      metadata
    FROM events
    WHERE 
      LOWER(agent_id) LIKE $1 OR
      LOWER(provider) LIKE $1 OR
      LOWER(tool_name) LIKE $1 OR
      LOWER(intent_summary) LIKE $1 OR
      LOWER(decision) LIKE $1
    ORDER BY timestamp DESC
    LIMIT $2`;
  } else {
    sql = `SELECT 
      event_id as id,
      timestamp,
      provider,
      agent_id as agentId,
      tool_name as toolName,
      intent_summary as intentSummary,
      decision,
      risk_level as riskLevel,
      latency_ms as latencyMs,
      metadata
    FROM events
    WHERE 
      LOWER(agent_id) LIKE ? OR
      LOWER(provider) LIKE ? OR
      LOWER(tool_name) LIKE ? OR
      LOWER(intent_summary) LIKE ? OR
      LOWER(decision) LIKE ?
    ORDER BY timestamp DESC
    LIMIT ?`;
  }

  const searchPattern = `%${query}%`;
  const params = config.type === "postgres"
    ? [searchPattern, limit]
    : [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, limit];

  const results = await executeQuery<{
    id: string;
    timestamp: string;
    provider: string;
    agentId: string;
    toolName: string;
    intentSummary: string;
    decision: string;
    riskLevel: string | null;
    latencyMs: number | null;
    metadata: string | null;
  }>(sql, params);

  logger.info(`[EVENT-SERVICE] Retrieved ${results.length} events from database (search: "${searchQuery}")`);

  return results.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    provider: row.provider,
    agentId: row.agentId,
    toolName: row.toolName,
    intentSummary: row.intentSummary,
    decision: row.decision as "allow" | "deny" | "log",
    riskLevel: row.riskLevel as "low" | "medium" | "high" | undefined,
    latencyMs: row.latencyMs || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  }));
  } catch (error) {
    logger.error("[EVENT-SERVICE] Failed to search events from database:", error);
    if (error instanceof Error) {
      logger.error("[EVENT-SERVICE] Error details:", error.message, error.stack);
    }
    return [];
  }
}

/**
 * Clean up old events (keep only last MAX_EVENTS)
 */
async function cleanupOldEvents(): Promise<void> {
  try {
    const config = getDatabaseConfig();
    
    // First, check how many events we have
    const countResult = await executeQuery<{ count: number }>(
      config.type === "postgres"
        ? `SELECT COUNT(*) as count FROM events`
        : `SELECT COUNT(*) as count FROM events`
    );
    
    const eventCount = countResult[0]?.count || 0;
    
    // Only cleanup if we have more than MAX_EVENTS
    if (eventCount <= MAX_EVENTS) {
      return;
    }
    
    if (config.type === "postgres") {
      await executeUpdate(
        `DELETE FROM events
         WHERE id NOT IN (
           SELECT id FROM events
           ORDER BY timestamp DESC
           LIMIT $1
         )`,
        [MAX_EVENTS]
      );
    } else {
      // SQLite
      await executeUpdate(
        `DELETE FROM events
         WHERE id NOT IN (
           SELECT id FROM events
           ORDER BY timestamp DESC
           LIMIT ?
         )`,
        [MAX_EVENTS]
      );
    }
    
    logger.info(`[EVENT-SERVICE] Cleaned up old events, kept last ${MAX_EVENTS} events`);
  } catch (error) {
    logger.error("[EVENT-SERVICE] Failed to cleanup old events:", error);
    // Don't throw - cleanup failures shouldn't break event saving
  }
}

