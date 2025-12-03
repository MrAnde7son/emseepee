"use client";

import { useQuery } from "@tanstack/react-query";

import { Api } from "@/lib/api";
import type { AgentGraphResponse } from "@/lib/types";

interface AgentGraphOptions {
  decisions?: string[];
  providers?: string[];
  tools?: string[];
  riskLevels?: string[];
  limit?: number;
}

export function useAgentGraph(agentId?: string, options?: AgentGraphOptions) {
  return useQuery<AgentGraphResponse>({
    queryKey: ["agent-graph", agentId, options],
    queryFn: () => {
      if (!agentId) {
        throw new Error("Agent ID is required to fetch graph data");
      }
      return Api.getAgentGraph(agentId, options);
    },
    enabled: Boolean(agentId),
  });
}
