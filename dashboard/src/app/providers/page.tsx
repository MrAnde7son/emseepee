"use client";

import { useState, useMemo, useEffect } from "react";
import { useProviders, usePolicies } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";
import { Provider, Policy } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { RefreshCcw, Info, Clock } from "lucide-react";

interface PolicyCondition {
  providerId?: string | string[];
  agentId?: string | string[];
  agentRole?: string | string[];
  toolName?: string | string[];
  [key: string]: unknown;
}

export default function ProvidersPage() {
  const { data, isLoading, refetch } = useProviders();
  const { data: policiesData } = usePolicies();
  const [installing, setInstalling] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [viewMode, setViewMode] = useState<"details" | "policies">("details");
  const [policyDetails, setPolicyDetails] = useState<Map<string, Policy & { condition?: PolicyCondition }>>(new Map());
  const [loadingPolicyDetails, setLoadingPolicyDetails] = useState(false);
  
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

  // Fetch full policy details when viewing policies for a provider
  useEffect(() => {
    if (selectedProvider && viewMode === "policies" && policiesData) {
      const providerScopedPolicies = policiesData.filter(
        (p: Policy) => p.scope === "provider" && p.archived !== true
      );
      
      if (providerScopedPolicies.length > 0) {
        setLoadingPolicyDetails(true);
        Promise.all(
          providerScopedPolicies.map((policy: Policy) =>
            Api.getPolicy(policy.id).catch(() => null)
          )
        )
          .then((details) => {
            const detailsMap = new Map<string, Policy & { condition?: PolicyCondition }>();
            details.forEach((detail) => {
              if (detail) {
                detailsMap.set(detail.id, detail);
              }
            });
            setPolicyDetails(detailsMap);
          })
          .finally(() => {
            setLoadingPolicyDetails(false);
          });
      } else {
        setPolicyDetails(new Map());
      }
    }
  }, [selectedProvider, viewMode, policiesData]);

  // Get policies for the selected provider
  // Filter by checking if the policy's condition targets this provider
  const providerPolicies = useMemo(() => {
    if (!selectedProvider || !policiesData) return [];
    
    const providerScopedPolicies = policiesData.filter(
      (policy: Policy) => policy.scope === "provider" && policy.archived !== true
    );
    
    // If we have policy details loaded, filter by provider ID
    if (policyDetails.size > 0) {
      return providerScopedPolicies.filter((policy: Policy) => {
        const detail = policyDetails.get(policy.id);
        if (!detail || !detail.condition) return false;
        
        // Check if condition targets this provider
        // The condition might have providerId or agentId that matches
        const condition = detail.condition;
        if (condition.providerId) {
          const providerId = Array.isArray(condition.providerId)
            ? condition.providerId[0]
            : condition.providerId;
          return providerId === selectedProvider.id;
        }
        if (condition.agentId) {
          const agentId = Array.isArray(condition.agentId)
            ? condition.agentId[0]
            : condition.agentId;
          return agentId === selectedProvider.id;
        }
        // If no specific provider/agent condition, show it (might be a general provider policy)
        return true;
      });
    }
    
    // If details not loaded yet, return all provider-scoped policies
    return providerScopedPolicies;
  }, [selectedProvider, policiesData, policyDetails]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Providers</h1>
          <p className="text-xs text-muted-foreground">
            Connect Cursor, n8n, OpenAI and other agent platforms to the gateway.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
          >
            <RefreshCcw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading providers...</div>}

      {data && data.length === 0 && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-4">
          No providers yet. Connect your first provider to start enforcing policies.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => {
            const isComingSoon = p.comingSoon === true;
            
            return (
              <div
                key={p.id}
                className={`border border-border rounded-xl p-4 bg-card flex flex-col gap-2 ${isComingSoon ? "opacity-75" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {p.icon && (
                      p.icon.startsWith("http://") || p.icon.startsWith("https://") ? (
                        <img 
                          src={p.icon} 
                          alt={`${p.name} icon`}
                          className="w-5 h-5"
                          onError={(e) => {
                            // Fallback to a default icon if the image fails to load
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="text-lg" role="img" aria-label={`${p.name} icon`}>
                          {p.icon}
                        </span>
                      )
                    )}
                    <div className="font-semibold text-sm">{p.name}</div>
                  </div>
                  {isComingSoon ? (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-500 bg-amber-500/10">
                      <Clock className="h-3 w-3 mr-1" />
                      Coming soon
                    </Badge>
                  ) : (
                    <Badge
                      variant={p.status === "connected" ? "default" : "outline"}
                    >
                      {p.status}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Type: <span className="font-mono">{p.type}</span>
                </div>
                {isComingSoon ? (
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-dashed border-border flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      This provider integration is coming soon. Stay tuned for updates!
                    </p>
                  </div>
                ) : (
                  <>
                    {p.lastHeartbeat && (
                      <div className="text-[11px] text-muted-foreground">
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
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-xs"
                            onClick={() => {
                              setSelectedProvider(p);
                              setViewMode("details");
                            }}
                          >
                            View details
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-xs"
                            onClick={() => {
                              setSelectedProvider(p);
                              setViewMode("policies");
                            }}
                          >
                            Policies
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Provider Details Dialog */}
      <Dialog open={selectedProvider !== null && viewMode === "details"} onOpenChange={(open) => !open && setSelectedProvider(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedProvider?.icon && (
                selectedProvider.icon.startsWith("http://") || selectedProvider.icon.startsWith("https://") ? (
                  <img 
                    src={selectedProvider.icon} 
                    alt={`${selectedProvider.name} icon`}
                    className="w-6 h-6"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-xl" role="img" aria-label={`${selectedProvider.name} icon`}>
                    {selectedProvider.icon}
                  </span>
                )
              )}
              {selectedProvider?.name || "Provider Details"}
            </DialogTitle>
            <DialogDescription>
              View detailed information about this provider
            </DialogDescription>
          </DialogHeader>
          {selectedProvider && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">
                  <Info className="h-4 w-4 mr-2" />
                  Overview
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Provider Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-[120px]">Name:</span>
                        <span>{selectedProvider.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-[120px]">ID:</span>
                        <code className="bg-muted px-2 py-1 rounded text-xs">{selectedProvider.id}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-[120px]">Type:</span>
                        <Badge variant="outline" className="text-xs">
                          {selectedProvider.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-[120px]">Status:</span>
                        <Badge
                          variant={selectedProvider.status === "connected" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {selectedProvider.status}
                        </Badge>
                      </div>
                      {selectedProvider.lastHeartbeat && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium min-w-[120px]">Last Heartbeat:</span>
                          <span className="text-muted-foreground">
                            {new Date(selectedProvider.lastHeartbeat).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Provider Policies Dialog */}
      <Dialog open={selectedProvider !== null && viewMode === "policies"} onOpenChange={(open) => !open && setSelectedProvider(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedProvider?.icon && (
                selectedProvider.icon.startsWith("http://") || selectedProvider.icon.startsWith("https://") ? (
                  <img 
                    src={selectedProvider.icon} 
                    alt={`${selectedProvider.name} icon`}
                    className="w-6 h-6"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-xl" role="img" aria-label={`${selectedProvider.name} icon`}>
                    {selectedProvider.icon}
                  </span>
                )
              )}
              Policies for {selectedProvider?.name}
            </DialogTitle>
            <DialogDescription>
              View and manage policies that apply to this provider
            </DialogDescription>
          </DialogHeader>
          {selectedProvider && (
            <div className="flex-1 overflow-y-auto">
              {loadingPolicyDetails ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Loading policies...
                </div>
              ) : providerPolicies.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No policies found for this provider. Policies with scope &quot;provider&quot; that target this provider will appear here.
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[250px]">Name</TableHead>
                        <TableHead className="w-[100px]">Effect</TableHead>
                        <TableHead className="w-[80px]">Priority</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providerPolicies.map((policy: Policy) => (
                        <TableRow key={policy.id}>
                          <TableCell>
                            <div>
                              <div className="text-sm font-medium text-foreground">{policy.name}</div>
                              {policy.description && (
                                <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                  {policy.description}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">{policy.effect}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-foreground">{policy.priority}</span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={policy.enabled ? "default" : "outline"}
                              className="text-xs"
                            >
                              {policy.enabled ? "enabled" : "disabled"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

