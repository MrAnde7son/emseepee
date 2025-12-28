import {
  Provider,
  Tool,
  Policy,
  GatewayEvent,
  Agent,
  HumanUser,
  AgentGraphResponse,
  IdpConnection,
  IdpType,
  InstallProviderResponse,
} from "./types";

import { AuthTokenManager } from "./auth-token-manager";

const BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8000";

type RequestOptions = {
  requireAuth?: boolean;
  parseJson?: boolean;
};

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const { requireAuth = false, parseJson = true } = options;
    const headers = new Headers(init.headers || undefined);

    if (requireAuth) {
      const token = AuthTokenManager.getValidToken();
      if (!token) {
        throw new Error("Authentication required");
      }
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      cache: "no-store",
      ...init,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        AuthTokenManager.handleInvalidToken();
      }

      const error = parseJson ? await response.json().catch(() => undefined) : undefined;
      throw new Error(error?.error || `Request failed: ${response.status}`);
    }

    if (!parseJson) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { method: "GET" }, options);
  }

  post<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      options,
    );
  }

  put<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>(
      path,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      options,
    );
  }

  delete<T>(path: string, options?: RequestOptions) {
    const resolvedOptions: RequestOptions = { ...options, parseJson: options?.parseJson ?? false };
    return this.request<T>(
      path,
      {
        method: "DELETE",
      },
      resolvedOptions,
    );
  }
}

const client = new ApiClient(BASE_URL);

