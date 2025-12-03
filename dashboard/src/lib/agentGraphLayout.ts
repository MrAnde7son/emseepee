import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import dagre from "dagre";

import type { AgentGraphEdge, AgentGraphNode } from "./types";

export interface AgentGraphNodeData {
  label: string;
  provider?: string;
  kind: "agent" | "target";
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentGraphEdgeData {
  event: AgentGraphEdge;
  [key: string]: unknown;
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
  // Node dimensions
  const nodeWidth = 120;
  const nodeHeight = 140;
  
  // Create a new dagre graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "LR", // Left to Right layout
    nodesep: 100, // Horizontal spacing between nodes
    ranksep: 150, // Vertical spacing between ranks
    marginx: 50,
    marginy: 50,
  });

  // Add all nodes to the dagre graph
  nodesData.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: nodeHeight,
    });
  });

  // Add all edges to the dagre graph
  edgesData.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run the layout algorithm
  dagre.layout(dagreGraph);

  // Convert dagre positions to React Flow nodes
  const positionedNodes: Node<AgentGraphNodeData>[] = nodesData.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    return {
      id: node.id,
      position: {
        x: dagreNode.x - nodeWidth / 2, // Center the node
        y: dagreNode.y - nodeHeight / 2, // Center the node
      },
      data: {
        label: node.label,
        provider: node.provider,
        kind: node.kind,
        metadata: node.metadata,
      },
      type: node.kind === "agent" ? "agent" : "target",
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      width: nodeWidth,
      height: nodeHeight,
    };
  });

  const positionedEdges: Edge<AgentGraphEdgeData>[] = edgesData.map((edge) => {
    const color = decisionColors[edge.decision];
    // Show tool name on the edge instead of intentSummary
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      label: edge.toolName, // Tool name is now shown on the edge
      labelStyle: { 
        fill: color, 
        fontWeight: 600,
        fontSize: "12px",
        background: "rgba(255, 255, 255, 0.9)",
        padding: "4px 8px",
        borderRadius: "4px",
      },
      labelBgStyle: { fill: "rgba(255, 255, 255, 0.9)", fillOpacity: 0.9 },
      animated: edge.decision === "allow",
      markerEnd: { 
        type: MarkerType.ArrowClosed, 
        color,
        width: 20,
        height: 20,
      },
      style: { 
        stroke: color, 
        strokeWidth: 2.5,
        strokeDasharray: edge.decision === "log" ? "5,5" : undefined,
      },
      data: { event: edge },
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
