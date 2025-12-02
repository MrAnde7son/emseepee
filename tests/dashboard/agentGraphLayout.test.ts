import { describe, expect, it } from "vitest";

import { layoutAgentGraph, decisionColors } from "@/lib/agentGraphLayout";
import type { AgentGraphEdge, AgentGraphNode } from "@/lib/types";

describe("layoutAgentGraph", () => {
  it("creates positioned nodes and colored edges for xyflow", () => {
    const nodes: AgentGraphNode[] = [
      { id: "agent:a1", label: "Agent A", kind: "agent" },
      { id: "tool:alpha", label: "alpha", kind: "tool", provider: "openai" },
      { id: "tool:beta", label: "beta", kind: "tool", provider: "openai" },
    ];

    const edges: AgentGraphEdge[] = [
      {
        id: "edge-1",
        source: "agent:a1",
        target: "tool:alpha",
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
        target: "tool:beta",
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
    expect(agentNode?.position).toEqual({ x: 0, y: 0 });

    const toolPositions = result.nodes.filter((node) => node.id.startsWith("tool:"));
    expect(toolPositions.every((node) => node.position.x === 360)).toBe(true);

    expect(result.edges[0].style?.stroke).toBe(decisionColors.allow);
    expect(result.edges[1].style?.stroke).toBe(decisionColors.deny);
    expect(result.edges[0].data?.event.intentSummary).toBe("alpha call");
  });
});
