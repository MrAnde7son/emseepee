export type ProviderType = "cursor" | "n8n" | "openai" | "vertex" | "bedrock" | "copilot" | "langchain" | "custom";

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  status: "connected" | "error" | "pending";
  lastHeartbeat?: string;
  icon?: string;
  comingSoon?: boolean;
}

export interface Tool {
  id: string;
  name: string;
  source: "builtin" | "mcp" | "third-party";
  providerId?: string;
  category?: string;
  riskLevel?: "low" | "medium" | "high";
  installed: boolean;
}

export interface Policy {
  id: string;
  name: string;
  description?: string;
  scope: "tool" | "provider" | "agent" | "mcp" | "sensitivity" | "global";
  effect: "allow" | "deny" | "log" | "webhook" | "custom";
  priority: number;
  enabled: boolean;
  archived?: boolean;
  customCode?: string;
  scopeTarget?: string;
}

export interface GatewayEvent {
  id: string;
  tenantId?: string;
  timestamp: string;
  provider: string;
  agentId: string;
  toolName: string;
  intentSummary: string;
  decision: "allow" | "deny" | "log";
  riskLevel?: "low" | "medium" | "high";
  latencyMs?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

