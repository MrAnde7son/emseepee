import { BaseProviderAdapter } from "./base.js";
import type { Agent } from "../../config.js";
import { logger } from "../../logger.js";

/**
 * Cursor provider adapter
 * Cursor agents are typically identified by their role/context
 */
export class CursorAdapter extends BaseProviderAdapter {
  protected providerId = "cursor";

  getProviderId(): string {
    return this.providerId;
  }

  async listAgents(): Promise<Agent[]> {
    // Cursor doesn't have a native agent concept, so we create synthetic agents
    // based on common roles/contexts
    const agents: Agent[] = [
      {
        id: this.generateHakunaId("default"),
        name: "Cursor Default Agent",
        description: "Default Cursor AI assistant",
        providerId: this.providerId,
        providerNativeId: "default",
        role: "coder_bot",
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ];

    return agents;
  }

  async getAgent(providerNativeId: string): Promise<Agent | null> {
    const agents = await this.listAgents();
    return agents.find(a => a.providerNativeId === providerNativeId) || null;
  }

  async createAgent(agentData: Omit<Agent, "id" | "providerId" | "createdAt" | "updatedAt">): Promise<Agent> {
    // Cursor doesn't support creating agents, so we create a synthetic one
    const nativeId = agentData.providerNativeId || `agent_${Date.now()}`;
    const agent: Agent = {
      id: this.generateHakunaId(nativeId),
      name: agentData.name,
      description: agentData.description,
      providerId: this.providerId,
      providerNativeId: nativeId,
      role: agentData.role,
      env: agentData.env,
      tenantId: agentData.tenantId,
      metadata: agentData.metadata,
      enabled: agentData.enabled ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    logger.info(`[CURSOR-ADAPTER] Created synthetic agent ${agent.id}`);
    return agent;
  }

  async updateAgent(providerNativeId: string, updates: Partial<Agent>): Promise<Agent> {
    const existing = await this.getAgent(providerNativeId);
    if (!existing) {
      throw new Error(`Agent ${providerNativeId} not found`);
    }

    const updated: Agent = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    logger.info(`[CURSOR-ADAPTER] Updated agent ${updated.id}`);
    return updated;
  }

  async deleteAgent(providerNativeId: string): Promise<void> {
    logger.info(`[CURSOR-ADAPTER] Deleted agent ${providerNativeId}`);
    // Cursor doesn't have native agent deletion, so this is a no-op
  }
}