export const Api = {
  getProviders: () => client.get<Provider[]>("/api/providers", { requireAuth: true }),
  getIdpConnections: () => client.get<{ connections: IdpConnection[] }>("/api/idp/connections", { requireAuth: true }),
  createOrUpdateIdpConnection: (payload: {
    type: IdpType;
    issuer: string;
    clientId: string;
    clientSecret?: string;
    metadata?: Record<string, unknown>;
  }) => client.post<{ connection: IdpConnection }>("/api/idp/connections", payload, { requireAuth: true }),
  deleteIdpConnection: (id: number) => client.delete(`/api/idp/connections/${id}`, { requireAuth: true }),
  installProvider: (providerId: string, config?: Record<string, unknown>) =>
    client.post<InstallProviderResponse>(`/api/providers/${providerId}/install`, config || {}, { requireAuth: true }),
  uninstallProvider: (providerId: string) =>
    client.post<{ success: boolean }>(`/api/providers/${providerId}/uninstall`, {}, { requireAuth: true }),
  getTools: (page?: number, limit?: number, search?: string) => {
    const params = new URLSearchParams();
    if (page) params.set("page", page.toString());
    if (limit) params.set("limit", limit.toString());
    if (search) params.set("q", search);
    const searchStr = params.toString() ? `?${params.toString()}` : "";
    return client.get<{ data: Tool[]; total: number; page: number; limit: number; totalPages: number }>(
      `/api/tools${searchStr}`,
      { requireAuth: true },
    );
  },
  getToolInputSchema: (toolId: string) =>
    client.get<{ inputSchema: Record<string, { type: string; description?: string; required?: boolean }> }>(
      `/api/tools/${toolId}`,
      { requireAuth: true },
    ),
  enableTool: (toolId: string) => client.post<{ success: boolean }>(`/api/tools/${toolId}/enable`, {}, { requireAuth: true }),
  disableTool: (toolId: string) => client.post<{ success: boolean }>(`/api/tools/${toolId}/disable`, {}, { requireAuth: true }),
  enableMcpServer: (mcpId: string) => client.post<{ success: boolean }>(`/api/mcp/${mcpId}/enable`, {}, { requireAuth: true }),
  disableMcpServer: (mcpId: string) => client.post<{ success: boolean }>(`/api/mcp/${mcpId}/disable`, {}, { requireAuth: true }),
  getMcpServerDetails: (mcpId: string) =>
    client.get<{
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
  initiateOAuth: (mcpId: string) =>
    client.get<{ authorizationUrl: string; state: string }>(`/api/oauth/authorize/${mcpId}`, { requireAuth: true }),
  getOAuthStatus: (mcpId: string) =>
    client.get<{ configured: boolean; authenticated: boolean; expiresAt?: number; hasRefreshToken: boolean }>(
      `/api/oauth/status/${mcpId}`,
      { requireAuth: true },
    ),
  revokeOAuth: (mcpId: string) => client.post<{ success: boolean }>(`/api/oauth/revoke/${mcpId}`, {}, { requireAuth: true }),
  updateMcpServerConfig: (
    mcpId: string,
    updates: Partial<{
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
    }>,
  ) =>
    client.put<{
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
    }>(`/api/mcp/${mcpId}`, updates, { requireAuth: true }),
  getPolicies: (
    includeArchived?: boolean,
    page?: number,
    limit?: number,
    filters?: { search?: string; scope?: string; effect?: string; enabled?: string; priority?: string },
  ) => {
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
    return client.get<{ data: Policy[]; total: number; page: number; limit: number; totalPages: number }>(
      `/api/policies${search}`,
      { requireAuth: true },
    );
  },
  getPolicy: (id: string) =>
    client.get<
      Policy & {
        condition?: Record<string, unknown>;
        stopOnMatch?: boolean;
        actionMessage?: string;
        webhookUrl?: string;
        webhookMethod?: "GET" | "POST" | "PUT";
      }
    >(`/api/policies/${id}`, { requireAuth: true }),
  createPolicy: (policy: Partial<Policy> & { scopeTarget?: string } | Record<string, unknown>) =>
    client.post<Policy>("/api/policies", policy, { requireAuth: true }),
  updatePolicy: (id: string, policy: Partial<Policy> & { scopeTarget?: string } | Record<string, unknown>) =>
    client.put<Policy>(`/api/policies/${id}`, policy, { requireAuth: true }),
  deletePolicy: (id: string) => client.delete(`/api/policies/${id}`, { requireAuth: true }),
  archivePolicy: (id: string) => client.post<{ success: boolean }>(`/api/policies/${id}/archive`, {}, { requireAuth: true }),
  restorePolicy: (id: string) => client.post<{ success: boolean }>(`/api/policies/${id}/restore`, {}, { requireAuth: true }),
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
    return client.get<{ data: GatewayEvent[]; total: number; page: number; limit: number; totalPages: number }>(
      `/api/events${search}`,
      { requireAuth: true },
    );
  },
  getEventFilterOptions: () =>
    client.get<{ decisions: string[]; providers: string[]; agents: string[]; tools: string[]; riskLevels: string[] }>(
      "/api/events?filterOptions=true",
      { requireAuth: true },
    ),
  register: (data: { name?: string; email: string; password: string }) =>
    client.post<{ token: string; user: { id: number; email: string; name: string | null; role: string } }>(
      "/api/auth/register",
      data,
    ),
  startSocialLogin: (provider: "google" | "github") =>
    client.get<{ authorizationUrl: string; state: string }>(`/api/auth/oauth/${provider}/start`),
  login: (data: { email: string; password: string }) =>
    client.post<{ token: string; user: { id: number; email: string; name: string | null; role: string } }>(
      "/api/auth/login",
      data,
    ),
  getMe: (token: string) =>
    client.request<{ user: { id: number; email: string; name: string | null; role: string } }>(
      "/api/auth/me",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    ),
  updateUser: (userId: number, updates: { name?: string | null; password?: string }) =>
    client.put<{ id: number; email: string; name: string | null; role: string; createdAt: string; updatedAt: string }>(
      `/api/users/${userId}`,
      updates,
      { requireAuth: true },
    ),
  getTelemetryStatus: () =>
    client.get<{
      enabled: boolean;
      mode: "self-hosted" | "cloud";
      config: { mode: string; enabled: boolean; apiKey?: string; host?: string; instanceId?: string } | null;
    }>("/api/telemetry/status"),
  getTelemetryConfig: () =>
    client.get<{ mode: "self-hosted" | "cloud"; enabled: boolean; apiKey?: string; host?: string; instanceId?: string }>(
      "/api/telemetry/config",
    ),
  updateTelemetryConfig: (config: { enabled?: boolean; mode?: "self-hosted" | "cloud"; apiKey?: string; host?: string }) =>
    client.post<{ success: boolean }>("/api/telemetry/config", config),
  getAgents: (params?: { providerId?: string; role?: string; tenantId?: string }) => {
    const urlParams = new URLSearchParams();
    if (params?.providerId) urlParams.set("providerId", params.providerId);
    if (params?.role) urlParams.set("role", params.role);
    if (params?.tenantId) urlParams.set("tenantId", params.tenantId);
    const search = urlParams.toString() ? `?${urlParams.toString()}` : "";
    return client.get<Agent[]>(`/api/agents${search}`, { requireAuth: true });
  },
  getAgent: (agentId: string) => client.get<Agent>(`/api/agents/${agentId}`, { requireAuth: true }),
  getAgentGraph: (
    agentId: string,
    options?: { decisions?: string[]; providers?: string[]; tools?: string[]; riskLevels?: string[]; limit?: number },
  ) => {
    const params = new URLSearchParams();
    if (options?.decisions?.length) params.set("decision", options.decisions.join(","));
    if (options?.providers?.length) params.set("provider", options.providers.join(","));
    if (options?.tools?.length) params.set("tool", options.tools.join(","));
    if (options?.riskLevels?.length) params.set("risk", options.riskLevels.join(","));
    if (options?.limit) params.set("limit", options.limit.toString());

    const search = params.toString() ? `?${params.toString()}` : "";

    return client.get<AgentGraphResponse>(`/api/agents/${agentId}/graph${search}`, { requireAuth: true });
  },
  createAgent: (agent: {
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
  }) => client.post<Agent>("/api/agents", agent, { requireAuth: true }),
  updateAgent: (
    agentId: string,
    updates: Partial<{
      name: string;
      description: string;
      role: string;
      env: string;
      tenantId: string;
      owner: string;
      metadata: Record<string, unknown>;
      enabled: boolean;
    }>,
  ) => client.put<Agent>(`/api/agents/${agentId}`, updates, { requireAuth: true }),
  getUsers: () => client.get<HumanUser[]>("/api/users", { requireAuth: true }),
  deleteAgent: (agentId: string) =>
    client.delete<{ success: boolean }>(`/api/agents/${agentId}`, { requireAuth: true, parseJson: true }),
};
