import { Provider, Tool, Policy, GatewayEvent } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8000";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export const Api = {
  getProviders: () => fetchJSON<Provider[]>("/api/providers"),
  getTools: () => fetchJSON<Tool[]>("/api/tools"),
  getPolicies: () => fetchJSON<Policy[]>("/api/policies"),
  getEvents: (params?: { q?: string }) => {
    const search = params?.q ? `?q=${encodeURIComponent(params.q)}` : "";
    return fetchJSON<GatewayEvent[]>(`/api/events${search}`);
  },
};

