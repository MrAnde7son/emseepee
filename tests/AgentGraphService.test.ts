import { describe, expect, it, vi, beforeEach } from "vitest";

import { AgentGraphService } from "../src/api/services/agentGraphService.js";
import * as eventService from "../src/db/services/eventService.js";

describe("AgentGraphService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds graph nodes and edges from gateway events", async () => {
    const events: eventService.GatewayEvent[] = [
      {
        id: "event-2",
        timestamp: "2024-01-02T12:00:00.000Z",
        provider: "openai",
        agentId: "agent-123",
        toolName: "search",
        intentSummary: "Search knowledge base",
        decision: "allow",
        riskLevel: "low",
        latencyMs: 120,
        metadata: { sessionId: "abc" },
      },
      {
        id: "event-1",
        timestamp: "2024-01-01T12:00:00.000Z",
        provider: "openai",
        agentId: "agent-123",
        toolName: "email",
        intentSummary: "Send email",
        decision: "deny",
        riskLevel: "high",
        latencyMs: 80,
        metadata: { parentEventId: "root" },
      },
    ];

    const spy = vi
      .spyOn(eventService, "getEventsWithFilters")
      .mockResolvedValue(events as eventService.GatewayEvent[]);

    const service = new AgentGraphService("tenant-1");
    const graph = await service.buildGraph("agent-123", { filters: { decisions: ["allow"] }, limit: 10 });

    expect(spy).toHaveBeenCalledWith(
      undefined,
      { decisions: ["allow"], agents: ["agent-123"] },
      10,
      0,
      "tenant-1"
    );

    const agentNode = graph.nodes.find((node) => node.kind === "agent");
    expect(agentNode?.id).toBe("agent:agent-123");

    expect(graph.nodes.filter((node) => node.kind === "tool").map((n) => n.label)).toEqual([
      "email",
      "search",
    ]);

    expect(graph.edges[0].id).toBe("event-1");
    expect(graph.edges[0].metadata).toEqual({ parentEventId: "root" });
    expect(graph.totalEvents).toBe(2);
  });

  it("always returns an agent node even when there are no events", async () => {
    vi.spyOn(eventService, "getEventsWithFilters").mockResolvedValue([]);

    const service = new AgentGraphService();
    const graph = await service.buildGraph("agent-xyz", { limit: 5 });

    expect(graph.nodes).toEqual([
      { id: "agent:agent-xyz", label: "agent-xyz", kind: "agent" },
    ]);
    expect(graph.edges).toHaveLength(0);
    expect(graph.totalEvents).toBe(0);
  });

  it("clamps the requested limit to avoid runaway queries", async () => {
    const spy = vi
      .spyOn(eventService, "getEventsWithFilters")
      .mockResolvedValue([]);

    const service = new AgentGraphService();
    await service.buildGraph("agent-xyz", { limit: 5000 });

    expect(spy).toHaveBeenCalledWith(undefined, { agents: ["agent-xyz"] }, 1000, 0, undefined);
  });
});
