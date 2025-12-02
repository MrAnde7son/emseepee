import { logger } from "../../logger.js";
import type { Agent } from "../../config.js";

export interface OpenAIEnterpriseIntegrationConfig {
  apiKey: string;
  baseUrl?: string; // e.g. https://api.openai.com
  organizationId?: string; // optional, for enterprise org scoping
}

// Shape similar to ComplianceWorkspaceGptAPIResult
export interface WorkspaceGpt {
  id: string;
  created_at: number;
  owner_id?: string;
  owner_email?: string;
  builder_name?: string;
  sharing?: {
    visibility?: string;
    recipients?: { data: Array<{ email: string }> };
  };
  latest_config: {
    data: Array<{
      id: string;
      name: string;
      description?: string;
      instructions?: string;
      conversation_starters?: string[];
      categories?: string[];
      tools?: { data: Array<{ type: string; name?: string; description?: string }> };
      files?: { data: any[] };
      created_at: number;
    }>;
  };
}

interface OpenAIListResponse<T> {
  data: T[];
  has_more?: boolean;
  next?: string;
}

interface WorkspaceUser {
  id: string;
  email?: string;
  name?: string;
  display_name?: string;
  active?: boolean;
  role?: string;
  created_at?: number;
  updated_at?: number;
}

export class OpenAIEnterpriseIntegration {
  private getBaseUrl(config: OpenAIEnterpriseIntegrationConfig): string {
    // Ensure baseUrl doesn't end with /v1, we'll add it in the endpoint paths
    const base = config.baseUrl || "https://api.openai.com";
    return base.replace(/\/v1\/?$/, "");
  }

