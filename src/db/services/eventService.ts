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
  // Check if database is initialized, and try to initialize if not
  if (!isDatabaseInitialized()) {
    logger.warn("[EVENT-SERVICE] Database not initialized, attempting to initialize...");
    try {
      await initDb();
      const exists = await schemaExists();
      if (!exists) {
        await createSchema();
      }
      if (!isDatabaseInitialized()) {
        throw new Error("Database initialization completed but isDatabaseInitialized() still returns false");
      }
    } catch (initError) {
      logger.error("[EVENT-SERVICE] Failed to initialize database:", initError);
      if (initError instanceof Error) {
        logger.error("[EVENT-SERVICE] Init error details:", initError.message);
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
 * Get events from database with pagination
 */
export async function getEvents(limit: number = MAX_EVENTS, offset: number = 0): Promise<GatewayEvent[]> {
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
    LIMIT $1 OFFSET $2`;
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
    LIMIT ? OFFSET ?`;
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
  }>(query, [limit, offset]);

  // Only log if there are events to reduce noise
  if (results.length > 0) {
    logger.info(`[EVENT-SERVICE] Retrieved ${results.length} events from database`);
  }

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
 * Get total count of events
 */
export async function getEventsCount(): Promise<number> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
    return 0;
  }

  try {
    const config = getDatabaseConfig();
    const query = config.type === "postgres"
      ? `SELECT COUNT(*) as count FROM events`
      : `SELECT COUNT(*) as count FROM events`;
    
    const results = await executeQuery<{ count: number }>(query, []);
    return results[0]?.count || 0;
  } catch (error) {
    logger.error("[EVENT-SERVICE] Failed to get events count:", error);
    return 0;
  }
}

/**
 * Search events with pagination
 */
export async function searchEvents(
  searchQuery: string,
  limit: number = MAX_EVENTS,
  offset: number = 0
): Promise<GatewayEvent[]> {
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
    LIMIT $2 OFFSET $3`;
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
    LIMIT ? OFFSET ?`;
  }

  const searchPattern = `%${query}%`;
  const params = config.type === "postgres"
    ? [searchPattern, limit, offset]
    : [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, limit, offset];

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

  // Only log if there are results to reduce noise
  if (results.length > 0) {
    logger.info(`[EVENT-SERVICE] Retrieved ${results.length} events from database (search: "${searchQuery}")`);
  }

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
 * Get total count of events matching search query
 */
export async function searchEventsCount(searchQuery: string): Promise<number> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
    return 0;
  }

  try {
    const config = getDatabaseConfig();
    const query = searchQuery.toLowerCase();
    const searchPattern = `%${query}%`;
    
    let sql: string;
    if (config.type === "postgres") {
      sql = `SELECT COUNT(*) as count
      FROM events
      WHERE 
        LOWER(agent_id) LIKE $1 OR
        LOWER(provider) LIKE $1 OR
        LOWER(tool_name) LIKE $1 OR
        LOWER(intent_summary) LIKE $1 OR
        LOWER(decision) LIKE $1`;
    } else {
      sql = `SELECT COUNT(*) as count
      FROM events
      WHERE 
        LOWER(agent_id) LIKE ? OR
        LOWER(provider) LIKE ? OR
        LOWER(tool_name) LIKE ? OR
        LOWER(intent_summary) LIKE ? OR
        LOWER(decision) LIKE ?`;
    }
    
    const params = config.type === "postgres"
      ? [searchPattern]
      : [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern];
    
    const results = await executeQuery<{ count: number }>(sql, params);
    return results[0]?.count || 0;
  } catch (error) {
    logger.error("[EVENT-SERVICE] Failed to get search events count:", error);
    return 0;
  }
}

/**
 * Get events with filters and optional search
 */
