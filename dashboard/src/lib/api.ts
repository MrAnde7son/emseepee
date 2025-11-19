import { Provider, Tool, Policy, GatewayEvent } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8000";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

async function deleteJSON(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
}

export const Api = {
  getProviders: () => fetchJSON<Provider[]>("/api/providers"),
  installProvider: (providerId: string) => postJSON<{ success: boolean }>(`/api/providers/${providerId}/install`, {}),
  getTools: () => fetchJSON<Tool[]>("/api/tools"),
  getPolicies: () => fetchJSON<Policy[]>("/api/policies"),
  createPolicy: (policy: Omit<Policy, "id" | "enabled">) => postJSON<Policy>("/api/policies", policy),
  updatePolicy: (id: string, policy: Partial<Policy>) => putJSON<Policy>(`/api/policies/${id}`, policy),
  deletePolicy: (id: string) => deleteJSON(`/api/policies/${id}`),
  getEvents: (params?: { q?: string }) => {
    const search = params?.q ? `?q=${encodeURIComponent(params.q)}` : "";
    return fetchJSON<GatewayEvent[]>(`/api/events${search}`);
  },
};

