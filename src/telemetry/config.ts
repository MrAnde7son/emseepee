import { logger } from "../logger.js";
import { getConfigValue, setConfigValue } from "../db/services/configService.js";

/**
 * Telemetry deployment mode
 */
export type TelemetryMode = "self-hosted" | "cloud";

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  // Deployment mode: self-hosted (opt-in) or cloud (opt-out)
  mode: TelemetryMode;
  // Whether telemetry is enabled
  enabled: boolean;
  // PostHog API key
  apiKey?: string;
  // PostHog host (for self-hosted instances)
  host?: string;
  // Instance ID for anonymized tracking (auto-generated)
  instanceId?: string;
}

/**
 * Get telemetry configuration from database or environment
 */
export async function getTelemetryConfig(): Promise<TelemetryConfig> {
  try {
    const dbConfig = await getConfigValue<TelemetryConfig>("telemetry");
    if (dbConfig) {
      return dbConfig;
    }
  } catch (error) {
    logger.warn("[TELEMETRY] Failed to load config from database:", error);
  }

  // Fallback to environment variables or defaults
  const mode = (process.env.TELEMETRY_MODE as TelemetryMode) || "self-hosted";
  const config: TelemetryConfig = {
    mode,
    enabled: process.env.TELEMETRY_ENABLED === "true",
    apiKey: process.env.POSTHOG_API_KEY,
    host: process.env.POSTHOG_HOST || (mode === "cloud" ? "https://app.posthog.com" : undefined),
  };

  // Save default config to database
  try {
    await saveTelemetryConfig(config);
  } catch (error) {
    logger.warn("[TELEMETRY] Failed to save default config:", error);
  }

  return config;
}

/**
 * Save telemetry configuration to database
 */
export async function saveTelemetryConfig(config: TelemetryConfig): Promise<void> {
  try {
    await setConfigValue("telemetry", config);
    logger.info("[TELEMETRY] Configuration saved");
  } catch (error) {
    logger.error("[TELEMETRY] Failed to save configuration:", error);
    throw error;
  }
}

/**
 * Update telemetry enabled status
 */
export async function updateTelemetryEnabled(enabled: boolean): Promise<void> {
  const config = await getTelemetryConfig();
  config.enabled = enabled;
  await saveTelemetryConfig(config);
}

/**
 * Update telemetry mode
 */
export async function updateTelemetryMode(mode: TelemetryMode): Promise<void> {
  const config = await getTelemetryConfig();
  config.mode = mode;
  await saveTelemetryConfig(config);
}

/**
 * Update PostHog configuration
 */
export async function updatePostHogConfig(apiKey?: string, host?: string): Promise<void> {
  const config = await getTelemetryConfig();
  if (apiKey !== undefined) {
    config.apiKey = apiKey;
  }
  if (host !== undefined) {
    config.host = host;
  }
  await saveTelemetryConfig(config);
}

