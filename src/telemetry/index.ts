import { logger } from "../logger.js";
import { getTelemetryConfig, TelemetryConfig, TelemetryMode } from "./config.js";

/**
 * Telemetry service using PostHog
 * Supports both self-hosted (opt-in) and cloud-managed (opt-out) modes
 */
class TelemetryService {
  private posthog: any = null;
  private config: TelemetryConfig | null = null;
  private instanceId: string | null = null;

  /**
   * Initialize telemetry service
   */
  async initialize(): Promise<void> {
    try {
      this.config = await getTelemetryConfig();
      
      if (!this.isEnabled()) {
        logger.info("[TELEMETRY] Telemetry is disabled");
        return;
      }

      // Lazy load PostHog only if telemetry is enabled
      const { PostHog } = await import("posthog-node");
      
      const apiKey = this.config.apiKey || process.env.POSTHOG_API_KEY;
      const host = this.config.host || process.env.POSTHOG_HOST || "https://app.posthog.com";

      if (!apiKey) {
        logger.warn("[TELEMETRY] PostHog API key not configured, telemetry disabled");
        return;
      }

      this.posthog = new PostHog(apiKey, {
        host,
        flushAt: 20, // Flush after 20 events
        flushInterval: 10000, // Or flush every 10 seconds
      });

      // Generate or retrieve instance ID
      this.instanceId = this.config.instanceId || await this.generateInstanceId();
      
      // Save instance ID if it was generated
      if (!this.config.instanceId && this.instanceId) {
        this.config.instanceId = this.instanceId;
        const { saveTelemetryConfig } = await import("./config.js");
        await saveTelemetryConfig(this.config);
      }

      logger.info(`[TELEMETRY] Initialized (mode: ${this.config.mode}, host: ${host})`);
    } catch (error) {
      logger.error("[TELEMETRY] Failed to initialize:", error);
    }
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    if (!this.config) {
      return false;
    }

    // Cloud mode: enabled by default unless explicitly disabled
    if (this.config.mode === "cloud") {
      return this.config.enabled !== false;
    }

    // Self-hosted mode: disabled by default unless explicitly enabled
    return this.config.enabled === true;
  }

  /**
   * Track an event
   */
  async track(event: string, properties?: Record<string, unknown>): Promise<void> {
    if (!this.isEnabled() || !this.posthog || !this.instanceId) {
      return;
    }

    try {
      // Sanitize properties to remove PII
      const sanitizedProperties = this.sanitizeProperties({
        ...properties,
        instanceId: this.instanceId,
        version: this.getVersion(),
        mode: this.config?.mode,
      });

      this.posthog.capture({
        distinctId: this.instanceId,
        event,
        properties: sanitizedProperties,
      });
    } catch (error) {
      logger.error("[TELEMETRY] Failed to track event:", error);
    }
  }

  /**
   * Identify a user (anonymized)
   */
  async identify(userId: string, properties?: Record<string, unknown>): Promise<void> {
    if (!this.isEnabled() || !this.posthog || !this.instanceId) {
      return;
    }

    try {
      this.posthog.identify({
        distinctId: this.instanceId,
        properties: {
          ...this.sanitizeProperties(properties || {}),
          userId: this.hashUserId(userId), // Hash user ID for privacy
        },
      });
    } catch (error) {
      logger.error("[TELEMETRY] Failed to identify user:", error);
    }
  }

  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    if (this.posthog) {
      await this.posthog.shutdown();
    }
  }

  /**
   * Sanitize properties to remove PII
   */
  private sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "key",
      "auth",
      "credential",
      "email",
      "username",
      "user",
      "name",
      "address",
      "phone",
      "ip",
      "hostname",
    ];

    for (const [key, value] of Object.entries(properties)) {
      const lowerKey = key.toLowerCase();
      
      // Skip sensitive keys
      if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
        continue;
      }

      // Sanitize values
      if (typeof value === "string") {
        sanitized[key] = value.length > 500 ? value.substring(0, 500) + "..." : value;
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeProperties(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Hash user ID for privacy
   */
  private hashUserId(userId: string): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(userId).digest("hex").substring(0, 16);
  }

  /**
   * Generate a unique instance ID
   */
  private async generateInstanceId(): Promise<string> {
    const crypto = require("crypto");
    const systemInfo = [
      process.platform,
      process.arch,
      process.env.HOME || process.env.USERPROFILE || "",
    ].join("|");
    
    return crypto.createHash("sha256").update(systemInfo).digest("hex").substring(0, 16);
  }

  /**
   * Get application version
   */
  private getVersion(): string {
    try {
      const fs = require("fs");
      const path = require("path");
      const packagePath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
        return packageJson.version || "0.1.0";
      }
    } catch {
      // Ignore errors
    }
    return "0.1.0";
  }

  /**
   * Get current telemetry status
   */
  getStatus(): {
    enabled: boolean;
    mode: TelemetryMode;
    config: TelemetryConfig | null;
  } {
    return {
      enabled: this.isEnabled(),
      mode: this.config?.mode || "self-hosted",
      config: this.config,
    };
  }
}

// Singleton instance
let telemetryService: TelemetryService | null = null;

/**
 * Get telemetry service instance
 */
export function getTelemetryService(): TelemetryService {
  if (!telemetryService) {
    telemetryService = new TelemetryService();
  }
  return telemetryService;
}

/**
 * Initialize telemetry (called on app startup)
 */
export async function initializeTelemetry(): Promise<void> {
  const service = getTelemetryService();
  await service.initialize();
}

/**
 * Track a telemetry event
 */
export async function trackTelemetry(
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const service = getTelemetryService();
  await service.track(event, properties);
}

/**
 * Get telemetry status
 */
export function getTelemetryStatus(): {
  enabled: boolean;
  mode: TelemetryMode;
  config: TelemetryConfig | null;
} {
  const service = getTelemetryService();
  return service.getStatus();
}