  private getHeaders(config: OpenAIEnterpriseIntegrationConfig): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    };

    if (config.organizationId) {
      headers["OpenAI-Organization"] = config.organizationId;
    }

    return headers;
  }

  private async fetchPagedGpts(
    config: OpenAIEnterpriseIntegrationConfig,
  ): Promise<WorkspaceGpt[]> {
    const baseUrl = this.getBaseUrl(config);
    const headers = this.getHeaders(config);
    const all: WorkspaceGpt[] = [];
    let after: string | undefined;

    const limit = 50;

    while (true) {
      const params = new URLSearchParams({ limit: String(limit), file_format: "url" });
      if (after) {
        params.set("after", after);
      }

      const url = `${baseUrl}/v1/gpts?${params.toString()}`;
      const resp = await fetch(url, { method: "GET", headers });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OpenAI /gpts error (${resp.status}): ${text}`);
      }

      const json = (await resp.json()) as OpenAIListResponse<WorkspaceGpt>;
      all.push(...json.data);

      if (!json.has_more || !json.next) {
        break;
      }
      after = json.next;
    }

    return all;
  }

  private parseVisibility(visibility?: string): "internet" | "org" | "invite" | "none" {
    switch (visibility) {
      case "gpt-store":
      case "anyone-with-link":
        return "internet";
      case "workspace":
      case "workspace-with-link":
        return "org";
      case "invite-only":
        return "invite";
      default:
        return "none";
    }
  }

  private gptToAgent(gpt: WorkspaceGpt, config: OpenAIEnterpriseIntegrationConfig): Agent {
    const latest = gpt.latest_config?.data?.[0];

    return {
      id: `openai_gpt:${gpt.id}:${latest?.id}`,
      name: latest?.name || `GPT ${gpt.id.slice(0, 8)}`,
      description: latest?.description || latest?.instructions || undefined,
      providerId: "openai",
      providerNativeId: gpt.id,
      role: "assistant",
      env: config.baseUrl,
      tenantId: undefined, // if you map workspaces ↔ tenants later
      owner: gpt.builder_name || gpt.owner_email,
      metadata: {
        type: "workspace_gpt",
        versionId: latest?.id,
        categories: latest?.categories ?? [],
        conversationStarters: latest?.conversation_starters ?? [],
        tools: latest?.tools?.data ?? [],
        visibility: this.parseVisibility(gpt.sharing?.visibility),
        sharedWith: gpt.sharing?.recipients?.data?.map((r) => r.email) ?? [],
        owner: {
          id: gpt.owner_id ?? "",
          name: gpt.builder_name ?? "",
          email: gpt.owner_email ?? "",
        },
      },
      enabled: true,
      createdAt: new Date(gpt.created_at * 1000).toISOString(),
      updatedAt: latest?.created_at
        ? new Date(latest.created_at * 1000).toISOString()
        : new Date().toISOString(),
    };
  }

  async listAgents(config: OpenAIEnterpriseIntegrationConfig): Promise<Agent[]> {
    try {
      const gpts = await this.fetchPagedGpts(config);
      return gpts.map((g) => this.gptToAgent(g, config));
    } catch (error) {
      logger.error("[OPENAI-ENTERPRISE] Failed to list GPTs:", error);
      return [];
    }
  }

  private async fetchPagedUsers(
    config: OpenAIEnterpriseIntegrationConfig,
  ): Promise<WorkspaceUser[]> {
    const baseUrl = this.getBaseUrl(config);
    const headers = this.getHeaders(config);
    const all: WorkspaceUser[] = [];
    let after: string | undefined;

    const limit = 100; // OpenAI API max limit per page

    // Try different endpoint patterns based on OpenAI Admin API structure
    const endpointPatterns = [
      "/v1/admin/users", // Standard admin endpoint
      "/v1/organizations/users", // Organization-scoped endpoint
    ];

    // If organizationId is provided, try organization-specific endpoint
    if (config.organizationId) {
      endpointPatterns.unshift(`/v1/organizations/${config.organizationId}/users`);
    }

    let lastError: Error | null = null;

    // Try each endpoint pattern until one works
    for (const endpoint of endpointPatterns) {
      try {
        all.length = 0; // Reset array for new attempt
        after = undefined;

        while (true) {
          const params = new URLSearchParams({ limit: String(limit) });
          if (after) {
            params.set("after", after);
          }

          const url = `${baseUrl}${endpoint}?${params.toString()}`;
          const resp = await fetch(url, { method: "GET", headers });

          if (!resp.ok) {
            // If 404 or 403, try next endpoint pattern
            if (resp.status === 404 || resp.status === 403) {
              throw new Error(`Endpoint not available (${resp.status})`);
            }
            const text = await resp.text();
            throw new Error(`OpenAI ${endpoint} error (${resp.status}): ${text}`);
          }

          const json = (await resp.json()) as OpenAIListResponse<WorkspaceUser>;
          all.push(...json.data);

          if (!json.has_more || !json.next) {
            break;
          }
          after = json.next;
        }

        // Success - return the results
        logger.info(`[OPENAI-ENTERPRISE] Successfully fetched ${all.length} users from ${endpoint}`);
        return all;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // If this was a 404/403, try next endpoint; otherwise log and continue
        if (lastError.message.includes("404") || lastError.message.includes("403")) {
          logger.info(`[OPENAI-ENTERPRISE] Endpoint ${endpoint} not available, trying next...`);
          continue;
        }
        // For other errors, log but continue trying
        logger.warn(`[OPENAI-ENTERPRISE] Error fetching from ${endpoint}:`, lastError);
      }
    }

    // If all endpoints failed, throw the last error or return empty array
    if (lastError && !lastError.message.includes("404") && !lastError.message.includes("403")) {
      throw lastError;
    }

    // If all endpoints returned 404/403, the admin API might not be available
    logger.warn(
      "[OPENAI-ENTERPRISE] ChatGPT Admin API endpoints not available. This may require Enterprise plan or specific permissions.",
    );
    return [];
  }

  async listUsers(
    config: OpenAIEnterpriseIntegrationConfig,
  ): Promise<Array<{ id: string; email?: string; name?: string; active?: boolean; source: string }>> {
    try {
      const workspaceUsers = await this.fetchPagedUsers(config);
      return workspaceUsers.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name || user.display_name,
        active: user.active ?? true,
        source: "chatgpt",
      }));
    } catch (error) {
      logger.error("[OPENAI-ENTERPRISE] Failed to list workspace users:", error);
      return [];
    }
  }
}

