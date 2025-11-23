import type { Agent, ProviderAgentAdapter, ProviderType } from "../config.js";
import { logger } from "../logger.js";

/**
 * Agent Registry - unified management of agents across all providers
 * 
 * Provides:
 * - Unified agents list across all providers
 * - Stable Hakuna identities for each agent
 * - Policy, logging, and tenant mapping attachment points
 */
export class AgentRegistry {
  private adapters: Map<string, ProviderAgentAdapter> = new Map();
  private agentCache: Map<string, Agent> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  /**
   * Register a provider adapter
   */
  registerAdapter(adapter: ProviderAgentAdapter): void {
    const providerId = adapter.getProviderId();
    this.adapters.set(providerId, adapter);
    logger.info(`[AGENT-REGISTRY] Registered adapter for provider: ${providerId}`);
  }

  /**
   * Unregister a provider adapter
   */
  unregisterAdapter(providerId: string): void {
    this.adapters.delete(providerId);
    // Clear cache entries for this provider
    for (const [agentId, agent] of this.agentCache.entries()) {
      if (agent.providerId === providerId) {
        this.agentCache.delete(agentId);
        this.cacheExpiry.delete(agentId);
      }
    }
    logger.info(`[AGENT-REGISTRY] Unregistered adapter for provider: ${providerId}`);
  }

  /**
   * Get all agents across all providers
   */
  async listAgents(): Promise<Agent[]> {
    const agents: Agent[] = [];
    
    for (const adapter of this.adapters.values()) {
      try {
        const isAvailable = await adapter.isAvailable();
        if (!isAvailable) {
          logger.info(`[AGENT-REGISTRY] Provider ${adapter.getProviderId()} is not available, skipping`);
          continue;
        }
        
        const providerAgents = await adapter.listAgents();
        agents.push(...providerAgents);
      } catch (error) {
        logger.error(`[AGENT-REGISTRY] Failed to list agents from provider ${adapter.getProviderId()}`, error);
      }
    }
    
    return agents;
  }

  /**
   * Get a specific agent by its Hakuna ID
   */
  async getAgent(agentId: string): Promise<Agent | null> {
    // Check cache first
    const cached = this.agentCache.get(agentId);
    const expiry = this.cacheExpiry.get(agentId);
    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    // Find agent across all providers
    for (const adapter of this.adapters.values()) {
      try {
        const isAvailable = await adapter.isAvailable();
        if (!isAvailable) {
          continue;
        }
        
        const agents = await adapter.listAgents();
        const agent = agents.find(a => a.id === agentId);
        
        if (agent) {
          // Cache the agent
          this.agentCache.set(agentId, agent);
          this.cacheExpiry.set(agentId, Date.now() + this.CACHE_TTL_MS);
          return agent;
        }
      } catch (error) {
        logger.error(`[AGENT-REGISTRY] Failed to get agent ${agentId} from provider ${adapter.getProviderId()}`, error);
      }
    }
    
    return null;
  }

  /**
   * Get agents by provider ID
   */
  async getAgentsByProvider(providerId: string): Promise<Agent[]> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      logger.warn(`[AGENT-REGISTRY] No adapter found for provider: ${providerId}`);
      return [];
    }

    try {
      const isAvailable = await adapter.isAvailable();
      if (!isAvailable) {
        return [];
      }
      
      return await adapter.listAgents();
    } catch (error) {
      logger.error(`[AGENT-REGISTRY] Failed to get agents from provider ${providerId}`, error);
      return [];
    }
  }

  /**
   * Get agents by role
   */
  async getAgentsByRole(role: string): Promise<Agent[]> {
    const allAgents = await this.listAgents();
    return allAgents.filter(agent => agent.role === role);
  }

  /**
   * Get agents by tenant
   */
  async getAgentsByTenant(tenantId: string): Promise<Agent[]> {
    const allAgents = await this.listAgents();
    return allAgents.filter(agent => agent.tenantId === tenantId);
  }

  /**
   * Create a new agent in a provider
   */
  async createAgent(
    providerId: string,
    agentData: Omit<Agent, "id" | "providerId" | "createdAt" | "updatedAt">
  ): Promise<Agent> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${providerId}`);
    }

    const isAvailable = await adapter.isAvailable();
    if (!isAvailable) {
      throw new Error(`Provider ${providerId} is not available`);
    }

    const agent = await adapter.createAgent(agentData);
    
    // Cache the new agent
    this.agentCache.set(agent.id, agent);
    this.cacheExpiry.set(agent.id, Date.now() + this.CACHE_TTL_MS);
    
    logger.info(`[AGENT-REGISTRY] Created agent ${agent.id} in provider ${providerId}`);
    return agent;
  }

  /**
   * Update an agent
   */
  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const adapter = this.adapters.get(agent.providerId);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${agent.providerId}`);
    }

    if (!agent.providerNativeId) {
      throw new Error(`Agent ${agentId} has no provider-native ID`);
    }

    const updated = await adapter.updateAgent(agent.providerNativeId, updates);
    
    // Update cache
    this.agentCache.set(agentId, updated);
    this.cacheExpiry.set(agentId, Date.now() + this.CACHE_TTL_MS);
    
    logger.info(`[AGENT-REGISTRY] Updated agent ${agentId}`);
    return updated;
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const adapter = this.adapters.get(agent.providerId);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${agent.providerId}`);
    }

    if (!agent.providerNativeId) {
      throw new Error(`Agent ${agentId} has no provider-native ID`);
    }

    await adapter.deleteAgent(agent.providerNativeId);
    
    // Remove from cache
    this.agentCache.delete(agentId);
    this.cacheExpiry.delete(agentId);
    
    logger.info(`[AGENT-REGISTRY] Deleted agent ${agentId}`);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.agentCache.clear();
    this.cacheExpiry.clear();
    logger.info("[AGENT-REGISTRY] Cache cleared");
  }

  /**
   * Invalidate cache for a specific agent
   */
  invalidateAgent(agentId: string): void {
    this.agentCache.delete(agentId);
    this.cacheExpiry.delete(agentId);
    logger.info(`[AGENT-REGISTRY] Cache invalidated for agent ${agentId}`);
  }

  /**
   * Get all registered provider IDs
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// Singleton instance
let registryInstance: AgentRegistry | null = null;

/**
 * Get the global agent registry instance
 */
export function getAgentRegistry(): AgentRegistry {
  if (!registryInstance) {
    registryInstance = new AgentRegistry();
  }
  return registryInstance;
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetAgentRegistry(): void {
  registryInstance = null;
}

