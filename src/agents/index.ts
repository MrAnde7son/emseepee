import { getAgentRegistry } from "./registry.js";
import { CursorAdapter } from "./adapters/cursor.js";
import { OpenAIAdapter } from "./adapters/openai.js";
import { logger } from "../logger.js";

/**
 * Initialize the agent registry with default adapters
 */
export function initializeAgentRegistry(): void {
  const registry = getAgentRegistry();
  
  // Register Cursor adapter
  const cursorAdapter = new CursorAdapter();
  registry.registerAdapter(cursorAdapter);
  
  // Register OpenAI adapter (only if API key is configured)
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    const openaiAdapter = new OpenAIAdapter(
      openaiApiKey,
      process.env.OPENAI_BASE_URL,
      process.env.OPENAI_ORGANIZATION_ID
    );
    registry.registerAdapter(openaiAdapter);
    logger.info("[AGENTS] OpenAI adapter registered");
  } else {
    logger.info("[AGENTS] OpenAI adapter skipped (no API key configured)");
  }
  
  logger.info("[AGENTS] Agent registry initialized");
}

/**
 * Get the agent registry instance
 */
export { getAgentRegistry } from "./registry.js";
export type { Agent } from "../config.js";
export type { ProviderAgentAdapter } from "../config.js";

