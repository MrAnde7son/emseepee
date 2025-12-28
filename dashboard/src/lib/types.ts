export type ProviderType =
  | "cursor"
  | "n8n"
  | "openai"
  | "anthropic"
  | "vertex"
  | "bedrock"
  | "copilot"
  | "langchain"
  | "custom";

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  status: "connected" | "error" | "pending";
  lastHeartbeat?: string;
  icon?: string;
  comingSoon?: boolean;
}

export interface ClientDownloadPayload {
  providerId: string;
  filename: string;
  contents: string;
  suggestedPaths: {
    macos: string;
    windows: string;
    linux: string;
  };
  mimeType?: string;
  additionalFiles?: Array<{
    filename: string;
    contents: string;
    suggestedPaths: {
      macos: string;
      windows: string;
      linux: string;
    };
    mimeType?: string;
  }>;
}

export interface InstallProviderResponse {
  success: boolean;
  clientDownload?: ClientDownloadPayload;
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

export interface PolicyCondition {
  toolName?: string | string[];
  category?: string | string[];
  agentRole?: string | string[];
  agentId?: string | string[];
  env?: string | string[];
  sensitivity?: "low" | "medium" | "high" | Array<"low" | "medium" | "high">;
  args?: Record<string, unknown>;
  providerId?: string | string[];
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
  // Full condition data (when fetched from API)
  condition?: PolicyCondition;
  // Additional PolicyRule fields
  stopOnMatch?: boolean;
  actionMessage?: string;
  webhookUrl?: string;
  webhookMethod?: "GET" | "POST" | "PUT";
}

export interface GatewayEvent {
  id: string;
  tenantId?: string;
  timestamp: string; // ISO
  provider: string;
  agentId: string;
  toolName: string;
  intentSummary: string;
  decision: "allow" | "deny" | "log";
  riskLevel?: "low" | "medium" | "high";
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  providerId: string;
  providerNativeId?: string;
  role?: string;
  env?: string;
  tenantId?: string;
  owner?: string;
  metadata?: Record<string, unknown>;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
}

export interface HumanUser {
  id: number | string;
  email: string;
  name?: string | null;
  role: string;
  tenantId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  source?: string;
  active?: boolean;
}

export interface AgentGraphNode {
  id: string;
  label: string;
  kind: "agent" | "target";
  provider?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentGraphEdge {
  id: string;
  source: string;
  target: string;
  eventId: string;
  timestamp: string;
  intentSummary: string;
  decision: "allow" | "deny" | "log";
  riskLevel?: "low" | "medium" | "high";
  latencyMs?: number;
  provider: string;
  toolName: string;
  metadata?: Record<string, unknown>;
}

export interface AgentGraphResponse {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  totalEvents: number;
}

export type IdpType = "okta" | "entra";

export interface IdpConnection {
  id: number;
  tenantId?: string;
  type: IdpType;
  issuer: string;
  clientId: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}
