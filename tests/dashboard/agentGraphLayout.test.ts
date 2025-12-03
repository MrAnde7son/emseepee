import { describe, expect, it } from "vitest";

import { layoutAgentGraph, decisionColors } from "@/lib/agentGraphLayout";
import type { AgentGraphEdge, AgentGraphNode } from "@/lib/types";

describe("layoutAgentGraph", () => {
  it("creates positioned nodes and colored edges for xyflow", () => {
    const nodes: AgentGraphNode[] = [
      { id: "agent:a1", label: "Agent A", kind: "agent" },
      { id: "target:alpha", label: "alpha", kind: "target", provider: "openai" },
      { id: "target:beta", label: "beta", kind: "target", provider: "openai" },
    ];

    const edges: AgentGraphEdge[] = [
      {
        id: "edge-1",
        source: "agent:a1",
        target: "target:alpha",
        eventId: "edge-1",
        timestamp: "2024-01-01T00:00:00.000Z",
        intentSummary: "alpha call",
        decision: "allow",
        provider: "openai",
        toolName: "alpha",
      },
      {
        id: "edge-2",
        source: "agent:a1",
        target: "target:beta",
        eventId: "edge-2",
        timestamp: "2024-01-02T00:00:00.000Z",
        intentSummary: "beta call",
        decision: "deny",
        provider: "openai",
        toolName: "beta",
      },
    ];

    const result = layoutAgentGraph(nodes, edges);

    const agentNode = result.nodes.find((node) => node.id === "agent:a1");
    // dagre positions nodes with margins, so agent node won't be at (0,0)
    expect(agentNode?.position.x).toBeGreaterThanOrEqual(0);
    expect(agentNode?.position.y).toBeGreaterThanOrEqual(0);

    const targetPositions = result.nodes.filter((node) => node.id.startsWith("target:"));
    // All target nodes should be positioned to the right of the agent (x > agent x)
    const agentX = agentNode?.position.x ?? 0;
    expect(targetPositions.every((node) => node.position.x > agentX)).toBe(true);

    expect(result.edges[0].style?.stroke).toBe(decisionColors.allow);
    expect(result.edges[1].style?.stroke).toBe(decisionColors.deny);
    expect(result.edges[0].data?.event.intentSummary).toBe("alpha call");
  });
});
