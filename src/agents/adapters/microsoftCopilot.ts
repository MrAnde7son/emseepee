import { BaseProviderAdapter } from "./base.js";
import type { Agent } from "../../config.js";
import { logger } from "../../logger.js";
import { MicrosoftCopilotIntegration, type Microsoft365CopilotIntegrationConfig } from "../../integrations/microsoft/copilot/MicrosoftCopilotIntegration.js";

export class MicrosoftCopilotAdapter extends BaseProviderAdapter {
  protected providerId = "microsoft_copilot";
  private integration = new MicrosoftCopilotIntegration();
  private config?: Microsoft365CopilotIntegrationConfig;

  constructor(config?: Record<string, unknown>) {
    super();
    if (config) {
      this.setConfig(config);
    }
  }

  private setConfig(config: Record<string, unknown>): void {
    const tenantId = config.tenantId as string | undefined;
    const clientId = config.clientId as string | undefined;
    const clientSecret = config.clientSecret as string | undefined;
    const dataverseHost = config.dataverseHost as string | undefined;
    const scope = config.scope as string | undefined;

    if (!tenantId || !clientId || !clientSecret || !dataverseHost) {
      logger.warn("[MS-COPILOT-ADAPTER] Missing required configuration values");
      return;
    }

    this.config = { tenantId, clientId, clientSecret, dataverseHost, scope };
  }

  getProviderId(): string {
    return this.providerId;
  }

  async listAgents(): Promise<Agent[]> {
    if (!this.config) {
      logger.warn("[MS-COPILOT-ADAPTER] Adapter is not configured; returning empty agent list");
      return [];
    }

    return this.integration.listAgents(this.config);
  }

  async getAgent(providerNativeId: string): Promise<Agent | null> {
    const agents = await this.listAgents();
    return agents.find((agent) => agent.providerNativeId === providerNativeId) || null;
  }

  async createAgent(): Promise<Agent> {
    throw new Error("Creating Copilot agents via EmSeePee is not supported");
  }

  async updateAgent(): Promise<Agent> {
    throw new Error("Updating Copilot agents via EmSeePee is not supported");
  }

  async deleteAgent(): Promise<void> {
    throw new Error("Deleting Copilot agents via EmSeePee is not supported");
  }
}
