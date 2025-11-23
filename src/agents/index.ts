import { getAgentRegistry } from "./registry.js";
import { AdapterFactory } from "./factory.js";
import { logger } from "../logger.js";

/**
 * Initialize the agent registry with adapters
 * Loads adapters from:
 * 1. Provider configurations stored in database
 * 2. Environment variables (fallback for backward compatibility)
 */
export async function initializeAgentRegistry(): Promise<void> {
  const registry = getAgentRegistry();
  
  try {
    // Load adapters from provider configurations
    const { getAllProviderConfigs } = await import("../db/services/providerService.js");
    const providerConfigs = await getAllProviderConfigs();
    
    for (const providerConfig of providerConfigs) {
      const adapter = AdapterFactory.createAdapter(providerConfig.providerId, providerConfig.config);
      if (adapter) {
        registry.registerAdapter(adapter);
        logger.info(`[AGENTS] Registered adapter for provider: ${providerConfig.providerId} (from config)`);
      } else {
        logger.warn(`[AGENTS] Failed to create adapter for provider: ${providerConfig.providerId}`);
      }
    }
    
    // Fallback: Register adapters from environment variables (for backward compatibility)
    // Only register if not already registered from config
    const registeredProviders = registry.getRegisteredProviders();
    
    // Cursor adapter (always available, no config needed)
    if (!registeredProviders.includes("cursor")) {
      const cursorAdapter = AdapterFactory.createAdapter("cursor");
      if (cursorAdapter) {
        registry.registerAdapter(cursorAdapter);
        logger.info("[AGENTS] Registered Cursor adapter (from env fallback)");
      }
    }
    
    // OpenAI adapter (if env var exists and not already registered)
    if (!registeredProviders.includes("openai") && process.env.OPENAI_API_KEY) {
      const openaiAdapter = AdapterFactory.createAdapter("openai", {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        organizationId: process.env.OPENAI_ORGANIZATION_ID,
      });
      if (openaiAdapter) {
        registry.registerAdapter(openaiAdapter);
        logger.info("[AGENTS] Registered OpenAI adapter (from env fallback)");
      }
    }
    
    logger.info(`[AGENTS] Agent registry initialized with ${registry.getRegisteredProviders().length} adapters`);
  } catch (error) {
    logger.error("[AGENTS] Failed to initialize agent registry from configs, using fallback:", error);
    // Fallback to basic initialization
    const cursorAdapter = AdapterFactory.createAdapter("cursor");
    if (cursorAdapter) {
      registry.registerAdapter(cursorAdapter);
    }
  }
}

/**
 * Register adapter for a provider dynamically (called when provider is installed)
 */
export async function registerProviderAdapter(
  providerId: string,
  config?: Record<string, unknown>
): Promise<void> {
  const registry = getAgentRegistry();
  
  // Check if adapter already registered
  if (registry.getRegisteredProviders().includes(providerId)) {
    logger.info(`[AGENTS] Adapter for provider ${providerId} already registered, unregistering first`);
    registry.unregisterAdapter(providerId);
  }
  
  const adapter = AdapterFactory.createAdapter(providerId, config);
  if (adapter) {
    registry.registerAdapter(adapter);
    logger.info(`[AGENTS] Dynamically registered adapter for provider: ${providerId}`);
  } else {
    throw new Error(`Failed to create adapter for provider: ${providerId}`);
  }
}

/**
 * Unregister adapter for a provider (called when provider is uninstalled)
 */
export function unregisterProviderAdapter(providerId: string): void {
  const registry = getAgentRegistry();
  registry.unregisterAdapter(providerId);
  logger.info(`[AGENTS] Unregistered adapter for provider: ${providerId}`);
}

/**
 * Get the agent registry instance
 */
export { getAgentRegistry } from "./registry.js";
export type { Agent } from "../config.js";
export type { ProviderAgentAdapter } from "../config.js";

