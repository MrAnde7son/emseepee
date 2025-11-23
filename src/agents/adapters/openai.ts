import { BaseProviderAdapter } from "./base.js";
import type { Agent } from "../../config.js";
import { logger } from "../../logger.js";

/**
 * OpenAI provider adapter
 * Maps OpenAI Assistants API to Hakuna's unified Agent model
 */
export class OpenAIAdapter extends BaseProviderAdapter {
  protected providerId = "openai";
  private apiKey: string;
  private baseUrl: string;
  private organizationId?: string;

  constructor(apiKey?: string, baseUrl?: string, organizationId?: string) {
    super();
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
    this.baseUrl = baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    this.organizationId = organizationId || process.env.OPENAI_ORGANIZATION_ID;
  }

  getProviderId(): string {
    return this.providerId;
  }

  /**
   * Get headers for OpenAI API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
    };
    
    if (this.organizationId) {
      headers["OpenAI-Organization"] = this.organizationId;
    }
    
    return headers;
  }

  /**
   * Convert OpenAI Assistant to Hakuna Agent
   */
  private assistantToAgent(assistant: any): Agent {
    return {
      id: this.generateHakunaId(assistant.id),
      name: assistant.name || `OpenAI Assistant ${assistant.id.substring(0, 8)}`,
      description: assistant.description || assistant.instructions || undefined,
      providerId: this.providerId,
      providerNativeId: assistant.id,
      role: assistant.metadata?.role || assistant.metadata?.agentRole || "assistant",
      env: assistant.metadata?.env,
      tenantId: assistant.metadata?.tenantId,
      metadata: {
        model: assistant.model,
        tools: assistant.tools || [],
        temperature: assistant.temperature,
        top_p: assistant.top_p,
        response_format: assistant.response_format,
        ...assistant.metadata,
      },
      enabled: !assistant.metadata?.disabled,
      createdAt: assistant.created_at 
        ? new Date(assistant.created_at * 1000).toISOString()
        : new Date().toISOString(),
      updatedAt: assistant.updated_at
        ? new Date(assistant.updated_at * 1000).toISOString()
        : new Date().toISOString(),
    };
  }

  async listAgents(): Promise<Agent[]> {
    if (!this.apiKey) {
      logger.info("[OPENAI-ADAPTER] No API key configured, returning empty list");
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/assistants`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          logger.warn("[OPENAI-ADAPTER] Invalid API key");
          return [];
        }
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const assistants = data.data || [];

      return assistants.map((assistant: any) => this.assistantToAgent(assistant));
    } catch (error) {
      logger.error("[OPENAI-ADAPTER] Failed to list agents:", error);
      // Return empty array instead of throwing to allow other providers to work
      return [];
    }
  }

  async getAgent(providerNativeId: string): Promise<Agent | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/assistants/${providerNativeId}`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const assistant = await response.json();
      return this.assistantToAgent(assistant);
    } catch (error) {
      logger.error(`[OPENAI-ADAPTER] Failed to get agent ${providerNativeId}:`, error);
      return null;
    }
  }

