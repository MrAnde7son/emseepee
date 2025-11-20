"use client";

import { useTelemetry } from "@/hooks/useTelemetry";

/**
 * Client component to initialize telemetry
 * Must be a client component since useTelemetry uses hooks
 */
export function TelemetryProvider() {
  useTelemetry();
  return null;
}

