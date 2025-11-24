import type { Agent, ProviderAgentAdapter } from "../../config.js";
import { logger } from "../../logger.js";

/**
 * Base adapter implementation with common functionality
 * Providers can extend this for their specific implementations
 */
export abstract class BaseProviderAdapter implements ProviderAgentAdapter {
  protected abstract providerId: string;

  abstract getProviderId(): string;
  abstract listAgents(): Promise<Agent[]>;
  abstract getAgent(providerNativeId: string): Promise<Agent | null>;
  abstract createAgent(agent: Omit<Agent, "id" | "providerId" | "createdAt" | "updatedAt">): Promise<Agent>;
  abstract updateAgent(providerNativeId: string, updates: Partial<Agent>): Promise<Agent>;
  abstract deleteAgent(providerNativeId: string): Promise<void>;

  /**
   * Generate a stable Hakuna ID from provider ID and native ID
   */
  protected generateHakunaId(providerNativeId: string): string {
    return `${this.providerId}:${providerNativeId}`;
  }

  /**
   * Default availability check - can be overridden
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to list agents as a health check
      await this.listAgents();
      return true;
    } catch (error) {
      logger.info(`[AGENT-ADAPTER] Provider ${this.providerId} is not available`, error);
      return false;
    }
  }
}

