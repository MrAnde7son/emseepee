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
  
  // Position agent node in the center-left area
  if (agentNode) {
    positionedNodes.push({
      id: agentNode.id,
      position: { x: 100, y: 200 },
      data: { label: agentNode.label, provider: agentNode.provider, kind: "agent" },
      type: "agent",
      sourcePosition: "right",
      targetPosition: "left",
      width: 120,
      height: 140,
    });
  }

  // Position tool nodes in a radial or grid pattern to the right of the agent
  const toolCount = toolNodes.length;
  const spacing = 200; // Increased spacing for better visual separation
  const startX = 500; // Further right for better spacing
  
  // Calculate layout: if few tools, arrange vertically; if many, arrange in a grid
  if (toolCount <= 4) {
    // Vertical layout for small number of tools
    const baseOffset = toolCount > 0 ? -((toolCount - 1) * spacing) / 2 : 0;
    toolNodes.forEach((node, index) => {
      positionedNodes.push({
        id: node.id,
        position: { x: startX, y: 200 + baseOffset + index * spacing },
        data: { label: node.label, provider: node.provider, kind: "tool" },
        type: "tool",
        targetPosition: "left",
        sourcePosition: "right",
        width: 120,
        height: 140,
      });
    });
  } else {
    // Grid layout for many tools
    const cols = Math.ceil(Math.sqrt(toolCount));
    const rows = Math.ceil(toolCount / cols);
    const gridSpacing = 180;
    const startY = 200 - ((rows - 1) * gridSpacing) / 2;
    
    toolNodes.forEach((node, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      positionedNodes.push({
        id: node.id,
        position: { 
          x: startX + col * gridSpacing, 
          y: startY + row * gridSpacing 
        },
        data: { label: node.label, provider: node.provider, kind: "tool" },
        type: "tool",
        targetPosition: "left",
        sourcePosition: "right",
        width: 120,
        height: 140,
      });
    });
  }

  const positionedEdges: Edge<AgentGraphEdgeData>[] = edgesData.map((edge) => {
    const color = decisionColors[edge.decision];
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      label: edge.intentSummary,
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
