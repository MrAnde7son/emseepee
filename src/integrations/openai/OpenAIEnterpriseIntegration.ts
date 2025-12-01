import type { Agent } from "../../config.js";
import { logger } from "../../logger.js";

export interface OpenAIEnterpriseIntegrationConfig {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
}

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
      files?: { data: unknown[] };
      created_at: number;
    }>;
  };
}

interface OpenAIListResponse<T> {
  data: T[];
  has_more?: boolean;
  next?: string;
}

export class OpenAIEnterpriseIntegration {
  private getBaseUrl(config: OpenAIEnterpriseIntegrationConfig): string {
    return config.baseUrl || "https://api.openai.com/v1";
  }

  private getHeaders(config: OpenAIEnterpriseIntegrationConfig): Record<string, string> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    };

    if (config.organizationId) {
      headers["OpenAI-Organization"] = config.organizationId;
    }

    return headers;
  }

  private async fetchPagedGpts(config: OpenAIEnterpriseIntegrationConfig): Promise<WorkspaceGpt[]> {
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

      const url = `${baseUrl}/gpts?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI /gpts error (${response.status}): ${text}`);
      }

      const data = await response.json() as OpenAIListResponse<WorkspaceGpt>;
      all.push(...data.data);

      if (!data.has_more || !data.next) {
        break;
      }

      after = data.next;
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
      tenantId: undefined,
      metadata: {
        type: "workspace_gpt",
        versionId: latest?.id,
        categories: latest?.categories ?? [],
        conversationStarters: latest?.conversation_starters ?? [],
        tools: latest?.tools?.data ?? [],
        visibility: this.parseVisibility(gpt.sharing?.visibility),
        sharedWith: gpt.sharing?.recipients?.data?.map((recipient) => recipient.email) ?? [],
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
      return gpts.map((gpt) => this.gptToAgent(gpt, config));
    } catch (error) {
      logger.error("[OPENAI-ENTERPRISE] Failed to list GPTs:", error);
      return [];
    }
  }

  async listUsers(
    _config: OpenAIEnterpriseIntegrationConfig,
  ): Promise<Array<{ id: string; email?: string; name?: string; active?: boolean; source: string }>> {
    return [];
  }
}
