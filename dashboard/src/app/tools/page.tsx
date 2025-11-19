"use client";

import { useTools } from "@/hooks/useGatewayData";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

export default function ToolsPage() {
  const { data, isLoading } = useTools();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Tools library</h1>
          <p className="text-xs text-slate-400">
            Built-in and 3rd party tools discovered across providers. Install and govern
            them centrally.
          </p>
        </div>
        <Button size="sm" onClick={() => { /* TODO: open marketplace / add MCP */ }}>
          Install from library
        </Button>
      </div>

      {isLoading && <div className="text-sm text-slate-400">Loading tools...</div>}

      {data && (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-[1.5fr,1fr,1fr,1fr,auto] gap-2 px-2 text-slate-500">
            <div>Name</div>
            <div>Source</div>
            <div>Provider</div>
            <div>Risk</div>
            <div>Status</div>
          </div>
          <div className="border border-slate-800 rounded-xl divide-y divide-slate-800">
            {data.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[1.5fr,1fr,1fr,1fr,auto] gap-2 px-3 py-2 items-center bg-slate-900/40"
              >
                <div className="text-sm text-slate-100">{t.name}</div>
                <div className="font-mono text-[11px] text-slate-400">{t.source}</div>
                <div className="text-[11px] text-slate-400">
                  {t.providerId || <span className="text-slate-600">-</span>}
                </div>
                <div>
                  {t.riskLevel && (
                    <Badge
                      variant="outline"
                      className={
                        t.riskLevel === "high"
                          ? "border-red-500/60 text-red-400"
                          : t.riskLevel === "medium"
                          ? "border-amber-400/60 text-amber-300"
                          : "border-emerald-500/50 text-emerald-300"
                      }
                    >
                      {t.riskLevel}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  {t.installed ? (
                    <Button size="sm" variant="outline" className="text-xs">
                      Uninstall
                    </Button>
                  ) : (
                    <Button size="sm" className="text-xs">Install</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

