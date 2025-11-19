/**
 * Logger utility for MCP servers.
 * All logging goes to stderr to avoid interfering with stdout (MCP protocol).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * File-based event storage (shared across all processes)
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

const MAX_EVENTS = 10000; // Keep last 10k events

// Get the events file path
function getEventsFilePath(): string {
  // Store in project root, or use a temp directory
  const projectRoot = process.cwd();
  const eventsDir = join(projectRoot, ".hakuna");
  const eventsFile = join(eventsDir, "events.json");
  
  // Ensure directory exists
  if (!existsSync(eventsDir)) {
    mkdirSync(eventsDir, { recursive: true });
  }
  
  return eventsFile;
}

// Load events from file
function loadEventsFromFile(): GatewayEvent[] {
  const eventsFile = getEventsFilePath();
  
  if (!existsSync(eventsFile)) {
    return [];
  }
  
  try {
    const content = readFileSync(eventsFile, "utf-8");
    const events = JSON.parse(content) as GatewayEvent[];
    // Keep only the last MAX_EVENTS events
    return events.slice(-MAX_EVENTS);
  } catch (error) {
    console.error("[EVENT-STORE] Error loading events from file:", error);
    return [];
  }
}

// Save events to file
function saveEventsToFile(events: GatewayEvent[]): void {
  const eventsFile = getEventsFilePath();
  
  try {
    // Keep only the last MAX_EVENTS events
    const eventsToSave = events.slice(-MAX_EVENTS);
    writeFileSync(eventsFile, JSON.stringify(eventsToSave, null, 2), "utf-8");
  } catch (error) {
    console.error("[EVENT-STORE] Error saving events to file:", error);
  }
}

// In-memory cache (synced with file)
let eventStore: GatewayEvent[] = loadEventsFromFile();

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
  logEvent: (event: Omit<GatewayEvent, "id" | "timestamp">) => {
    const fullEvent: GatewayEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };

    // Reload events from file to get latest state (in case another process added events)
    eventStore = loadEventsFromFile();
    
    // Add new event
    eventStore.push(fullEvent);
    
    // Save to file immediately
    saveEventsToFile(eventStore);
    
    // Debug logging to verify events are being stored
    console.error(`[EVENT-LOG] Stored event: ${fullEvent.toolName} by ${fullEvent.agentId} - ${fullEvent.decision} (Total events: ${eventStore.length})`);
  },
};

/**
 * Get all stored events (reloads from file to get latest)
 */
export function getStoredEvents(): GatewayEvent[] {
  // Reload from file to get events from all processes
  eventStore = loadEventsFromFile();
  return [...eventStore];
}

