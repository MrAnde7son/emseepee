"use client";

import { usePolicies } from "@/hooks/useGatewayData";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

export default function PoliciesPage() {
  const { data, isLoading } = usePolicies();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Policies</h1>
          <p className="text-xs text-slate-400">
            View and manage policies that control which agents can call which tools.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            // TODO: open "Create policy" dialog
          }}
        >
          New policy
        </Button>
      </div>

      {isLoading && <div className="text-sm text-slate-400">Loading policies...</div>}

      {data && (
        <div className="border border-slate-800 rounded-xl divide-y divide-slate-800 text-xs">
          <div className="grid grid-cols-[1.5fr,1fr,1fr,auto,auto] gap-2 px-3 py-2 text-slate-500">
            <div>Name</div>
            <div>Scope</div>
            <div>Effect</div>
            <div>Priority</div>
            <div>Status</div>
          </div>
          {data.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1.5fr,1fr,1fr,auto,auto] gap-2 px-3 py-2 items-center bg-slate-900/40"
            >
              <div>
                <div className="text-slate-100 text-sm">{p.name}</div>
                {p.description && (
                  <div className="text-[11px] text-slate-500 line-clamp-1">
                    {p.description}
                  </div>
                )}
              </div>
              <div className="font-mono text-[11px] text-slate-400">{p.scope}</div>
              <div className="font-mono text-[11px] text-slate-400">{p.effect}</div>
              <div className="text-[11px] text-slate-300">{p.priority}</div>
              <div>
                <Badge
                  variant={p.enabled ? "default" : "outline"}
                  className={
                    p.enabled ? "bg-emerald-500/80 text-slate-950" : "text-slate-400"
                  }
                >
                  {p.enabled ? "enabled" : "disabled"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

