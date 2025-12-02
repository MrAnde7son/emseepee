import { BaseProviderAdapter } from "./base.js";
import type { Agent } from "../../config.js";
import { logger } from "../../logger.js";
import { OpenAIEnterpriseIntegration, type OpenAIEnterpriseIntegrationConfig } from "../../integrations/openai/OpenAIEnterpriseIntegration.js";

/**
 * OpenAI provider adapter
 * Maps OpenAI Assistants API to Hakuna's unified Agent model
 */
export class OpenAIAdapter extends BaseProviderAdapter {
  protected providerId = "openai";
  private apiKey: string;
  private baseUrl: string;
  private organizationId?: string;
  private enterpriseIntegration = new OpenAIEnterpriseIntegration();

  constructor(apiKey?: string, baseUrl?: string, organizationId?: string) {
    super();
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
    this.baseUrl = baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    this.organizationId = organizationId || process.env.OPENAI_ORGANIZATION_ID;
  }

  /**
   * Build enterprise config from adapter's existing fields
   */
  private getEnterpriseConfig(): OpenAIEnterpriseIntegrationConfig {
    // Remove /v1 suffix from baseUrl for enterprise endpoints
    const enterpriseBaseUrl = this.baseUrl.replace(/\/v1\/?$/, "");
    return {
      apiKey: this.apiKey,
      baseUrl: enterpriseBaseUrl,
      organizationId: this.organizationId,
    };
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

    const assistants: Agent[] = [];
    const gpts: Agent[] = [];

    // Fetch classic assistants
    try {
      const allAssistants: any[] = [];
      let hasMore = true;
      let after: string | undefined = undefined;
      const limit = 100; // OpenAI API max limit per page

      // Fetch all assistants with pagination
      while (hasMore) {
        const params = new URLSearchParams({ limit: limit.toString() });
        if (after) {
          params.append("after", after);
        }
        
        const url = `${this.baseUrl}/assistants?${params.toString()}`;
        const response = await fetch(url, {
          method: "GET",
          headers: this.getHeaders(),
        });

        if (!response.ok) {
          if (response.status === 401) {
            logger.warn("[OPENAI-ADAPTER] Invalid API key");
            break;
          }
          const errorText = await response.text();
          throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const assistantsData = data.data || [];
        allAssistants.push(...assistantsData);

        // Check if there are more pages
        hasMore = data.has_more === true && assistantsData.length === limit;
        if (hasMore && assistantsData.length > 0) {
          // Use the last assistant's ID as the cursor for the next page
          after = assistantsData[assistantsData.length - 1].id;
        } else {
          hasMore = false;
        }
      }

      logger.info(`[OPENAI-ADAPTER] Fetched ${allAssistants.length} assistants from OpenAI`);
      assistants.push(...allAssistants.map((assistant: any) => this.assistantToAgent(assistant)));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide more helpful error messages for common network issues
      if (errorMessage.includes("fetch failed") || errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND")) {
        logger.error(`[OPENAI-ADAPTER] Network error when connecting to ${this.baseUrl}. Check your internet connection and baseUrl configuration. Error: ${errorMessage}`);
      } else if (errorMessage.includes("certificate") || errorMessage.includes("SSL") || errorMessage.includes("TLS")) {
        logger.error(`[OPENAI-ADAPTER] SSL/TLS error when connecting to ${this.baseUrl}. Check your certificate configuration. Error: ${errorMessage}`);
      } else {
        logger.error(`[OPENAI-ADAPTER] Failed to list assistants: ${errorMessage}`);
      }
    }

    // Fetch enterprise workspace GPTs
    try {
      if (this.apiKey) {
        const enterpriseConfig = this.getEnterpriseConfig();
        const enterpriseAgents = await this.enterpriseIntegration.listAgents(enterpriseConfig);
        gpts.push(...enterpriseAgents);
        logger.info(`[OPENAI-ADAPTER] Fetched ${enterpriseAgents.length} workspace GPTs from OpenAI Enterprise`);
      }
    } catch (error) {
      logger.error("[OPENAI-ADAPTER] Failed to list workspace GPTs:", error);
    }

    return [...assistants, ...gpts];
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
      const url = `${this.baseUrl}/assistants?limit=1`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return true;
      }

      // Handle different error statuses
      if (response.status === 401) {
        // 401 means unauthorized - API key might be invalid
        const errorData = await response.text().catch(() => "");
        logger.warn(`[OPENAI-ADAPTER] API key validation failed (401): ${errorData.substring(0, 100)}`);
        return false; // Return false for 401 so we can show proper error message
      }

      // For other HTTP errors, consider it available (adapter is configured, just might have temporary issues)
      logger.info(`[OPENAI-ADAPTER] API check returned status ${response.status}, considering available`);
      return true;
    } catch (error) {
      // Network errors or other exceptions
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        logger.warn(`[OPENAI-ADAPTER] API key appears invalid: ${errorMessage}`);
        return false;
      }
      
      // For network errors (fetch failed, connection refused, etc.), return false
      // This prevents listAgents() from being called when we know it will fail
      if (errorMessage.includes("fetch failed") || errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND")) {
        logger.warn(`[OPENAI-ADAPTER] Network error during availability check (${this.baseUrl}): ${errorMessage}. Provider will be skipped.`);
        return false;
      }
      
      // For other errors, log but consider available (might be temporary)
      logger.info(`[OPENAI-ADAPTER] Provider availability check error (non-critical): ${errorMessage}`);
      return true;
    }
  }
}

