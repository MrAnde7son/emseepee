import { logger } from "../../../logger.js";
import type { Agent } from "../../../config.js";

export interface Microsoft365CopilotIntegrationConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  dataverseHost: string;
  scope?: string;
}

export interface MicrosoftGraphUser {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string;
  accountEnabled?: boolean;
}

export interface MicrosoftCopilotInvocationResult {
  conversationId: string;
  response?: unknown;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class MicrosoftCopilotIntegration {
  private tokenCache: Map<string, CachedToken> = new Map();

  private getCacheKey(config: Microsoft365CopilotIntegrationConfig): string {
    return `${config.tenantId}:${config.clientId}:${config.dataverseHost}`;
  }

  private async getAccessToken(config: Microsoft365CopilotIntegrationConfig): Promise<string> {
    const cacheKey = this.getCacheKey(config);
    const cached = this.tokenCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now + 30000) {
      return cached.token;
    }

    const scope = config.scope || `https://${config.dataverseHost}/.default https://graph.microsoft.com/.default`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope,
    });

    const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to obtain Microsoft access token (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { access_token: string; expires_in?: number };
    const expiresIn = data.expires_in ? data.expires_in * 1000 : 3600 * 1000;
    this.tokenCache.set(cacheKey, { token: data.access_token, expiresAt: now + expiresIn });
    return data.access_token;
  }

  private async fetchDataversePaged<T>(url: string, headers: Record<string, string>): Promise<T[]> {
    const items: T[] = [];
    let nextUrl: string | undefined = url;

    while (nextUrl) {
      const response = await fetch(nextUrl, { method: "GET", headers });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Dataverse request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as { value?: T[]; [key: string]: unknown };
      if (Array.isArray(data.value)) {
        items.push(...data.value);
      }
      const nextLink = data["@odata.nextLink"];
      nextUrl = typeof nextLink === "string" ? nextLink : undefined;
    }

    return items;
  }

  private async fetchComponents(
    config: Microsoft365CopilotIntegrationConfig,
    botId: string,
    headers: Record<string, string>,
  ): Promise<any[]> {
    const baseUrl = `https://${config.dataverseHost}/api/data/v9.2/botcomponents?$filter=_botid_value eq ${botId}&$select=botcomponentid,componenttype,componenttypename,content`;
    return this.fetchDataversePaged<any>(baseUrl, headers);
  }

  async listAgents(config: Microsoft365CopilotIntegrationConfig): Promise<Agent[]> {
    try {
      const headers = {
        Authorization: `Bearer ${await this.getAccessToken(config)}`,
        Accept: "application/json;odata.metadata=minimal",
      };

      const botsUrl = `https://${config.dataverseHost}/api/data/v9.2/bots?$expand=createdby($select=systemuserid,fullname),modifiedby($select=systemuserid,fullname),owninguser($select=systemuserid,fullname)`;
      const bots = await this.fetchDataversePaged<any>(botsUrl, headers);

      const enrichedBots = await Promise.all(
        bots.map(async (bot) => {
          try {
            const components = await this.fetchComponents(config, bot.botid, headers);
            return {
              ...bot,
              customGptDetails: components.filter((c) => c.componenttype === 15),
              knowledgeSources: components.filter((c) => c.componenttype === 16),
              capabilities: components.filter((c) => c.componenttype === 9),
              externalTriggers: components.filter((c) => c.componenttype === 17),
            };
          } catch (error) {
            logger.warn(`[MS-COPILOT] Failed to fetch components for bot ${bot.botid}:`, error);
            return bot;
          }
        })
      );

      return enrichedBots.map((bot) => this.mapBotToAgent(bot, config));
    } catch (error) {
      logger.error("[MS-COPILOT] Failed to list agents:", error);
      return [];
    }
  }

  async listUsers(config: Microsoft365CopilotIntegrationConfig): Promise<Array<{ id: string; displayName?: string; email?: string; active?: boolean; source: string }>> {
    try {
      const headers = {
        Authorization: `Bearer ${await this.getAccessToken(config)}`,
        Accept: "application/json",
      };

      const users: MicrosoftGraphUser[] = await this.fetchDataversePaged<MicrosoftGraphUser>(
        "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,accountEnabled",
        headers
      );

      return users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.mail || u.userPrincipalName || undefined,
        active: u.accountEnabled ?? undefined,
        source: "microsoft-365",
      }));
    } catch (error) {
      logger.error("[MS-COPILOT] Failed to list Microsoft 365 users:", error);
      return [];
    }
  }

  async invokeCopilotAgent(
    agent: Agent,
    body: { userId: string; message: string; context?: unknown },
    config: Microsoft365CopilotIntegrationConfig,
  ): Promise<MicrosoftCopilotInvocationResult> {
    const headers = {
      Authorization: `Bearer ${await this.getAccessToken(config)}`,
      "Content-Type": "application/json",
    };

    const conversationResponse = await fetch("https://graph.microsoft.com/beta/copilot/conversations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: body.message,
          },
        ],
        participants: body.userId ? [{ id: body.userId, type: "user" }] : undefined,
        context: body.context,
      }),
    });

    if (!conversationResponse.ok) {
      const errorText = await conversationResponse.text();
      throw new Error(`Copilot conversation creation failed (${conversationResponse.status}): ${errorText}`);
    }

    const conversation = await conversationResponse.json() as { id: string };

    const chatResponse = await fetch(`https://graph.microsoft.com/beta/copilot/conversations/${conversation.id}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: `Use the ${agent.name} Copilot Studio agent to respond. ${body.message}`,
          },
        ],
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      throw new Error(`Copilot chat failed (${chatResponse.status}): ${errorText}`);
    }

    const chatResult = await chatResponse.json();

    return {
      conversationId: conversation.id,
      response: chatResult,
    };
  }

  private mapBotToAgent(bot: any, config: Microsoft365CopilotIntegrationConfig): Agent {
    return {
      id: `microsoft_copilot:${bot.botid}`,
      name: bot.name,
      description: bot.customGptDetails?.[0]?.content ?? undefined,
      providerId: "microsoft_copilot",
      providerNativeId: bot.botid,
      env: config.dataverseHost,
      owner: bot.owninguser?.fullname,
      metadata: {
        createdBy: bot.createdby?.fullname,
        modifiedBy: bot.modifiedby?.fullname,
        capabilities: bot.capabilities,
        knowledgeSources: bot.knowledgeSources,
        triggers: bot.externalTriggers,
        environmentHost: config.dataverseHost,
        source: "microsoft-copilot",
      },
      enabled: true,
      createdAt: bot.createdon,
      updatedAt: bot.modifiedon,
    };
  }
}
