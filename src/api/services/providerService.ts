import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../../logger.js";
import type { Provider } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ProviderService {
  private buildCursorConfig(tenantId?: string): {
    providerId: string;
    filename: string;
    contents: string;
    suggestedPaths: { macos: string; windows: string; linux: string };
  } {
    const cursorConfig: { mcpServers: Record<string, { url: string; tenantId?: string }> } = {
      mcpServers: {},
    };

    let apiUrl: string;

    if (process.env.GATEWAY_API_URL) {
      apiUrl = process.env.GATEWAY_API_URL.endsWith("/mcp")
        ? process.env.GATEWAY_API_URL
        : `${process.env.GATEWAY_API_URL}/mcp`;
    } else {
      const apiHost = process.env.GATEWAY_API_HOST || "localhost";
      const apiPort = process.env.GATEWAY_API_PORT ? parseInt(process.env.GATEWAY_API_PORT, 10) : 8000;
      const apiProtocol = process.env.GATEWAY_API_PROTOCOL || "http";
      const portSuffix = (apiProtocol === "http" && apiPort === 80) || (apiProtocol === "https" && apiPort === 443)
        ? ""
        : `:${apiPort}`;

      apiUrl = `${apiProtocol}://${apiHost}${portSuffix}/mcp`;
    }

    if (tenantId) {
      const url = new URL(apiUrl);
      url.searchParams.set("tenant", tenantId);
      apiUrl = url.toString();
    }

    cursorConfig.mcpServers.hakuna = {
      url: apiUrl,
      ...(tenantId && { tenantId }),
    };

    return {
      providerId: "cursor",
      filename: "mcp.json",
      contents: JSON.stringify(cursorConfig, null, 2) + "\n",
      suggestedPaths: {
        macos: join("~", ".cursor", "mcp.json"),
        linux: join("~", ".cursor", "mcp.json"),
        windows: join("%USERPROFILE%", ".cursor", "mcp.json"),
      },
    };
  }

  async getProviders(tenantId?: string): Promise<Provider[]> {
    const { AdapterFactory } = await import("../../agents/factory.js");
    
    let installedProviders: Set<string> = new Set();
    try {
      const { getAllProviderConfigs } = await import("../../db/services/providerService.js");
      const configs = await getAllProviderConfigs(tenantId);
      configs.forEach((cfg) => {
        installedProviders.add(cfg.providerId);
      });
    } catch (error) {
      logger.info("[ProviderService] Failed to load provider configs:", error);
    }
    
    let registeredProviders: string[] = [];
    try {
      const { getAgentRegistry } = await import("../../agents/registry.js");
      const registry = getAgentRegistry();
      registeredProviders = registry.getRegisteredProviders();
    } catch (error) {
      // Registry not initialized, continue
    }
    
    const allInstalledProviders = new Set([...installedProviders, ...registeredProviders]);

    const providers: Provider[] = [
      {
        id: "cursor",
        name: "Cursor",
        type: "cursor",
        status: allInstalledProviders.has("cursor") ? "connected" : "pending",
        lastHeartbeat: allInstalledProviders.has("cursor") ? new Date().toISOString() : undefined,
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/cursor.svg",
        comingSoon: false,
      },
      {
        id: "openai",
        name: "OpenAI ChatGPT",
        type: "openai",
        status: allInstalledProviders.has("openai") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("openai"),
      },
      {
        id: "openai_codex",
        name: "OpenAI Codex",
        type: "openai",
        status: allInstalledProviders.has("openai_codex") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("openai_codex"),
      },
      {
        id: "anthropic_claude_code",
        name: "Anthropic Claude Code",
        type: "anthropic",
        status: allInstalledProviders.has("anthropic_claude_code") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/anthropic.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("anthropic_claude_code"),
      },
      {
        id: "microsoft_copilot",
        name: "Microsoft Copilot",
        type: "copilot",
        status: allInstalledProviders.has("microsoft_copilot") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/microsoft.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("microsoft_copilot"),
      },
      {
        id: "github_copilot",
        name: "GitHub Copilot",
        type: "copilot",
        status: allInstalledProviders.has("github_copilot") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/github.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("github_copilot"),
      },
      {
        id: "vertex_ai",
        name: "Google Vertex AI",
        type: "vertex",
        status: allInstalledProviders.has("vertex_ai") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/googlecloud.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("vertex_ai"),
      },
      {
        id: "aws_bedrock",
        name: "AWS Bedrock",
        type: "bedrock",
        status: allInstalledProviders.has("aws_bedrock") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/amazonaws.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("aws_bedrock"),
      },
      {
        id: "n8n",
        name: "n8n",
        type: "n8n",
        status: allInstalledProviders.has("n8n") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/n8n.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("n8n"),
      },
      {
        id: "langchain",
        name: "LangChain",
        type: "langchain",
        status: allInstalledProviders.has("langchain") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/langchain.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("langchain"),
      },
    ];
    
    return providers;
  }

  async installCursorProvider(
    tenantId?: string,
  ): Promise<{
    success: boolean;
    clientDownload?: {
      providerId: string;
      filename: string;
      contents: string;
      suggestedPaths: { macos: string; windows: string; linux: string };
    };
    error?: string;
  }> {
    try {
      const cursorConfig = this.buildCursorConfig(tenantId);

      logger.info(`[ProviderService] Prepared Cursor config for tenant ID: ${tenantId || "none"}`);

      return { success: true, clientDownload: cursorConfig };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async installProvider(
    providerId: string,
    config: Record<string, unknown>,
    tenantId?: string,
  ): Promise<{
    success: boolean;
    clientDownload?: {
      providerId: string;
      filename: string;
      contents: string;
      suggestedPaths: { macos: string; windows: string; linux: string };
    };
  }> {
    if (providerId === "cursor") {
      const result = await this.installCursorProvider(tenantId);
      if (!result.success) {
        throw new Error(result.error);
      }
      const { saveProviderConfig } = await import("../../db/services/providerService.js");
      await saveProviderConfig(providerId, {}, tenantId);
      return { success: true, clientDownload: result.clientDownload };
    } else if (providerId === "openai") {
      if (!config || !config.apiKey || typeof config.apiKey !== "string") {
        throw new Error("OpenAI provider requires 'apiKey' in configuration");
      }

      if (!config.apiKey.startsWith("sk-")) {
        throw new Error("Invalid OpenAI API key format. API keys should start with 'sk-'");
      }

      const { saveProviderConfig } = await import("../../db/services/providerService.js");
      await saveProviderConfig(providerId, config, tenantId);

      try {
        const { AdapterFactory } = await import("../../agents/factory.js");
        const testAdapter = AdapterFactory.createAdapter("openai", config);
        if (testAdapter) {
          try {
            const isAvailable = await testAdapter.isAvailable();
            if (!isAvailable) {
              logger.warn("[ProviderService] OpenAI API key validation failed, but installation completed.");
            }
          } catch (validationError) {
            logger.warn("[ProviderService] OpenAI API key validation error (non-blocking):", validationError);
          }
        }
      } catch (error) {
        logger.warn("[ProviderService] OpenAI adapter validation had issues, but installation completed:", error);
      }
    } else {
      if (!config || Object.keys(config).length === 0) {
        throw new Error(`Provider ${providerId} requires configuration`);
      }

      const { saveProviderConfig } = await import("../../db/services/providerService.js");
      await saveProviderConfig(providerId, config, tenantId);
    }

    try {
      const { registerProviderAdapter } = await import("../../agents/index.js");
      await registerProviderAdapter(providerId, config);
      logger.info(`[ProviderService] Successfully installed and registered provider: ${providerId}`);
    } catch (adapterError) {
      logger.warn(`[ProviderService] Failed to register adapter for ${providerId}, but config saved:`, adapterError);
    }

    return { success: true };
  }

  async uninstallCursorProvider(): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info("[ProviderService] Cursor uninstall requested. Local Cursor config must be removed on the client.");
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async uninstallProvider(providerId: string, tenantId?: string): Promise<void> {
    // Handle Cursor provider specially since it uses file-based installation
    if (providerId === "cursor") {
      const result = await this.uninstallCursorProvider();
      if (!result.success) {
        throw new Error(result.error || "Failed to uninstall cursor provider");
      }
      
      // Try to delete DB config if it exists (optional cleanup)
      try {
        const { getProviderConfig, deleteProviderConfig } = await import("../../db/services/providerService.js");
        const providerConfig = await getProviderConfig(providerId, tenantId);
        if (providerConfig) {
          await deleteProviderConfig(providerId, tenantId);
          logger.info(`[ProviderService] Deleted provider configuration for: ${providerId}`);
        }
      } catch (error) {
        logger.warn(`[ProviderService] Failed to delete DB config for ${providerId}:`, error);
      }

      // Delete all agents associated with this provider from the database
      try {
        const { deleteAgentsByProviderFromDb } = await import("../../db/services/agentService.js");
        await deleteAgentsByProviderFromDb(providerId);
        logger.info(`[ProviderService] Deleted all agents for provider: ${providerId}`);
      } catch (agentError) {
        logger.warn(`[ProviderService] Failed to delete agents for ${providerId}:`, agentError);
      }

      // Unregister the adapter
      try {
        const { unregisterProviderAdapter } = await import("../../agents/index.js");
        unregisterProviderAdapter(providerId);
        logger.info(`[ProviderService] Unregistered adapter for provider: ${providerId}`);
      } catch (adapterError) {
        logger.warn(`[ProviderService] Failed to unregister adapter for ${providerId}:`, adapterError);
      }
      
      return;
    }

    // For other providers, check database config
    const { getProviderConfig, deleteProviderConfig } = await import("../../db/services/providerService.js");
    const providerConfig = await getProviderConfig(providerId, tenantId);
    
    if (!providerConfig) {
      throw new Error(`Provider ${providerId} is not installed`);
    }

    await deleteProviderConfig(providerId, tenantId);
    logger.info(`[ProviderService] Deleted provider configuration for: ${providerId}`);

    // Delete all agents associated with this provider from the database
    try {
      const { deleteAgentsByProviderFromDb } = await import("../../db/services/agentService.js");
      await deleteAgentsByProviderFromDb(providerId);
      logger.info(`[ProviderService] Deleted all agents for provider: ${providerId}`);
    } catch (agentError) {
      logger.warn(`[ProviderService] Failed to delete agents for ${providerId}:`, agentError);
    }

    // Unregister the adapter
    try {
      const { unregisterProviderAdapter } = await import("../../agents/index.js");
      unregisterProviderAdapter(providerId);
      logger.info(`[ProviderService] Unregistered adapter for provider: ${providerId}`);
    } catch (adapterError) {
      logger.warn(`[ProviderService] Failed to unregister adapter for ${providerId}, but config deleted:`, adapterError);
    }
  }
}
