import { executeQuery, executeUpdate, getDatabaseConfig, isDatabaseInitialized } from "../connection.js";

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
  if (!isDatabaseInitialized()) {
    // Silently fail if database is not available
    return;
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

    // Clean up old events (keep only last MAX_EVENTS)
    await cleanupOldEvents();
  } catch (error) {
    // Silently fail if database operations fail
    // Events are not critical, so we don't want to break the application
  }
}

/**
 * Get events from database
 */
export async function getEvents(limit: number = MAX_EVENTS): Promise<GatewayEvent[]> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
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
    // Silently fail if database operations fail
    return [];
  }
}

/**
 * Search events
 */
export async function searchEvents(searchQuery: string, limit: number = MAX_EVENTS): Promise<GatewayEvent[]> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
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
    // Silently fail if database operations fail
    return [];
  }
}

/**
 * Clean up old events (keep only last MAX_EVENTS)
 */
async function cleanupOldEvents(): Promise<void> {
  const config = getDatabaseConfig();
  
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
}

