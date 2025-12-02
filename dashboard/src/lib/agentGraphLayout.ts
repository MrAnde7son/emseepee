import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { AgentGraphEdge, AgentGraphNode } from "./types";

export interface AgentGraphNodeData {
  label: string;
  provider?: string;
  kind: "agent" | "tool";
}

export interface AgentGraphEdgeData {
  event: AgentGraphEdge;
}

export const decisionColors: Record<AgentGraphEdge["decision"], string> = {
  allow: "#22c55e",
  deny: "#ef4444",
  log: "#f59e0b",
};

export function layoutAgentGraph(
  nodesData: AgentGraphNode[],
  edgesData: AgentGraphEdge[]
): { nodes: Node<AgentGraphNodeData>[]; edges: Edge<AgentGraphEdgeData>[] } {
  const agentNode = nodesData.find((node) => node.kind === "agent");
  const toolNodes = nodesData.filter((node) => node.kind === "tool");

  const positionedNodes: Node<AgentGraphNodeData>[] = [];
  if (agentNode) {
    positionedNodes.push({
      id: agentNode.id,
      position: { x: 0, y: 0 },
      data: { label: agentNode.label, provider: agentNode.provider, kind: "agent" },
      type: "agent",
      sourcePosition: "right",
    });
  }

  const baseOffset = toolNodes.length > 0 ? -((toolNodes.length - 1) * 140) / 2 : 0;
  toolNodes.forEach((node, index) => {
    positionedNodes.push({
      id: node.id,
      position: { x: 360, y: baseOffset + index * 140 },
      data: { label: node.label, provider: node.provider, kind: "tool" },
      type: "tool",
      targetPosition: "left",
    });
  });

  const positionedEdges: Edge<AgentGraphEdgeData>[] = edgesData.map((edge) => {
    const color = decisionColors[edge.decision];
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.intentSummary,
      animated: edge.decision === "allow",
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { stroke: color, strokeWidth: 2 },
      data: { event: edge },
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
