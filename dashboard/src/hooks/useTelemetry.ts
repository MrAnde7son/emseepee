"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

let initialized = false;

/**
 * Initialize PostHog telemetry on the frontend
 */
export function useTelemetry() {
  useEffect(() => {
    if (initialized) return;

    fetch("/api/telemetry/status")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch telemetry status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.enabled && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
          posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
            loaded: (posthog) => {
              if (process.env.NODE_ENV === "development") {
                posthog.debug();
              }
              initialized = true;
            },
          });
        }
      })
      .catch((error) => {
        console.warn("[TELEMETRY] Failed to initialize:", error);
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
