"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type OnEdgeClick,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock3, Network, RefreshCcw, ShieldAlert } from "lucide-react";

import { useAgentGraph } from "@/hooks/useAgentGraph";
import {
  layoutAgentGraph,
  decisionColors,
  type AgentGraphEdgeData,
  type AgentGraphNodeData,
} from "@/lib/agentGraphLayout";
import { Api } from "@/lib/api";
import type { Agent, AgentGraphEdge } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

function AgentNode({ data }: { data: AgentGraphNodeData }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className="text-xs uppercase text-muted-foreground">{data.kind}</div>
      <div className="text-base font-semibold">{data.label}</div>
      {data.provider && <div className="text-xs text-muted-foreground">Provider: {data.provider}</div>}
    </div>
  );
}

function ToolNode({ data }: { data: AgentGraphNodeData }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3 shadow-sm">
      <div className="text-xs uppercase text-muted-foreground">Tool</div>
      <div className="text-base font-semibold">{data.label}</div>
      {data.provider && <div className="text-xs text-muted-foreground">Provider: {data.provider}</div>}
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
};

const decisions = ["allow", "deny", "log"] as const;
const risks = ["low", "medium", "high"] as const;

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function AgentGraphPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params?.id as string | undefined;

  const [decisionFilters, setDecisionFilters] = useState<string[]>([]);
  const [riskFilters, setRiskFilters] = useState<string[]>([]);
  const [limit, setLimit] = useState(150);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const { data: agent } = useQuery<Agent>({
    queryKey: ["agent", agentId],
    queryFn: () => Api.getAgent(agentId || ""),
    enabled: Boolean(agentId),
  });

  const { data: graph, isLoading: isGraphLoading, refetch } = useAgentGraph(agentId, {
    decisions: decisionFilters,
    riskLevels: riskFilters,
    limit,
  });

  const { nodes, edges } = useMemo(() => {
    if (!graph) {
      return { nodes: [] as Node<AgentGraphNodeData>[], edges: [] as Edge<AgentGraphEdgeData>[] };
    }
    return layoutAgentGraph(graph.nodes, graph.edges);
  }, [graph]);

  const fallbackEdgeId = useMemo(
    () => (graph?.edges && graph.edges.length > 0 ? graph.edges[graph.edges.length - 1].id : null),
    [graph]
  );

  const activeEdgeId = selectedEdgeId ?? fallbackEdgeId;

  const selectedEvent: AgentGraphEdge | undefined = useMemo(
    () => graph?.edges.find((edge) => edge.id === activeEdgeId),
    [graph, activeEdgeId]
  );

  const toggleDecision = (value: string) => {
    setDecisionFilters((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleRisk = (value: string) => {
    setRiskFilters((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const handleEdgeClick: OnEdgeClick<AgentGraphEdgeData> = (_, edge) => {
    setSelectedEdgeId(edge.id);
  };

  const limitIsValid = limit > 0 && limit <= 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/agents")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Agents
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Agent activity graph</h1>
            {graph && <Badge variant="outline">{graph.totalEvents} events</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">Visualize tool calls and decisions for this agent.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{agent?.name || agentId}</CardTitle>
            <p className="text-sm text-muted-foreground">{agent?.description || agent?.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{agent?.providerId || "Unknown provider"}</Badge>
            {agent?.role && <Badge variant="outline">Role: {agent.role}</Badge>}
            {agent?.env && <Badge variant="outline">Env: {agent.env}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Decisions</span>
              <div className="flex items-center gap-2">
                {decisions.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={decisionFilters.includes(value)}
                      onCheckedChange={() => toggleDecision(value)}
                      aria-label={`Toggle ${value} decision`}
                    />
                    <Badge style={{ backgroundColor: `${decisionColors[value]}22`, color: decisionColors[value] }}>
                      {value}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <Separator orientation="vertical" className="h-6" />

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Risk</span>
              <div className="flex items-center gap-2">
                {risks.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={riskFilters.includes(value)}
                      onCheckedChange={() => toggleRisk(value)}
                      aria-label={`Toggle ${value} risk`}
                    />
                    <Badge variant="outline">{value}</Badge>
                  </label>
                ))}
              </div>
            </div>

            <Separator orientation="vertical" className="h-6" />

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Limit</span>
              <Input
                className="w-24"
                type="number"
                min={1}
                max={1000}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value || "0", 10))}
              />
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              disabled={!limitIsValid}
              onClick={() => refetch()}
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_0.8fr]">
            <div className="h-[520px] rounded-lg border bg-background p-2">
              {isGraphLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">Loading graph…</div>
              ) : nodes.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <Network className="mb-2 h-6 w-6" />
                  <p>No events yet for this agent.</p>
                  <p className="text-xs">Adjust filters or trigger a tool call to populate the graph.</p>
                </div>
              ) : (
                <ReactFlow
                  fitView
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  panOnScroll
                  zoomOnScroll
                  onEdgeClick={handleEdgeClick}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={16} />
                  <MiniMap
                    nodeColor={(node) =>
                      node.type === "agent" ? decisionColors.allow : decisionColors.log
                    }
                  />
                  <Controls position="bottom-right" />
                </ReactFlow>
              )}
            </div>

            <Card className="h-[520px]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Interaction details
                </CardTitle>
              </CardHeader>
              <CardContent className="flex h-full flex-col gap-3 overflow-hidden">
                {selectedEvent ? (
                  <>
                    <div>
                      <div className="text-sm font-semibold">{selectedEvent.intentSummary}</div>
                      <div className="text-xs text-muted-foreground">{selectedEvent.toolName}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge
                        style={{
                          backgroundColor: `${decisionColors[selectedEvent.decision]}22`,
                          color: decisionColors[selectedEvent.decision],
                        }}
                      >
                        {selectedEvent.decision}
                      </Badge>
                      {selectedEvent.riskLevel && <Badge variant="outline">Risk: {selectedEvent.riskLevel}</Badge>}
                      {selectedEvent.latencyMs !== undefined && (
                        <Badge variant="secondary">Latency: {selectedEvent.latencyMs}ms</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock3 className="h-4 w-4" /> {formatDate(selectedEvent.timestamp)}
                    </div>
                    <div className="text-sm">
                      <div className="text-xs uppercase text-muted-foreground">Provider</div>
                      <div>{selectedEvent.provider}</div>
                    </div>
                    {selectedEvent.metadata && (
                      <div className="flex-1 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
                        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(selectedEvent.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                    Select an interaction in the graph to see details.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
