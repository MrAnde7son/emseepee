"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { Api } from "@/lib/api";

let initialized = false;

/**
 * Initialize PostHog telemetry on the frontend
 */
export function useTelemetry() {
  useEffect(() => {
    if (initialized) return;

    Api.getTelemetryStatus()
      .then((data) => {
        console.log("[TELEMETRY] Status:", { enabled: data.enabled, config: data.config });
        
        if (!data.enabled) {
          console.log("[TELEMETRY] Telemetry is disabled");
          return;
        }

        // Get API key from backend config or environment variable
        const apiKey = data.config?.apiKey || process.env.NEXT_PUBLIC_POSTHOG_KEY;
        // Get host from backend config or environment variable, default to US region
        const apiHost = data.config?.host || process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com";

        if (!apiKey) {
          console.warn("[TELEMETRY] PostHog API key not found. Check backend config or NEXT_PUBLIC_POSTHOG_KEY env var.");
          return;
        }

        console.log("[TELEMETRY] Initializing PostHog with host:", apiHost);
        
        posthog.init(apiKey, {
          api_host: apiHost,
          loaded: (posthog) => {
            console.log("[TELEMETRY] PostHog initialized successfully");
            if (process.env.NODE_ENV === "development") {
              posthog.debug();
            }
            initialized = true;
            
            // Send a test event to verify setup
            posthog.capture("$pageview", {
              $set: { initialized: true }
            });
            console.log("[TELEMETRY] Test event sent");
          },
        });
      })
      .catch((error) => {
        console.error("[TELEMETRY] Failed to initialize:", error);
      });
  }, []);
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  
  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    console.warn("[TELEMETRY] Failed to track event:", error);
  }
}
