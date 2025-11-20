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
  getTools: (page?: number, limit?: number, search?: string) => {
    const params = new URLSearchParams();
    if (page) params.set("page", page.toString());
    if (limit) params.set("limit", limit.toString());
    if (search) params.set("q", search);
    const searchStr = params.toString() ? `?${params.toString()}` : "";
    return fetchJSON<{ data: Tool[]; total: number; page: number; limit: number; totalPages: number }>(`/api/tools${searchStr}`);
  },
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
    disabledTools?: string[];
  }>(`/api/mcp/${mcpId}`),
  updateMcpServerConfig: (mcpId: string, updates: Partial<{
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
    disabledTools?: string[];
  }>) => putJSON<{
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
    disabledTools?: string[];
  }>(`/api/mcp/${mcpId}`, updates),
  getPolicies: (includeArchived?: boolean, page?: number, limit?: number, filters?: { search?: string; scope?: string; effect?: string; enabled?: string; priority?: string }) => {
    const params = new URLSearchParams();
    if (includeArchived) params.set("includeArchived", "true");
    if (page) params.set("page", page.toString());
    if (limit) params.set("limit", limit.toString());
    if (filters?.search) params.set("q", filters.search);
    if (filters?.scope && filters.scope !== "all") params.set("scope", filters.scope);
    if (filters?.effect && filters.effect !== "all") params.set("effect", filters.effect);
    if (filters?.enabled && filters.enabled !== "all") params.set("status", filters.enabled);
    if (filters?.priority && filters.priority !== "all") params.set("priority", filters.priority);
    const search = params.toString() ? `?${params.toString()}` : "";
    return fetchJSON<{ data: Policy[]; total: number; page: number; limit: number; totalPages: number }>(`/api/policies${search}`);
  },
  getPolicy: (id: string) => fetchJSON<Policy & { condition?: Record<string, unknown> }>(`/api/policies/${id}`),
  createPolicy: (policy: Partial<Policy> & { scopeTarget?: string }) => postJSON<Policy>("/api/policies", policy),
  updatePolicy: (id: string, policy: Partial<Policy> & { scopeTarget?: string }) => putJSON<Policy>(`/api/policies/${id}`, policy),
  deletePolicy: (id: string) => deleteJSON(`/api/policies/${id}`),
  archivePolicy: (id: string) => postJSON<{ success: boolean }>(`/api/policies/${id}/archive`, {}),
  restorePolicy: (id: string) => postJSON<{ success: boolean }>(`/api/policies/${id}/restore`, {}),
  getEvents: (params?: { q?: string; page?: number; limit?: number; decision?: string[]; provider?: string; agent?: string; tool?: string; risk?: string[] }) => {
    const urlParams = new URLSearchParams();
    if (params?.q) urlParams.set("q", params.q);
    if (params?.page) urlParams.set("page", params.page.toString());
    if (params?.limit) urlParams.set("limit", params.limit.toString());
    if (params?.decision && params.decision.length > 0) urlParams.set("decision", params.decision.join(","));
    if (params?.provider) urlParams.set("provider", params.provider);
    if (params?.agent) urlParams.set("agent", params.agent);
    if (params?.tool) urlParams.set("tool", params.tool);
    if (params?.risk && params.risk.length > 0) urlParams.set("risk", params.risk.join(","));
    const search = urlParams.toString() ? `?${urlParams.toString()}` : "";
    return fetchJSON<{ data: GatewayEvent[]; total: number; page: number; limit: number; totalPages: number }>(`/api/events${search}`);
  },
  getEventFilterOptions: () => fetchJSON<{ decisions: string[]; providers: string[]; agents: string[]; tools: string[]; riskLevels: string[] }>("/api/events?filterOptions=true"),
  register: async (data: { name?: string; email: string; password: string }) => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      cache: "no-store",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ token: string; user: { id: number; email: string; name: string | null; role: string } }>;
  },
  login: async (data: { email: string; password: string }) => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      cache: "no-store",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ token: string; user: { id: number; email: string; name: string | null; role: string } }>;
  },
  getMe: async (token: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ user: { id: number; email: string; name: string | null; role: string } }>;
  },
  updateUser: async (userId: number, updates: { name?: string | null; password?: string }) => {
    const token = localStorage.getItem("auth_token");
    const res = await fetch(`${BASE_URL}/api/users/${userId}`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
      cache: "no-store",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ id: number; email: string; name: string | null; role: string; createdAt: string; updatedAt: string }>;
  },
  getTelemetryStatus: () => fetchJSON<{ enabled: boolean; mode: "self-hosted" | "cloud"; config: { mode: string; enabled: boolean; apiKey?: string; host?: string; instanceId?: string } | null }>("/api/telemetry/status"),
  getTelemetryConfig: () => fetchJSON<{ mode: "self-hosted" | "cloud"; enabled: boolean; apiKey?: string; host?: string; instanceId?: string }>("/api/telemetry/config"),
  updateTelemetryConfig: (config: { enabled?: boolean; mode?: "self-hosted" | "cloud"; apiKey?: string; host?: string }) => postJSON<{ success: boolean }>("/api/telemetry/config", config),
};

