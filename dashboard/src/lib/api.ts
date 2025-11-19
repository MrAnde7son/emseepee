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
  enableTool: (toolId: string) => postJSON<{ success: boolean }>(`/api/tools/${toolId}/enable`, {}),
  disableTool: (toolId: string) => postJSON<{ success: boolean }>(`/api/tools/${toolId}/disable`, {}),
  enableMcpServer: (mcpId: string) => postJSON<{ success: boolean }>(`/api/mcp/${mcpId}/enable`, {}),
  disableMcpServer: (mcpId: string) => postJSON<{ success: boolean }>(`/api/mcp/${mcpId}/disable`, {}),
  getMcpServerDetails: (mcpId: string) => fetchJSON<{
    id: string;
    name: string;
    description?: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    cwd?: string;
    enabled?: boolean;
    icon?: string;
    defaultPolicy: {
      allowedRoles: string[];
      sensitivity: string;
    };
    toolPolicyOverrides?: Record<string, {
      allowedRoles?: string[];
      sensitivity?: string;
    }>;
    disabledTools?: string[];
  }>(`/api/mcp/${mcpId}`),
  getPolicies: (includeArchived?: boolean) => {
    const search = includeArchived ? "?includeArchived=true" : "";
    return fetchJSON<Policy[]>(`/api/policies${search}`);
  },
  getPolicy: (id: string) => fetchJSON<Policy & { condition?: any }>(`/api/policies/${id}`),
  createPolicy: (policy: Partial<Policy> & { scopeTarget?: string }) => postJSON<Policy>("/api/policies", policy),
  updatePolicy: (id: string, policy: Partial<Policy> & { scopeTarget?: string }) => putJSON<Policy>(`/api/policies/${id}`, policy),
  deletePolicy: (id: string) => deleteJSON(`/api/policies/${id}`),
  archivePolicy: (id: string) => postJSON<{ success: boolean }>(`/api/policies/${id}/archive`, {}),
  restorePolicy: (id: string) => postJSON<{ success: boolean }>(`/api/policies/${id}/restore`, {}),
  getEvents: (params?: { q?: string }) => {
    const search = params?.q ? `?q=${encodeURIComponent(params.q)}` : "";
    return fetchJSON<GatewayEvent[]>(`/api/events${search}`);
  },
};

