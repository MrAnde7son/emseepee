import { getEventsWithFilters, type GatewayEvent } from "../../db/services/eventService.js";

export interface AgentGraphNode {
  id: string;
  label: string;
  kind: "agent" | "tool";
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
  decision: GatewayEvent["decision"];
  riskLevel?: GatewayEvent["riskLevel"];
  latencyMs?: number;
  provider: string;
  toolName: string;
  metadata?: Record<string, unknown>;
}

export interface AgentGraphFilters {
  decisions?: string[];
  providers?: string[];
  tools?: string[];
  riskLevels?: string[];
}

export interface AgentGraphResponse {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  totalEvents: number;
}

export class AgentGraphService {
  constructor(private readonly tenantId?: string) {}

  async buildGraph(
    agentId: string,
    options?: { filters?: AgentGraphFilters; limit?: number }
  ): Promise<AgentGraphResponse> {
    const limit = Math.min(Math.max(options?.limit ?? 200, 1), 1000);
    const events = await getEventsWithFilters(
      undefined,
      { ...options?.filters, agents: [agentId] },
      limit,
      0,
      this.tenantId
    );

    return this.buildGraphFromEvents(agentId, events);
  }

  private buildGraphFromEvents(agentId: string, events: GatewayEvent[]): AgentGraphResponse {
    const agentNodeId = `agent:${agentId}`;
    const nodes = new Map<string, AgentGraphNode>();
    nodes.set(agentNodeId, { id: agentNodeId, label: agentId, kind: "agent" });

    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const edges: AgentGraphEdge[] = sortedEvents.map((event) => {
      const toolNodeId = `tool:${event.toolName}`;
      if (!nodes.has(toolNodeId)) {
        nodes.set(toolNodeId, {
          id: toolNodeId,
          label: event.toolName,
          kind: "tool",
          provider: event.provider,
          metadata: event.metadata,
        });
      }

      return {
        id: event.id,
        source: agentNodeId,
        target: toolNodeId,
        eventId: event.id,
        timestamp: event.timestamp,
        intentSummary: event.intentSummary,
        decision: event.decision,
        riskLevel: event.riskLevel,
        latencyMs: event.latencyMs,
        provider: event.provider,
        toolName: event.toolName,
        metadata: event.metadata,
      };
    });

    return {
      nodes: Array.from(nodes.values()),
      edges,
      totalEvents: sortedEvents.length,
    };
  }
}
