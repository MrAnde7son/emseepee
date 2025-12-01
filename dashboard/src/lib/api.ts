import { Provider, Tool, Policy, GatewayEvent, Agent, HumanUser } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8000";

async function fetchJSON<T>(path: string, options?: { requireAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.requireAuth) {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Authentication required");
    }
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store", headers });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

async function postJSON<T>(path: string, body: unknown, requireAuth: boolean = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (requireAuth) {
    const token = localStorage.getItem("auth_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
    throw new Error(error.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function putJSON<T>(path: string, body: unknown, requireAuth: boolean = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (requireAuth) {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Authentication required");
    }
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

async function deleteJSON(path: string, requireAuth: boolean = false): Promise<void> {
  const headers: Record<string, string> = {};
  if (requireAuth) {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Authentication required");
    }
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
}

export const Api = {
  getProviders: () => fetchJSON<Provider[]>("/api/providers", { requireAuth: true }),
  installProvider: (providerId: string, config?: Record<string, unknown>) => postJSON<{ success: boolean }>(`/api/providers/${providerId}/install`, config || {}, true),
  uninstallProvider: (providerId: string) => postJSON<{ success: boolean }>(`/api/providers/${providerId}/uninstall`, {}, true),
  getTools: (page?: number, limit?: number, search?: string) => {
    const params = new URLSearchParams();
    if (page) params.set("page", page.toString());
    if (limit) params.set("limit", limit.toString());
    if (search) params.set("q", search);
    const searchStr = params.toString() ? `?${params.toString()}` : "";
    return fetchJSON<{ data: Tool[]; total: number; page: number; limit: number; totalPages: number }>(`/api/tools${searchStr}`, { requireAuth: true });
  },
  getToolInputSchema: (toolId: string) => fetchJSON<{ inputSchema: Record<string, { type: string; description?: string; required?: boolean }> }>(`/api/tools/${toolId}`, { requireAuth: true }),
  enableTool: (toolId: string) => postJSON<{ success: boolean }>(`/api/tools/${toolId}/enable`, {}, true),
  disableTool: (toolId: string) => postJSON<{ success: boolean }>(`/api/tools/${toolId}/disable`, {}, true),
  enableMcpServer: (mcpId: string) => postJSON<{ success: boolean }>(`/api/mcp/${mcpId}/enable`, {}, true),
  disableMcpServer: (mcpId: string) => postJSON<{ success: boolean }>(`/api/mcp/${mcpId}/disable`, {}, true),
  getMcpServerDetails: (mcpId: string) => fetchJSON<{
    id: string;
    name: string;
    description?: string;
    command?: string;
    args?: string[];
    serverUrl?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    cwd?: string;
    enabled?: boolean;
    icon?: string;
    oauth?: {
      provider: string;
      clientId?: string;
      clientSecret?: string;
      authorizationUrl: string;
      tokenUrl: string;
      scopes?: string[];
      clientIdHelpUrl?: string;
      clientIdHelpText?: string;
    };
    defaultPolicy: {
      allowedRoles: string[];
      sensitivity: string;
    };
    disabledTools?: string[];
  }>(`/api/mcp/${mcpId}`, { requireAuth: true }),
  initiateOAuth: (mcpId: string) => fetchJSON<{ authorizationUrl: string; state: string }>(`/api/oauth/authorize/${mcpId}`, { requireAuth: true }),
  getOAuthStatus: (mcpId: string) => fetchJSON<{ configured: boolean; authenticated: boolean; expiresAt?: number; hasRefreshToken: boolean }>(`/api/oauth/status/${mcpId}`, { requireAuth: true }),
  revokeOAuth: (mcpId: string) => postJSON<{ success: boolean }>(`/api/oauth/revoke/${mcpId}`, {}, true),
  updateMcpServerConfig: (mcpId: string, updates: Partial<{
    name: string;
    description?: string;
    command?: string;
    args?: string[];
    serverUrl?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    cwd?: string;
    enabled?: boolean;
    icon?: string;
    oauth?: {
      provider: string;
      clientId?: string;
      clientSecret?: string;
      authorizationUrl: string;
      tokenUrl: string;
      scopes?: string[];
      clientIdHelpUrl?: string;
      clientIdHelpText?: string;
    };
    defaultPolicy: {
      allowedRoles: string[];
      sensitivity: string;
    };
    disabledTools?: string[];
  }>) => putJSON<{
    id: string;
    name: string;
    description?: string;
    command?: string;
    args?: string[];
    serverUrl?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    cwd?: string;
    enabled?: boolean;
    icon?: string;
    oauth?: {
      provider: string;
      clientId?: string;
      clientSecret?: string;
      authorizationUrl: string;
      tokenUrl: string;
      scopes?: string[];
      clientIdHelpUrl?: string;
      clientIdHelpText?: string;
    };
    defaultPolicy: {
      allowedRoles: string[];
      sensitivity: string;
    };
    disabledTools?: string[];
  }>(`/api/mcp/${mcpId}`, updates, true),
  getPolicies: (archived?: boolean, page?: number, limit?: number, filters?: { search?: string; scope?: string; effect?: string; enabled?: string; priority?: string }) => {
    const params = new URLSearchParams();
    if (archived) params.set("archived", "true");
    if (page) params.set("page", page.toString());
    if (limit) params.set("limit", limit.toString());
    if (filters?.search) params.set("q", filters.search);
    if (filters?.scope && filters.scope !== "all") params.set("scope", filters.scope);
    if (filters?.effect && filters.effect !== "all") params.set("effect", filters.effect);
    if (filters?.enabled && filters.enabled !== "all") params.set("status", filters.enabled);
    if (filters?.priority && filters.priority !== "all") params.set("priority", filters.priority);
    const search = params.toString() ? `?${params.toString()}` : "";
    return fetchJSON<{ data: Policy[]; total: number; page: number; limit: number; totalPages: number }>(`/api/policies${search}`, { requireAuth: true });
  },
  getPolicy: (id: string) => fetchJSON<Policy & { condition?: Record<string, unknown>; stopOnMatch?: boolean; actionMessage?: string; webhookUrl?: string; webhookMethod?: "GET" | "POST" | "PUT" }>(`/api/policies/${id}`, { requireAuth: true }),
  createPolicy: (policy: Partial<Policy> & { scopeTarget?: string } | Record<string, unknown>) => postJSON<Policy>("/api/policies", policy, true),
  updatePolicy: (id: string, policy: Partial<Policy> & { scopeTarget?: string } | Record<string, unknown>) => putJSON<Policy>(`/api/policies/${id}`, policy, true),
  deletePolicy: (id: string) => deleteJSON(`/api/policies/${id}`, true),
  archivePolicy: (id: string) => postJSON<{ success: boolean }>(`/api/policies/${id}/archive`, {}, true),
  restorePolicy: (id: string) => postJSON<{ success: boolean }>(`/api/policies/${id}/restore`, {}, true),
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
    return fetchJSON<{ data: GatewayEvent[]; total: number; page: number; limit: number; totalPages: number }>(`/api/events${search}`, { requireAuth: true });
  },
  getEventFilterOptions: () => fetchJSON<{ decisions: string[]; providers: string[]; agents: string[]; tools: string[]; riskLevels: string[] }>("/api/events?filterOptions=true", { requireAuth: true }),
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
  getAgents: async (params?: { providerId?: string; role?: string; tenantId?: string }) => {
    const token = localStorage.getItem("auth_token");
    const urlParams = new URLSearchParams();
    if (params?.providerId) urlParams.set("providerId", params.providerId);
    if (params?.role) urlParams.set("role", params.role);
    if (params?.tenantId) urlParams.set("tenantId", params.tenantId);
    const search = urlParams.toString() ? `?${urlParams.toString()}` : "";
    const res = await fetch(`${BASE_URL}/api/agents${search}`, {
      headers: token ? { "Authorization": `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return res.json() as Promise<Agent[]>;
  },
  getAgent: async (agentId: string) => {
    const token = localStorage.getItem("auth_token");
    const res = await fetch(`${BASE_URL}/api/agents/${agentId}`, {
      headers: token ? { "Authorization": `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return res.json() as Promise<Agent>;
  },
  createAgent: async (agent: {
    providerId: string;
    name: string;
    description?: string;
    providerNativeId?: string;
    role?: string;
    env?: string;
    tenantId?: string;
    owner?: string;
    metadata?: Record<string, unknown>;
    enabled?: boolean;
  }) => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Authentication required");
    }
    const res = await fetch(`${BASE_URL}/api/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(agent),
      cache: "no-store",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<Agent>;
  },
  updateAgent: async (agentId: string, updates: Partial<{
    name: string;
    description: string;
    role: string;
    env: string;
    tenantId: string;
    owner: string;
    metadata: Record<string, unknown>;
    enabled: boolean;
  }>) => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Authentication required");
    }
    const res = await fetch(`${BASE_URL}/api/agents/${agentId}`, {
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
    return res.json() as Promise<Agent>;
  },
  getUsers: async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Authentication required");
    }

    const res = await fetch(`${BASE_URL}/api/users`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }

    return res.json() as Promise<HumanUser[]>;
  },
  deleteAgent: async (agentId: string) => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Authentication required");
    }
    const res = await fetch(`${BASE_URL}/api/agents/${agentId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ success: boolean }>;
  },
};