  async createAgent(agentData: Omit<Agent, "id" | "providerId" | "createdAt" | "updatedAt">): Promise<Agent> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key is required to create agents");
    }

    try {
      // Build the assistant creation payload
      const payload: any = {
        name: agentData.name,
        model: (agentData.metadata as any)?.model || "gpt-4-turbo-preview",
      };

      // Add description/instructions
      if (agentData.description) {
        payload.description = agentData.description;
        payload.instructions = agentData.description;
      }

      // Add tools if specified
      if ((agentData.metadata as any)?.tools) {
        payload.tools = (agentData.metadata as any).tools;
      }

      // Add other OpenAI-specific parameters
      if ((agentData.metadata as any)?.temperature !== undefined) {
        payload.temperature = (agentData.metadata as any).temperature;
      }
      if ((agentData.metadata as any)?.top_p !== undefined) {
        payload.top_p = (agentData.metadata as any).top_p;
      }
      if ((agentData.metadata as any)?.response_format) {
        payload.response_format = (agentData.metadata as any).response_format;
      }

      // Build metadata object
      const metadata: Record<string, string> = {};
      if (agentData.role) {
        metadata.role = agentData.role;
        metadata.agentRole = agentData.role; // For backward compatibility
      }
      if (agentData.env) {
        metadata.env = agentData.env;
      }
      if (agentData.tenantId) {
        metadata.tenantId = agentData.tenantId;
      }
      if (agentData.metadata) {
        // Merge any additional metadata, converting values to strings
        for (const [key, value] of Object.entries(agentData.metadata)) {
          metadata[key] = String(value);
        }
      }
      if (!agentData.enabled) {
        metadata.disabled = "true";
      }

      if (Object.keys(metadata).length > 0) {
        payload.metadata = metadata;
      }

      const response = await fetch(`${this.baseUrl}/assistants`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const assistant = await response.json();
      return this.assistantToAgent(assistant);
    } catch (error) {
      logger.error("[OPENAI-ADAPTER] Failed to create agent:", error);
      throw error;
    }
  }

  async updateAgent(providerNativeId: string, updates: Partial<Agent>): Promise<Agent> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key is required to update agents");
    }

    try {
      const updatePayload: any = {};

      // Update name
      if (updates.name !== undefined) {
        updatePayload.name = updates.name;
      }

      // Update description/instructions
      if (updates.description !== undefined) {
        updatePayload.description = updates.description;
        updatePayload.instructions = updates.description;
      }

      // Update model
      if (updates.metadata && (updates.metadata as any).model) {
        updatePayload.model = (updates.metadata as any).model;
      }

      // Update tools
      if (updates.metadata && (updates.metadata as any).tools) {
        updatePayload.tools = (updates.metadata as any).tools;
      }

      // Update other parameters
      if (updates.metadata && (updates.metadata as any).temperature !== undefined) {
        updatePayload.temperature = (updates.metadata as any).temperature;
      }
      if (updates.metadata && (updates.metadata as any).top_p !== undefined) {
        updatePayload.top_p = (updates.metadata as any).top_p;
      }
      if (updates.metadata && (updates.metadata as any).response_format) {
        updatePayload.response_format = (updates.metadata as any).response_format;
      }

      // Update metadata
      const existingAgent = await this.getAgent(providerNativeId);
      const existingMetadata = existingAgent?.metadata || {};
      // Convert existing metadata to string values for OpenAI (which expects Record<string, string>)
      const newMetadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(existingMetadata)) {
        newMetadata[key] = String(value);
      }

      if (updates.role !== undefined) {
        newMetadata.role = updates.role;
        newMetadata.agentRole = updates.role;
      }
      if (updates.env !== undefined) {
        newMetadata.env = updates.env;
      }
      if (updates.tenantId !== undefined) {
        newMetadata.tenantId = updates.tenantId;
      }
      if (updates.enabled !== undefined) {
        if (!updates.enabled) {
          newMetadata.disabled = "true";
        } else {
          delete newMetadata.disabled;
        }
      }
      if (updates.metadata) {
        // Merge additional metadata, converting values to strings
        for (const [key, value] of Object.entries(updates.metadata)) {
          newMetadata[key] = String(value);
        }
      }

      updatePayload.metadata = newMetadata;

      const response = await fetch(`${this.baseUrl}/assistants/${providerNativeId}`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Agent ${providerNativeId} not found`);
        }
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const assistant = await response.json();
      return this.assistantToAgent(assistant);
    } catch (error) {
      logger.error(`[OPENAI-ADAPTER] Failed to update agent ${providerNativeId}:`, error);
      throw error;
    }
  }

  async deleteAgent(providerNativeId: string): Promise<void> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key is required to delete agents");
    }

    try {
      const response = await fetch(`${this.baseUrl}/assistants/${providerNativeId}`, {
        method: "DELETE",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Already deleted, consider it success
          return;
        }
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      if (result.deleted !== true) {
        logger.warn(`[OPENAI-ADAPTER] Delete response for ${providerNativeId} did not confirm deletion`);
      }
    } catch (error) {
      logger.error(`[OPENAI-ADAPTER] Failed to delete agent ${providerNativeId}:`, error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Try to list assistants as a health check
      const response = await fetch(`${this.baseUrl}/assistants?limit=1`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      // Consider available if we get 200 or 401 (401 means API key exists but might be invalid, but adapter is configured)
      return response.ok || response.status === 401;
    } catch (error) {
      logger.info(`[OPENAI-ADAPTER] Provider is not available:`, error);
      return false;
    }
  }
}

