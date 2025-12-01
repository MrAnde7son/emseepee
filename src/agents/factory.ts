import type { ProviderAgentAdapter } from "../config.js";
import { CursorAdapter } from "./adapters/cursor.js";
import { OpenAIAdapter } from "./adapters/openai.js";
import { MicrosoftCopilotAdapter } from "./adapters/microsoftCopilot.js";
import { logger } from "../logger.js";

/**
 * Adapter Factory - creates adapters for providers based on their configuration
 * This allows dynamic adapter creation when providers are installed
 */
export class AdapterFactory {
  /**
   * Create an adapter for a provider based on its configuration
   */
  static createAdapter(
    providerId: string,
    config?: Record<string, unknown>
  ): ProviderAgentAdapter | null {
    switch (providerId) {
      case "cursor":
        return new CursorAdapter();

      case "openai":
        // OpenAI requires API key
        const apiKey = (config?.apiKey as string) || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          logger.warn("[ADAPTER-FACTORY] OpenAI adapter requires apiKey in config or OPENAI_API_KEY env var");
          return null;
        }
        return new OpenAIAdapter(
          apiKey,
          (config?.baseUrl as string) || process.env.OPENAI_BASE_URL,
          (config?.organizationId as string) || process.env.OPENAI_ORGANIZATION_ID,
          {
            apiKey,
            baseUrl: ((config?.baseUrl as string) || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
            organizationId: (config?.organizationId as string) || process.env.OPENAI_ORGANIZATION_ID,
          }
        );

      case "microsoft_copilot":
        return new MicrosoftCopilotAdapter(config);

      // Add more providers here as adapters are implemented
      // case "n8n":
      //   return new N8nAdapter(config?.apiUrl, config?.apiKey);
      // case "vertex":
      //   return new VertexAdapter(config?.projectId, config?.location);
      // case "bedrock":
      //   return new BedrockAdapter(config?.region, config?.accessKeyId, config?.secretAccessKey);

      default:
        logger.warn(`[ADAPTER-FACTORY] No adapter available for provider: ${providerId}`);
        return null;
    }
  }

  /**
   * Check if an adapter is available for a provider (without creating it)
   */
  static isAdapterAvailable(providerId: string): boolean {
    const supportedProviders = ["cursor", "openai", "microsoft_copilot"];
    return supportedProviders.includes(providerId);
  }

  /**
   * Get list of supported provider IDs
   */
  static getSupportedProviders(): string[] {
    return ["cursor", "openai", "microsoft_copilot"];
  }
}

