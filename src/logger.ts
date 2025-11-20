/**
 * Logger utility for MCP servers.
 * All logging goes to stderr to avoid interfering with stdout (MCP protocol).
 */

// File operations removed - using database instead

/**
 * Database-based event storage
 */
interface GatewayEvent {
  id: string;
  timestamp: string;
  provider: string;
  agentId: string;
  toolName: string;
  intentSummary: string;
  decision: "allow" | "deny" | "log";
  riskLevel?: "low" | "medium" | "high";
  latencyMs?: number;
}

/**
 * Safely serialize arguments for logging
 * Prevents issues with circular references and complex objects
 */
function serializeArg(arg: unknown): string {
  if (arg === null || arg === undefined) {
    return String(arg);
  }
  if (arg instanceof Error) {
    // Extract just the essential error information, avoiding module paths
    const name = arg.name || "Error";
    const message = arg.message || "";
    // Only include stack trace if it exists, and limit its length
    const stack = arg.stack ? `\n${arg.stack.split("\n").slice(0, 5).join("\n")}` : "";
    return `${name}: ${message}${stack}`;
  }
  if (typeof arg === "object") {
    try {
      // Use a replacer function to avoid circular references and limit depth
      const seen = new WeakSet();
      return JSON.stringify(arg, (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return "[Circular]";
          }
          seen.add(value);
        }
        // Filter out module-related properties that might cause issues
        if (key === "module" || key === "require" || key === "exports") {
          return undefined;
        }
        return value;
      }, 2);
    } catch (err) {
      // If JSON.stringify fails, just return a safe string representation
      return String(arg).substring(0, 500);
    }
  }
  return String(arg);
}

export const logger = {
  info: (...args: unknown[]) => {
    const serialized = args.map(serializeArg).join(" ");
    console.error("[INFO]", serialized);
  },
  warn: (...args: unknown[]) => {
    const serialized = args.map(serializeArg).join(" ");
    console.error("[WARN]", serialized);
  },
  error: (...args: unknown[]) => {
    const serialized = args.map(serializeArg).join(" ");
    console.error("[ERROR]", serialized);
  },
  /**
   * Log a gateway event (tool call, policy decision, etc.)
   */
  logEvent: async (event: Omit<GatewayEvent, "id" | "timestamp">) => {
    try {
      const { saveEvent } = await import("./db/services/eventService.js");
      await saveEvent(event);
      console.error(`[EVENT-LOG] Stored event: ${event.toolName} by ${event.agentId} - ${event.decision}`);
    } catch (error) {
      // If database fails, log to console as fallback
      console.error("[EVENT-LOG] Failed to save event to database:", error);
      console.error("[EVENT-LOG] Event data:", event);
    }
  },
};

/**
 * Get all stored events from database
 */
export async function getStoredEvents(): Promise<GatewayEvent[]> {
  try {
    const { getEvents } = await import("./db/services/eventService.js");
    return await getEvents();
  } catch (error) {
    console.error("[EVENT-STORE] Failed to load events from database:", error);
    return [];
  }
}

