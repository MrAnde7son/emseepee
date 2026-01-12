import type { Agent, ProviderAgentAdapter } from "../config.js";
import { logger } from "../logger.js";
import { getAgentFromDb, saveAgentToDb, getAllAgentsFromDb } from "../db/services/agentService.js";

/**
 * Agent Registry - unified management of agents across all providers
 * 
 * Provides:
 * - Unified agents list across all providers
 * - Stable EmSeePee identities for each agent
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
   * Load all known agents from the database into a map keyed by EmSeePee ID.
   * If the schema is missing (e.g., before migrations) fall back to an empty map.
   */
  private async loadAgentsFromDb(): Promise<Map<string, Agent>> {
    try {
      const agents = await getAllAgentsFromDb();
      return new Map(agents.map((agent) => [agent.id, agent]));
    } catch (error) {
      if (error instanceof Error && error.message.includes("no such table")) {
        return new Map();
      }
      logger.warn("[AGENT-REGISTRY] Failed to load agents from database:", error);
      return new Map();
    }
  }

  /**
   * Get a single agent from the database, returning null on schema errors.
   */
  private async getAgentFromDatabase(agentId: string): Promise<Agent | null> {
    try {
      return await getAgentFromDb(agentId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("no such table")) {
        return null;
      }
      logger.warn(`[AGENT-REGISTRY] Failed to read agent ${agentId} from database:`, error);
      return null;
    }
  }

  /**
   * Merge provider data with database data, preferring database-owned fields.
   */
  private mergeAgentData(providerAgent: Agent, dbAgent?: Agent): Agent {
    return {
      ...providerAgent,
      // Preserve owner/tenant from DB if present
      owner: dbAgent?.owner ?? providerAgent.owner,
      tenantId: dbAgent?.tenantId ?? providerAgent.tenantId,
      // Prefer provider values for descriptive fields, but keep DB fallback
      role: providerAgent.role ?? dbAgent?.role,
      env: providerAgent.env ?? dbAgent?.env,
      enabled: dbAgent?.enabled ?? providerAgent.enabled,
      // Keep timestamps from DB when available to avoid churn
      createdAt: dbAgent?.createdAt ?? providerAgent.createdAt ?? new Date().toISOString(),
      updatedAt: providerAgent.updatedAt ?? dbAgent?.updatedAt ?? new Date().toISOString(),
      lastSeenAt: dbAgent?.lastSeenAt ?? providerAgent.lastSeenAt,
      // Keep metadata/providerNativeId from provider if present, otherwise DB
      metadata: providerAgent.metadata ?? dbAgent?.metadata,
      providerNativeId: providerAgent.providerNativeId ?? dbAgent?.providerNativeId,
    };
  }

  /**
   * Persist an agent to the database, swallowing missing-table errors.
   */
  private async persistAgent(agent: Agent): Promise<void> {
    try {
      await saveAgentToDb(agent);
    } catch (error) {
      if (error instanceof Error && error.message.includes("no such table")) {
        return;
      }
      logger.warn(`[AGENT-REGISTRY] Failed to persist agent ${agent.id} to database:`, error);
    }
  }

  /**
   * Persist and refresh the agent from the database to ensure we return canonical DB fields.
   */
  private async persistAndRefresh(agent: Agent): Promise<Agent> {
    await this.persistAgent(agent);
    const dbAgent = await this.getAgentFromDatabase(agent.id);
    return dbAgent ? this.mergeAgentData(agent, dbAgent) : agent;
  }

  /**
   * Cache a merged agent with TTL.
   */
  private cacheAgent(agent: Agent): void {
    this.agentCache.set(agent.id, agent);
    this.cacheExpiry.set(agent.id, Date.now() + this.CACHE_TTL_MS);
  }

  /**
   * Sync provider-reported agents into the map/database and return merged data.
   */
  private async syncProviderAgents(
    adapter: ProviderAgentAdapter,
    agentsById: Map<string, Agent>
  ): Promise<void> {
    const providerAgents = await adapter.listAgents();
    for (const providerAgent of providerAgents) {
      const dbAgent = agentsById.get(providerAgent.id);
      const mergedAgent = this.mergeAgentData(providerAgent, dbAgent);
      const refreshed = await this.persistAndRefresh(mergedAgent);
      agentsById.set(refreshed.id, refreshed);
    }
  }

  /**
   * Extract provider native ID from a EmSeePee ID if the prefix matches the adapter.
   */
  private getProviderNativeId(agentId: string, adapter: ProviderAgentAdapter): string | null {
    const prefix = `${adapter.getProviderId()}:`;
    if (!agentId.startsWith(prefix)) {
      return null;
    }
    return agentId.slice(prefix.length) || null;
  }

  /**
   * Get all agents across all providers
   */
  async listAgents(): Promise<Agent[]> {
    const agentsById = await this.loadAgentsFromDb();

    for (const adapter of this.adapters.values()) {
      try {
        const isAvailable = await adapter.isAvailable();
        if (!isAvailable) {
          logger.info(`[AGENT-REGISTRY] Provider ${adapter.getProviderId()} is not available, skipping`);
          continue;
        }

        await this.syncProviderAgents(adapter, agentsById);
      } catch (error) {
        logger.error(`[AGENT-REGISTRY] Failed to list agents from provider ${adapter.getProviderId()}`, error);
      }
    }

    const agents = Array.from(agentsById.values());
    agents.forEach((agent) => this.cacheAgent(agent));
    return agents;
  }

  /**
   * Get a specific agent by its EmSeePee ID
   */
  async getAgent(agentId: string): Promise<Agent | null> {
    // Check cache first
    const cached = this.agentCache.get(agentId);
    const expiry = this.cacheExpiry.get(agentId);
    if (cached && expiry && Date.now() < expiry) {
      const dbAgent = await this.getAgentFromDatabase(agentId);
      if (dbAgent) {
        this.cacheAgent(dbAgent);
        return dbAgent;
      }
      return cached;
    }

    // Prefer database source of truth
    const dbAgent = await this.getAgentFromDatabase(agentId);
    if (dbAgent) {
      this.cacheAgent(dbAgent);
      return dbAgent;
    }

    // Fallback: ask providers directly (helps when DB isn't populated yet)
    for (const adapter of this.adapters.values()) {
      const providerNativeId = this.getProviderNativeId(agentId, adapter);
      if (!providerNativeId) {
        continue;
      }

      try {
        const isAvailable = await adapter.isAvailable();
        if (!isAvailable) {
          continue;
        }

        const agent = await adapter.getAgent(providerNativeId);
        if (!agent) {
          continue;
        }

        const mergedAgent = this.mergeAgentData(agent);
        await this.persistAgent(mergedAgent);
        this.cacheAgent(mergedAgent);
        return mergedAgent;
      } catch (error) {
        logger.error(`[AGENT-REGISTRY] Failed to get agent ${agentId} from provider ${adapter.getProviderId()}`, error);
      }
    }
    
    // Last resort: walk the full list to cover edge IDs that don't encode provider
    const agents = await this.listAgents();
    return agents.find((a) => a.id === agentId) ?? null;
  }

  /**
   * Get agents by provider ID
   */
  async getAgentsByProvider(providerId: string): Promise<Agent[]> {
    const agentsById = await this.loadAgentsFromDb();
    const adapter = this.adapters.get(providerId);

    if (!adapter) {
      logger.warn(`[AGENT-REGISTRY] No adapter found for provider: ${providerId}`);
    } else {
      try {
        const isAvailable = await adapter.isAvailable();
        if (isAvailable) {
          await this.syncProviderAgents(adapter, agentsById);
        }
      } catch (error) {
        logger.error(`[AGENT-REGISTRY] Failed to get agents from provider ${providerId}`, error);
      }
    }

    const agents = Array.from(agentsById.values()).filter((agent) => agent.providerId === providerId);
    agents.forEach((agent) => this.cacheAgent(agent));
    return agents;
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
    
    const refreshed = await this.persistAndRefresh(mergedAgent);
    this.cacheAgent(refreshed);
    
    logger.info(`[AGENT-REGISTRY] Created agent ${refreshed.id} in provider ${providerId}`);
    return refreshed;
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
    // Always use updates.owner if provided, otherwise use existing agent.owner
    const mergedAgent = this.mergeAgentData(
      {
        ...updated,
        owner: updates.owner !== undefined ? updates.owner : (updated.owner ?? agent.owner),
        tenantId: updates.tenantId !== undefined ? updates.tenantId : (updated.tenantId ?? agent.tenantId),
      },
      agent
    );
    
    const refreshed = await this.persistAndRefresh(mergedAgent);
    this.cacheAgent(refreshed);
    
    logger.info(`[AGENT-REGISTRY] Updated agent ${agentId}`);
    return refreshed;
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