export async function getEventsWithFilters(
  searchQuery?: string,
  filters?: {
    decisions?: string[];
    providers?: string[];
    agents?: string[];
    tools?: string[];
    riskLevels?: string[];
  },
  limit: number = MAX_EVENTS,
  offset: number = 0
): Promise<GatewayEvent[]> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
    logger.warn("[EVENT-SERVICE] Database not initialized, returning empty events list");
    return [];
  }

  try {
    const config = getDatabaseConfig();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Add search conditions
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchPattern = `%${query}%`;
      if (config.type === "postgres") {
        conditions.push(`(
          LOWER(agent_id) LIKE $${paramIndex} OR
          LOWER(provider) LIKE $${paramIndex} OR
          LOWER(tool_name) LIKE $${paramIndex} OR
          LOWER(intent_summary) LIKE $${paramIndex} OR
          LOWER(decision) LIKE $${paramIndex}
        )`);
        params.push(searchPattern);
        paramIndex++;
      } else {
        conditions.push(`(
          LOWER(agent_id) LIKE ? OR
          LOWER(provider) LIKE ? OR
          LOWER(tool_name) LIKE ? OR
          LOWER(intent_summary) LIKE ? OR
          LOWER(decision) LIKE ?
        )`);
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        paramIndex += 5;
      }
    }

    // Add filter conditions
    if (filters) {
      if (filters.decisions && filters.decisions.length > 0) {
        const placeholders = filters.decisions.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        if (config.type === "postgres") {
          conditions.push(`decision IN (${placeholders.join(", ")})`);
        } else {
          conditions.push(`decision IN (${placeholders.join(", ")})`);
        }
        params.push(...filters.decisions);
      }

      if (filters.providers && filters.providers.length > 0) {
        const placeholders = filters.providers.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        if (config.type === "postgres") {
          conditions.push(`provider IN (${placeholders.join(", ")})`);
        } else {
          conditions.push(`provider IN (${placeholders.join(", ")})`);
        }
        params.push(...filters.providers);
      }

      if (filters.agents && filters.agents.length > 0) {
        const placeholders = filters.agents.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        if (config.type === "postgres") {
          conditions.push(`agent_id IN (${placeholders.join(", ")})`);
        } else {
          conditions.push(`agent_id IN (${placeholders.join(", ")})`);
        }
        params.push(...filters.agents);
      }

      if (filters.tools && filters.tools.length > 0) {
        const placeholders = filters.tools.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        if (config.type === "postgres") {
          conditions.push(`tool_name IN (${placeholders.join(", ")})`);
        } else {
          conditions.push(`tool_name IN (${placeholders.join(", ")})`);
        }
        params.push(...filters.tools);
      }

      if (filters.riskLevels && filters.riskLevels.length > 0) {
        const placeholders = filters.riskLevels.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        if (config.type === "postgres") {
          conditions.push(`risk_level IN (${placeholders.join(", ")})`);
        } else {
          conditions.push(`risk_level IN (${placeholders.join(", ")})`);
        }
        params.push(...filters.riskLevels);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
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
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?`;
    }

    params.push(limit, offset);

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
    logger.error("[EVENT-SERVICE] Failed to get events with filters from database:", error);
    if (error instanceof Error) {
      logger.error("[EVENT-SERVICE] Error details:", error.message, error.stack);
    }
    return [];
  }
}

/**
 * Get total count of events matching filters and optional search
 */
export async function getEventsWithFiltersCount(
  searchQuery?: string,
  filters?: {
    decisions?: string[];
    providers?: string[];
    agents?: string[];
    tools?: string[];
    riskLevels?: string[];
  }
): Promise<number> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
    return 0;
  }

  try {
    const config = getDatabaseConfig();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Add search conditions
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchPattern = `%${query}%`;
      if (config.type === "postgres") {
        conditions.push(`(
          LOWER(agent_id) LIKE $${paramIndex} OR
          LOWER(provider) LIKE $${paramIndex} OR
          LOWER(tool_name) LIKE $${paramIndex} OR
          LOWER(intent_summary) LIKE $${paramIndex} OR
          LOWER(decision) LIKE $${paramIndex}
        )`);
        params.push(searchPattern);
        paramIndex++;
      } else {
        conditions.push(`(
          LOWER(agent_id) LIKE ? OR
          LOWER(provider) LIKE ? OR
          LOWER(tool_name) LIKE ? OR
          LOWER(intent_summary) LIKE ? OR
          LOWER(decision) LIKE ?
        )`);
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        paramIndex += 5;
      }
    }

    // Add filter conditions (same logic as getEventsWithFilters)
    if (filters) {
      if (filters.decisions && filters.decisions.length > 0) {
        const placeholders = filters.decisions.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        conditions.push(`decision IN (${placeholders.join(", ")})`);
        params.push(...filters.decisions);
      }

      if (filters.providers && filters.providers.length > 0) {
        const placeholders = filters.providers.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        conditions.push(`provider IN (${placeholders.join(", ")})`);
        params.push(...filters.providers);
      }

      if (filters.agents && filters.agents.length > 0) {
        const placeholders = filters.agents.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        conditions.push(`agent_id IN (${placeholders.join(", ")})`);
        params.push(...filters.agents);
      }

      if (filters.tools && filters.tools.length > 0) {
        const placeholders = filters.tools.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        conditions.push(`tool_name IN (${placeholders.join(", ")})`);
        params.push(...filters.tools);
      }

      if (filters.riskLevels && filters.riskLevels.length > 0) {
        const placeholders = filters.riskLevels.map(() => {
          if (config.type === "postgres") {
            return `$${paramIndex++}`;
          } else {
            return "?";
          }
        });
        conditions.push(`risk_level IN (${placeholders.join(", ")})`);
        params.push(...filters.riskLevels);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `SELECT COUNT(*) as count FROM events ${whereClause}`;

    const results = await executeQuery<{ count: number }>(sql, params);
    return results[0]?.count || 0;
  } catch (error) {
    logger.error("[EVENT-SERVICE] Failed to get events count with filters:", error);
    return 0;
  }
}

/**
 * Get all unique filter values for events (for filter dropdowns)
 */
export async function getEventFilterOptions(): Promise<{
  decisions: string[];
  providers: string[];
  agents: string[];
  tools: string[];
  riskLevels: string[];
}> {
  // Check if database is initialized
  if (!isDatabaseInitialized()) {
    return { decisions: [], providers: [], agents: [], tools: [], riskLevels: [] };
  }

  try {
    const config = getDatabaseConfig();
    
    // Get unique decisions
    const decisionsQuery = config.type === "postgres"
      ? `SELECT DISTINCT decision FROM events WHERE decision IS NOT NULL ORDER BY decision`
      : `SELECT DISTINCT decision FROM events WHERE decision IS NOT NULL ORDER BY decision`;
    const decisions = await executeQuery<{ decision: string }>(decisionsQuery, []);
    
    // Get unique providers
    const providersQuery = config.type === "postgres"
      ? `SELECT DISTINCT provider FROM events WHERE provider IS NOT NULL ORDER BY provider`
      : `SELECT DISTINCT provider FROM events WHERE provider IS NOT NULL ORDER BY provider`;
    const providers = await executeQuery<{ provider: string }>(providersQuery, []);
    
    // Get unique agents
    const agentsQuery = config.type === "postgres"
      ? `SELECT DISTINCT agent_id as agentId FROM events WHERE agent_id IS NOT NULL ORDER BY agent_id`
      : `SELECT DISTINCT agent_id as agentId FROM events WHERE agent_id IS NOT NULL ORDER BY agent_id`;
    const agents = await executeQuery<{ agentId: string }>(agentsQuery, []);
    
    // Get unique tools
    const toolsQuery = config.type === "postgres"
      ? `SELECT DISTINCT tool_name as toolName FROM events WHERE tool_name IS NOT NULL ORDER BY tool_name`
      : `SELECT DISTINCT tool_name as toolName FROM events WHERE tool_name IS NOT NULL ORDER BY tool_name`;
    const tools = await executeQuery<{ toolName: string }>(toolsQuery, []);
    
    // Get unique risk levels
    const riskLevelsQuery = config.type === "postgres"
      ? `SELECT DISTINCT risk_level as riskLevel FROM events WHERE risk_level IS NOT NULL ORDER BY risk_level`
      : `SELECT DISTINCT risk_level as riskLevel FROM events WHERE risk_level IS NOT NULL ORDER BY risk_level`;
    const riskLevels = await executeQuery<{ riskLevel: string }>(riskLevelsQuery, []);
    
    return {
      decisions: decisions.map((r) => r.decision).filter((d): d is "allow" | "deny" | "log" => 
        d === "allow" || d === "deny" || d === "log"
      ),
      providers: providers.map((r) => r.provider),
      agents: agents.map((r) => r.agentId),
      tools: tools.map((r) => r.toolName),
      riskLevels: riskLevels.map((r) => r.riskLevel).filter((r): r is "low" | "medium" | "high" => 
        r === "low" || r === "medium" || r === "high"
      ),
    };
  } catch (error) {
    logger.error("[EVENT-SERVICE] Failed to get event filter options:", error);
    return { decisions: [], providers: [], agents: [], tools: [], riskLevels: [] };
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

