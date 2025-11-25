import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../../logger.js";
import type { Provider } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ProviderService {
  private isCursorInstalled(): boolean {
    const projectRoot = process.cwd();
    const cursorConfigPath = join(projectRoot, ".cursor", "mcp.json");
    if (!existsSync(cursorConfigPath)) {
      return false;
    }
    
    try {
      const config = JSON.parse(readFileSync(cursorConfigPath, "utf-8"));
      return config.mcpServers && config.mcpServers["hakuna"] !== undefined;
    } catch {
      return false;
    }
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
        status: this.isCursorInstalled() && allInstalledProviders.has("cursor") ? "connected" : "pending",
        lastHeartbeat: this.isCursorInstalled() && allInstalledProviders.has("cursor") ? new Date().toISOString() : undefined,
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
        id: "microsoft_copilot",
        name: "Microsoft Copilot",
        type: "copilot",
        status: allInstalledProviders.has("microsoft_copilot") ? "connected" : "pending",
        icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/microsoft.svg",
        comingSoon: !AdapterFactory.isAdapterAvailable("microsoft_copilot"),
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

  async installCursorProvider(): Promise<{ success: boolean; error?: string }> {
    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const projectRoot = process.cwd();
      const cursorDir = join(projectRoot, ".cursor");
      const cursorConfigPath = join(cursorDir, "mcp.json");
      
      // Use absolute path from project root to avoid path calculation issues
      const gatewayPath = join(projectRoot, "dist", "index.js");
      
      let config: { mcpServers?: Record<string, unknown> } = {};
      if (existsSync(cursorConfigPath)) {
        try {
          config = JSON.parse(readFileSync(cursorConfigPath, "utf-8"));
        } catch {
          // If file exists but is invalid, we'll overwrite it
        }
      }
      
      if (!config.mcpServers) {
        config.mcpServers = {};
      }
      
      config.mcpServers["hakuna"] = {
        command: "node",
        args: [gatewayPath],
        cwd: projectRoot,
      };
      
      if (!existsSync(cursorDir)) {
        mkdirSync(cursorDir, { recursive: true });
      }
      
      writeFileSync(cursorConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async installProvider(providerId: string, config: Record<string, unknown>, tenantId?: string): Promise<void> {
    if (providerId === "cursor") {
      const result = await this.installCursorProvider();
      if (!result.success) {
        throw new Error(result.error);
      }
      const { saveProviderConfig } = await import("../../db/services/providerService.js");
      await saveProviderConfig(providerId, {}, tenantId);
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
  }

  async uninstallCursorProvider(): Promise<{ success: boolean; error?: string }> {
    try {
      const { unlinkSync, readFileSync, writeFileSync } = await import("fs");
      const projectRoot = process.cwd();
      const cursorConfigPath = join(projectRoot, ".cursor", "mcp.json");
      
      if (!existsSync(cursorConfigPath)) {
        return {
          success: false,
          error: "Provider cursor is not installed",
        };
      }
      
      let config: { mcpServers?: Record<string, unknown> } = {};
      try {
        config = JSON.parse(readFileSync(cursorConfigPath, "utf-8"));
      } catch {
        // If file exists but is invalid, we'll delete it
        unlinkSync(cursorConfigPath);
        return { success: true };
      }
      
      if (config.mcpServers && config.mcpServers["hakuna"]) {
        delete config.mcpServers["hakuna"];
        
        // If no other MCP servers remain, delete the entire mcp.json file
        if (Object.keys(config.mcpServers).length === 0) {
          unlinkSync(cursorConfigPath);
          logger.info(`[ProviderService] Deleted mcp.json file (no other MCP servers configured)`);
        } else {
          // Update the file with hakuna removed, keeping other MCP servers
          writeFileSync(cursorConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
          logger.info(`[ProviderService] Removed hakuna from mcp.json (other MCP servers remain)`);
        }
      } else {
        return {
          success: false,
          error: "Provider cursor is not installed",
        };
      }
      
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

    try {
      const { unregisterProviderAdapter } = await import("../../agents/index.js");
      unregisterProviderAdapter(providerId);
      logger.info(`[ProviderService] Unregistered adapter for provider: ${providerId}`);
    } catch (adapterError) {
      logger.warn(`[ProviderService] Failed to unregister adapter for ${providerId}, but config deleted:`, adapterError);
    }
  }
}

