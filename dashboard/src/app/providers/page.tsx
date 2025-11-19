"use client";

import { useState } from "react";
import { useProviders } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

import { PlusCircle, RefreshCcw } from "lucide-react";

export default function ProvidersPage() {
  const { data, isLoading, refetch } = useProviders();
  const [installing, setInstalling] = useState<string | null>(null);
  
  const handleInstall = async (providerId: string) => {
    setInstalling(providerId);
    try {
      await Api.installProvider(providerId);
      await refetch();
    } catch (error) {
      console.error("Failed to install provider:", error);
      alert(`Failed to install provider: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Providers</h1>
          <p className="text-xs text-slate-400">
            Connect Cursor, n8n, OpenAI and other agent platforms to the gateway.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="border-slate-700 bg-slate-900/50 text-slate-200 hover:bg-slate-800 hover:text-white hover:border-slate-600"
          >
            <RefreshCcw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => { /* TODO: open connect dialog */ }}>
            <PlusCircle className="h-3 w-3 mr-1" />
            Connect provider
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-slate-400">Loading providers...</div>}

      {data && data.length === 0 && (
        <div className="text-sm text-slate-500 border border-dashed border-slate-700 rounded-lg p-4">
          No providers yet. Connect your first provider to start enforcing policies.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <div
              key={p.id}
              className="border border-slate-800 rounded-xl p-4 bg-slate-900/60 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{p.name}</div>
                <Badge
                  variant={p.status === "connected" ? "default" : "outline"}
                  className={
                    p.status === "connected" ? "bg-emerald-500/80 text-slate-950" : ""
                  }
                >
                  {p.status}
                </Badge>
              </div>
              <div className="text-xs text-slate-400">
                Type: <span className="font-mono">{p.type}</span>
              </div>
              {p.lastHeartbeat && (
                <div className="text-[11px] text-slate-500">
                  Last heartbeat: {new Date(p.lastHeartbeat).toLocaleString()}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                {p.status === "pending" ? (
                  <Button 
                    size="sm" 
                    className="text-xs"
                    onClick={() => handleInstall(p.id)}
                    disabled={installing === p.id}
                  >
                    {installing === p.id ? "Installing..." : "Install"}
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="text-xs">
                      View details
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs">
                      Policies
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

