"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  type Edge,
  type Node,
  type OnEdgeClick,
  MarkerType,
  ConnectionLineType,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Clock3,
  Network,
  RefreshCcw,
  ShieldAlert,
  Wrench,
  Cloud,
  Target,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";

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
  const decodedLabel = useMemo(() => {
    try {
      return decodeURIComponent(data.label);
    } catch {
      return data.label;
    }
  }, [data.label]);

  return (
    <div className="group relative flex flex-col items-center">
      <Handle type="source" position={Position.Right} />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-blue-500 bg-gradient-to-br from-blue-100 to-blue-200 shadow-lg transition-all hover:scale-110 hover:shadow-xl dark:from-blue-900 dark:to-blue-800 dark:border-blue-400">
        <Bot className="h-10 w-10 text-blue-600 dark:text-blue-300" />
        <Target className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-blue-500 text-white shadow-md" />
      </div>
      <div className="mt-2 text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
          Agent
        </div>
        <div className="mt-1 max-w-[120px] truncate text-sm font-bold text-gray-900 dark:text-gray-100">
          {decodedLabel}
        </div>
        {data.provider && (
          <div className="mt-1 max-w-[120px] truncate text-xs text-gray-600 dark:text-gray-400">
            {data.provider}
          </div>
        )}
      </div>
    </div>
  );
}

function TargetNode({ data }: { data: AgentGraphNodeData }) {
  const decodedLabel = useMemo(() => {
    try {
      return decodeURIComponent(data.label);
    } catch {
      return data.label;
    }
  }, [data.label]);

  // Determine if this is a file target based on metadata or label
  const isFile = decodedLabel.includes(".") || decodedLabel.startsWith("/") || data.metadata?.args;

  return (
    <div className="group relative flex flex-col items-center">
      <Handle type="target" position={Position.Left} />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-green-500 bg-gradient-to-br from-green-100 to-green-200 shadow-lg transition-all hover:scale-110 hover:shadow-xl dark:from-green-900 dark:to-green-800 dark:border-green-400">
        {isFile ? (
          <FileText className="h-10 w-10 text-green-600 dark:text-green-300" />
        ) : (
          <Target className="h-10 w-10 text-green-600 dark:text-green-300" />
        )}
      </div>
      <div className="mt-2 text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-300">
          Target
        </div>
        <div className="mt-1 max-w-[120px] truncate text-sm font-bold text-gray-900 dark:text-gray-100">
          {decodedLabel}
        </div>
        {data.provider && (
          <div className="mt-1 max-w-[120px] truncate text-xs text-gray-600 dark:text-gray-400">
            {data.provider}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
  target: TargetNode,
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

  const decodedAgentId = useMemo(() => {
    if (!agentId) return agentId;
    try {
      return decodeURIComponent(agentId);
    } catch {
      return agentId;
    }
  }, [agentId]);

  const decodedAgentName = useMemo(() => {
    const name = agent?.name || decodedAgentId;
    if (!name) return name;
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }, [agent?.name, decodedAgentId]);

  const decodedAgentDescription = useMemo(() => {
    const desc = agent?.description || agent?.id;
    if (!desc) return desc;
    try {
      return decodeURIComponent(desc);
    } catch {
      return desc;
    }
  }, [agent?.description, agent?.id]);

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

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500 text-white shadow-md">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl">{decodedAgentName}</CardTitle>
              <p className="text-sm text-muted-foreground">{decodedAgentDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-medium">
              {agent?.providerId || "Unknown provider"}
            </Badge>
            {agent?.role && (
              <Badge variant="outline" className="font-medium">
                Role: {agent.role}
              </Badge>
            )}
            {agent?.env && (
              <Badge variant="outline" className="font-medium">
                Env: {agent.env}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Decisions</span>
              <div className="flex items-center gap-2">
                {decisions.map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={decisionFilters.includes(value)}
                      onCheckedChange={() => toggleDecision(value)}
                      aria-label={`Toggle ${value} decision`}
                    />
                    <Badge
                      className="font-medium"
                      style={{
                        backgroundColor: `${decisionColors[value]}22`,
                        color: decisionColors[value],
                        borderColor: decisionColors[value],
                      }}
                    >
                      {value}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Risk</span>
              <div className="flex items-center gap-2">
                {risks.map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={riskFilters.includes(value)}
                      onCheckedChange={() => toggleRisk(value)}
                      aria-label={`Toggle ${value} risk`}
                    />
                    <Badge variant="outline" className="font-medium">
                      {value}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Limit</span>
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
              className="ml-auto font-medium"
              disabled={!limitIsValid}
              onClick={() => refetch()}
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_0.8fr]">
            <div className="relative h-[600px] overflow-hidden rounded-xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-lg dark:border-gray-800 dark:from-gray-950 dark:to-gray-900">
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
                  connectionLineType={ConnectionLineType.SmoothStep}
                  proOptions={{ hideAttribution: true }}
                  defaultEdgeOptions={{
                    type: "smoothstep",
                    animated: false,
                  }}
                  style={{ background: "transparent" }}
                >
                  <Background
                    gap={20}
                    size={1}
                    color="#e5e7eb"
                    className="dark:opacity-20"
                    patternClassName="dark:opacity-10"
                  />
                  <MiniMap
                    nodeColor={(node) =>
                      node.type === "agent" ? decisionColors.allow : decisionColors.log
                    }
                    maskColor="rgba(0, 0, 0, 0.1)"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.9)",
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <Controls
                    position="bottom-right"
                    showZoom={true}
                    showFitView={true}
                    showInteractive={false}
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.9)",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                  />
                </ReactFlow>
              )}
            </div>

            <Card className="h-[600px] shadow-lg">
              <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-blue-600 dark:text-blue-400" /> Interaction details
                </CardTitle>
              </CardHeader>
              <CardContent className="flex h-full flex-col gap-4 overflow-hidden p-6">
                {selectedEvent ? (
                  <>
                    <div className="space-y-2">
                      <div className="text-base font-bold text-gray-900 dark:text-gray-100">
                        {selectedEvent.intentSummary}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Wrench className="h-4 w-4" />
                        {selectedEvent.toolName}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className="font-semibold"
                        style={{
                          backgroundColor: `${decisionColors[selectedEvent.decision]}22`,
                          color: decisionColors[selectedEvent.decision],
                          borderColor: decisionColors[selectedEvent.decision],
                        }}
                      >
                        {selectedEvent.decision === "allow" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {selectedEvent.decision === "deny" && <XCircle className="mr-1 h-3 w-3" />}
                        {selectedEvent.decision === "log" && <AlertCircle className="mr-1 h-3 w-3" />}
                        {selectedEvent.decision}
                      </Badge>
                      {selectedEvent.riskLevel && (
                        <Badge variant="outline" className="font-medium">
                          Risk: {selectedEvent.riskLevel}
                        </Badge>
                      )}
                      {selectedEvent.latencyMs !== undefined && (
                        <Badge variant="secondary" className="font-medium">
                          Latency: {selectedEvent.latencyMs}ms
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                      <Clock3 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{formatDate(selectedEvent.timestamp)}</span>
                    </div>
                    
                    <div className="space-y-1 rounded-lg bg-muted/50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Provider
                      </div>
                      <div className="text-sm font-medium">{selectedEvent.provider}</div>
                    </div>
                    
                    {selectedEvent.metadata && (
                      <div className="flex-1 overflow-auto rounded-lg border bg-muted/30 p-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Metadata
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-xs font-mono">
                          {JSON.stringify(selectedEvent.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <Network className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Select an interaction in the graph to see details.
                    </p>
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
