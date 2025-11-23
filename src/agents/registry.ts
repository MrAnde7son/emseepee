import type { Agent, ProviderAgentAdapter, ProviderType } from "../config.js";
import { logger } from "../logger.js";
import { getAgentFromDb, saveAgentToDb } from "../db/services/agentService.js";

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
   * Merge database data with adapter data
   * Database data takes precedence for fields like owner, tenantId, etc.
   */
  private async mergeWithDatabaseData(agent: Agent): Promise<Agent> {
    try {
      const dbAgent = await getAgentFromDb(agent.id);
      if (dbAgent) {
        // Merge database fields (owner, tenantId, etc.) with adapter data
        return {
          ...agent,
          owner: dbAgent.owner || agent.owner,
          tenantId: dbAgent.tenantId || agent.tenantId,
          role: dbAgent.role || agent.role,
          env: dbAgent.env || agent.env,
          enabled: dbAgent.enabled !== undefined ? dbAgent.enabled : agent.enabled,
          lastSeenAt: dbAgent.lastSeenAt || agent.lastSeenAt,
        };
      }
    } catch (error) {
      // Silently handle "table doesn't exist" errors - this is expected if the database
      // hasn't been fully initialized or migrated yet
      if (error instanceof Error && error.message.includes("no such table")) {
        // Table doesn't exist yet - return agent as-is without database merge
        return agent;
      }
      // Log other errors as warnings
      logger.warn(`[AGENT-REGISTRY] Failed to merge database data for agent ${agent.id}:`, error);
    }
    return agent;
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
        // Merge each agent with database data
        for (const agent of providerAgents) {
          const mergedAgent = await this.mergeWithDatabaseData(agent);
          agents.push(mergedAgent);
        }
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
      // Still merge with database data in case it was updated
      return await this.mergeWithDatabaseData(cached);
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
          // Merge with database data
          const mergedAgent = await this.mergeWithDatabaseData(agent);
          // Cache the merged agent
          this.agentCache.set(agentId, mergedAgent);
          this.cacheExpiry.set(agentId, Date.now() + this.CACHE_TTL_MS);
          return mergedAgent;
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
      
      const agents = await adapter.listAgents();
      // Merge each agent with database data
      const mergedAgents = await Promise.all(
        agents.map(agent => this.mergeWithDatabaseData(agent))
      );
      return mergedAgents;
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
    
    // Merge agentData fields (like owner) that might not be in adapter response
    const mergedAgent: Agent = {
      ...agent,
      owner: agentData.owner || agent.owner,
      tenantId: agentData.tenantId || agent.tenantId,
    };
    
    // Save to database (including owner field)
    try {
      await saveAgentToDb(mergedAgent);
    } catch (error) {
      // Silently handle "table doesn't exist" errors
      if (error instanceof Error && error.message.includes("no such table")) {
        // Table doesn't exist yet - skip database save silently
      } else {
        logger.warn(`[AGENT-REGISTRY] Failed to save agent ${mergedAgent.id} to database:`, error);
      }
      // Continue even if database save fails
    }
    
    // Cache the merged agent
    this.agentCache.set(mergedAgent.id, mergedAgent);
    this.cacheExpiry.set(mergedAgent.id, Date.now() + this.CACHE_TTL_MS);
    
    logger.info(`[AGENT-REGISTRY] Created agent ${mergedAgent.id} in provider ${providerId}`);
    return mergedAgent;
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
    
    // Merge updates with existing agent data (especially for owner field)
    const mergedAgent: Agent = {
      ...updated,
      owner: updates.owner !== undefined ? updates.owner : agent.owner,
      tenantId: updates.tenantId !== undefined ? updates.tenantId : agent.tenantId,
    };
    
    // Save to database (including owner field)
    try {
      await saveAgentToDb(mergedAgent);
    } catch (error) {
      // Silently handle "table doesn't exist" errors
      if (error instanceof Error && error.message.includes("no such table")) {
        // Table doesn't exist yet - skip database save silently
      } else {
        logger.warn(`[AGENT-REGISTRY] Failed to save updated agent ${agentId} to database:`, error);
      }
      // Continue even if database save fails
    }
    
    // Update cache
    this.agentCache.set(agentId, mergedAgent);
    this.cacheExpiry.set(agentId, Date.now() + this.CACHE_TTL_MS);
    
    logger.info(`[AGENT-REGISTRY] Updated agent ${agentId}`);
    return mergedAgent;
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

