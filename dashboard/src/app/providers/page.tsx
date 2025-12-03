"use client";

import { useState, useMemo, useEffect } from "react";
import { useIdpConnections, usePolicies, useProviders } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";
import { Provider, Policy, type IdpType } from "@/lib/types";
import {
  getProviderConfigSchema,
  providerRequiresConfig,
  validateProviderConfig,
  type ConfigField,
} from "@/lib/providerConfigs";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

import { RefreshCcw, Info, Clock, Trash2 } from "lucide-react";

interface PolicyCondition {
  providerId?: string | string[];
  agentId?: string | string[];
  agentRole?: string | string[];
  toolName?: string | string[];
  [key: string]: unknown;
}

export default function ProvidersPage() {
  const { data, isLoading, refetch } = useProviders();
  const {
    data: idpData,
    isLoading: isLoadingIdps,
    refetch: refetchIdps,
  } = useIdpConnections();
  const { data: policiesData } = usePolicies();
  const [providersView, setProvidersView] = useState<"agentic" | "idps">("agentic");
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [viewMode, setViewMode] = useState<"details" | "policies">("details");
  const [policyDetails, setPolicyDetails] = useState<Map<string, Policy & { condition?: PolicyCondition }>>(new Map());
  const [loadingPolicyDetails, setLoadingPolicyDetails] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showUninstallDialog, setShowUninstallDialog] = useState(false);
  const [providerToInstall, setProviderToInstall] = useState<Provider | null>(null);
  const [providerToUninstall, setProviderToUninstall] = useState<Provider | null>(null);
  const [providerConfig, setProviderConfig] = useState<Record<string, string>>({});
  const [showPasswordFields, setShowPasswordFields] = useState<Set<string>>(new Set());
  const [idpType, setIdpType] = useState<IdpType>("okta");
  const [idpIssuer, setIdpIssuer] = useState("");
  const [idpClientId, setIdpClientId] = useState("");
  const [idpClientSecret, setIdpClientSecret] = useState("");
  const [savingIdp, setSavingIdp] = useState(false);
  
  const handleInstallClick = (provider: Provider) => {
    // Check if provider needs configuration
    if (providerRequiresConfig(provider.id)) {
      setProviderToInstall(provider);
      setShowInstallDialog(true);
      // Initialize config with default values from schema
      const schema = getProviderConfigSchema(provider.id);
      const initialConfig: Record<string, string> = {};
      if (schema) {
        for (const field of schema.fields) {
          initialConfig[field.key] = field.defaultValue || "";
        }
      }
      setProviderConfig(initialConfig);
      setShowPasswordFields(new Set());
    } else {
      // For providers that don't need config (like Cursor), install directly
      handleInstall(provider.id);
    }
  };

  const handleInstall = async (providerId: string, config?: Record<string, unknown>) => {
    setInstalling(providerId);
    try {
      await Api.installProvider(providerId, config);
      await refetch();
      setShowInstallDialog(false);
      setProviderToInstall(null);
      setProviderConfig({});
    } catch (error) {
      console.error("Failed to install provider:", error);
      alert(`Failed to install provider: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleInstallSubmit = () => {
    if (!providerToInstall) return;

    // Validate configuration
    const validation = validateProviderConfig(providerToInstall.id, providerConfig);
    if (!validation.valid) {
      alert(validation.errors.join("\n"));
      return;
    }

    // Build config object, removing empty optional fields
    const schema = getProviderConfigSchema(providerToInstall.id);
    const configToSubmit: Record<string, unknown> = {};
    
    if (schema) {
      for (const field of schema.fields) {
        const value = providerConfig[field.key];
        // Include field if it has a value or is required
        if (value && value.trim() !== "") {
          configToSubmit[field.key] = value.trim();
        } else if (field.required) {
          configToSubmit[field.key] = "";
        }
      }
    } else {
      // Fallback: include all non-empty values
      Object.entries(providerConfig).forEach(([key, value]) => {
        if (value && value.trim() !== "") {
          configToSubmit[key] = value.trim();
        }
      });
    }

    handleInstall(providerToInstall.id, configToSubmit);
  };

  const togglePasswordVisibility = (fieldKey: string) => {
    setShowPasswordFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) {
        next.delete(fieldKey);
      } else {
        next.add(fieldKey);
      }
      return next;
    });
  };

  const updateConfigField = (fieldKey: string, value: string) => {
    setProviderConfig((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const handleSaveIdpConnection = async () => {
    setSavingIdp(true);
    try {
      await Api.createOrUpdateIdpConnection({
        type: idpType,
        issuer: idpIssuer,
        clientId: idpClientId,
        clientSecret: idpClientSecret,
      });
      await refetchIdps();
    } catch (error) {
      alert(`Failed to save IdP connection: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSavingIdp(false);
    }
  };

  const handleDeleteIdp = async (id: number) => {
    try {
      await Api.deleteIdpConnection(id);
      await refetchIdps();
    } catch (error) {
      alert(`Failed to delete IdP connection: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleUninstallClick = (provider: Provider) => {
    setProviderToUninstall(provider);
    setShowUninstallDialog(true);
  };

  const handleUninstall = async (providerId: string) => {
    setUninstalling(providerId);
    try {
      await Api.uninstallProvider(providerId);
      await refetch();
      setShowUninstallDialog(false);
      setProviderToUninstall(null);
    } catch (error) {
      console.error("Failed to uninstall provider:", error);
      alert(`Failed to uninstall provider: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUninstalling(null);
    }
  };

  // Fetch full policy details when viewing policies for a provider
  useEffect(() => {
    if (selectedProvider && viewMode === "policies" && policiesData?.data) {
      const providerScopedPolicies = policiesData.data.filter(
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
    if (!selectedProvider || !policiesData?.data) return [];
    
    const providerScopedPolicies = policiesData.data.filter(
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

  const connections = idpData?.connections || [];

  if (providersView === "idps") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Identity Providers</h1>
            <p className="text-xs text-muted-foreground">Configure IdP connections for your tenant.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setProvidersView("agentic")}>
              Back to Agentic
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetchIdps()}>
              <RefreshCcw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-sm">Add or Update Connection</h2>
            <div className="space-y-2">
              <label className="text-xs font-medium">Provider</label>
              <select
                className="border border-input rounded-md px-3 py-2 text-sm bg-background"
                value={idpType}
                onChange={(e) => setIdpType(e.target.value as IdpType)}
              >
                <option value="okta">Okta</option>
                <option value="entra" disabled>
                  Entra (coming soon)
                </option>
                <option value="auth0" disabled>
                  Auth0 (coming soon)
                </option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Issuer</label>
              <Input
                placeholder="https://your-org.okta.com"
                value={idpIssuer}
                onChange={(e) => setIdpIssuer(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Client ID</label>
              <Input value={idpClientId} onChange={(e) => setIdpClientId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Client Secret</label>
              <Input
                type="password"
                value={idpClientSecret}
                onChange={(e) => setIdpClientSecret(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveIdpConnection} disabled={savingIdp || !idpIssuer || !idpClientId}>
                {savingIdp ? "Saving..." : "Save Connection"}
              </Button>
            </div>
          </div>
          <div className="border border-border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-sm">Existing Connections</h2>
            {isLoadingIdps ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : connections.length === 0 ? (
              <div className="text-sm text-muted-foreground">No IdP connections yet.</div>
            ) : (
              <div className="space-y-3">
                {connections.map((conn) => (
                  <div key={conn.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{conn.type.toUpperCase()}</div>
                      <div className="text-xs text-muted-foreground break-all">{conn.issuer}</div>
                      <div className="text-xs text-muted-foreground">Client ID: {conn.clientId}</div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteIdp(conn.id)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
          <Button variant="outline" size="sm" onClick={() => setProvidersView("idps")}>
            Identity Providers
          </Button>
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
                          onClick={() => handleInstallClick(p)}
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
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-xs text-destructive hover:text-destructive"
                            onClick={() => handleUninstallClick(p)}
                            disabled={uninstalling === p.id}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            {uninstalling === p.id ? "Uninstalling..." : "Uninstall"}
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
                <div className="border border-border rounded-xl">
                  <Table className="min-w-[520px]">
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

      {/* Install Provider Configuration Dialog */}
      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Install {providerToInstall?.name || "Provider"}
            </DialogTitle>
            <DialogDescription>
              {providerToInstall
                ? getProviderConfigSchema(providerToInstall.id)?.description ||
                  "Configure this provider"
                : "Configure this provider"}
            </DialogDescription>
          </DialogHeader>
          {providerToInstall && (() => {
            const schema = getProviderConfigSchema(providerToInstall.id);
            if (!schema) {
              return (
                <div className="text-sm text-muted-foreground py-4">
                  No configuration required for this provider.
                </div>
              );
            }

            return (
              <div className="space-y-4 mt-4">
                {schema.fields.map((field: ConfigField) => {
                  const isPassword = field.type === "password";
                  const showPassword = showPasswordFields.has(field.key);
                  const inputType = isPassword && !showPassword ? "password" : "text";

                  return (
                    <div key={field.key} className="space-y-2">
                      <label
                        htmlFor={`provider-config-${field.key}`}
                        className="text-sm font-medium"
                      >
                        {field.label}
                        {field.required && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id={`provider-config-${field.key}`}
                          type={inputType}
                          value={providerConfig[field.key] || ""}
                          onChange={(e) =>
                            updateConfigField(field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                          className="flex-1"
                          required={field.required}
                        />
                        {isPassword && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => togglePasswordVisibility(field.key)}
                          >
                            {showPassword ? "Hide" : "Show"}
                          </Button>
                        )}
                      </div>
                      {field.description && (
                        <p className="text-xs text-muted-foreground">
                          {field.description}
                          {field.helpUrl && (
                            <>
                              {" "}
                              <a
                                href={field.helpUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                Learn more
                              </a>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowInstallDialog(false);
                      setProviderToInstall(null);
                      setProviderConfig({});
                    }}
                    disabled={installing === providerToInstall.id}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleInstallSubmit}
                    disabled={
                      installing === providerToInstall.id ||
                      !schema.fields
                        .filter((f) => f.required)
                        .every((f) => providerConfig[f.key]?.trim())
                    }
                  >
                    {installing === providerToInstall.id
                      ? "Installing..."
                      : "Install"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Uninstall Provider Confirmation Dialog */}
      <Dialog open={showUninstallDialog} onOpenChange={setShowUninstallDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Uninstall {providerToUninstall?.name || "Provider"}?
            </DialogTitle>
            <DialogDescription>
              This will remove the provider configuration and unregister the adapter. 
              This action cannot be undone. You will need to reinstall and reconfigure the provider to use it again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowUninstallDialog(false);
                setProviderToUninstall(null);
              }}
              disabled={uninstalling === providerToUninstall?.id}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => providerToUninstall && handleUninstall(providerToUninstall.id)}
              disabled={uninstalling === providerToUninstall?.id || !providerToUninstall}
            >
              {uninstalling === providerToUninstall?.id ? "Uninstalling..." : "Uninstall"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

