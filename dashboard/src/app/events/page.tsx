"use client";

import { useState } from "react";

import { useEvents } from "@/hooks/useGatewayData";

import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { ShieldAlert, Filter } from "lucide-react";

export default function EventsPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useEvents(search);

  const onSearchChange = (value: string) => {
    setSearch(value);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-xs text-muted-foreground">
            Explore all gateway activity. Search and inspect decisions per tool call.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search agent, tool, provider, intent…"
            className="h-8 w-56 text-xs"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => refetch()}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading events…</div>}

      {data && data.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          No events yet. Once agents start calling tools through the gateway, they'll
          appear here.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden text-xs">
          <div className="grid grid-cols-[1.8fr,1fr,1fr,1.4fr,0.8fr,0.6fr] gap-2 px-3 py-2 bg-muted text-muted-foreground">
            <div>Timestamp</div>
            <div>Agent</div>
            <div>Provider</div>
            <div>Tool / intent</div>
            <div>Decision</div>
            <div>Latency</div>
          </div>
          <div className="divide-y divide-border">
            {data.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[1.8fr,1fr,1fr,1.4fr,0.8fr,0.6fr] gap-2 px-3 py-2 bg-card/50"
              >
                <div className="text-[11px] text-foreground">
                  {new Date(e.timestamp).toLocaleString()}
                </div>
                <div className="text-[11px] font-mono text-foreground">
                  {e.agentId}
                </div>
                <div className="text-[11px] text-muted-foreground">{e.provider}</div>
                <div className="text-[11px] text-foreground">
                  <span className="font-mono text-[11px]">{e.toolName}</span>
                  {e.intentSummary && (
                    <span className="text-muted-foreground"> – {e.intentSummary}</span>
                  )}
                </div>
                <div>
                  <Badge
                    variant={
                      e.decision === "deny"
                        ? "destructive"
                        : e.decision === "log"
                        ? "outline"
                        : "default"
                    }
                  >
                    {e.decision}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {e.latencyMs != null ? `${e.latencyMs} ms` : "-"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

