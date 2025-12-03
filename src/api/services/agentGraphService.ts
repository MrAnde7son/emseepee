import { getEventsWithFilters, type GatewayEvent } from "../../db/services/eventService.js";

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

  /**
   * Extract target identifier from event metadata
   * For file operations, extracts file path; for other operations, uses resources or tool name
   */
  private extractTarget(event: GatewayEvent): { id: string; label: string } {
    const metadata = event.metadata || {};
    const args = (metadata.args as Record<string, unknown>) || {};
    const resources = (metadata.resources as string[]) || [];

    // For file operations, extract path from args
    if (event.toolName.includes("file")) {
      if (args.path && typeof args.path === "string") {
        // Extract filename from path for cleaner display
        const pathParts = args.path.split("/");
        const filename = pathParts[pathParts.length - 1] || args.path;
        return {
          id: `target:file:${args.path}`,
          label: filename,
        };
      }
    }

    // For operations with resources, use the first resource
    if (resources.length > 0) {
      const resource = resources[0];
      // Extract label from resource (e.g., "file:SECRET" -> "SECRET")
      const resourceParts = resource.split(":");
      const label = resourceParts.length > 1 ? resourceParts.slice(1).join(":") : resource;
      return {
        id: `target:${resource}`,
        label,
      };
    }

    // Fallback: use tool name as target identifier
    return {
      id: `target:${event.toolName}`,
      label: event.toolName,
    };
  }

  private buildGraphFromEvents(agentId: string, events: GatewayEvent[]): AgentGraphResponse {
    const agentNodeId = `agent:${agentId}`;
    const nodes = new Map<string, AgentGraphNode>();
    nodes.set(agentNodeId, { id: agentNodeId, label: agentId, kind: "agent" });

    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const edges: AgentGraphEdge[] = sortedEvents.map((event) => {
      // Extract target information
      const target = this.extractTarget(event);
      const targetNodeId = target.id;

      // Create target node if it doesn't exist
      if (!nodes.has(targetNodeId)) {
        nodes.set(targetNodeId, {
          id: targetNodeId,
          label: target.label,
          kind: "target",
          provider: event.provider,
          metadata: event.metadata,
        });
      }

      // Create edge representing tool call: agent -> tool (edge) -> target
      return {
        id: event.id,
        source: agentNodeId,
        target: targetNodeId,
        eventId: event.id,
        timestamp: event.timestamp,
        intentSummary: event.intentSummary,
        decision: event.decision,
        riskLevel: event.riskLevel,
        latencyMs: event.latencyMs,
        provider: event.provider,
        toolName: event.toolName, // Tool name is now on the edge
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
