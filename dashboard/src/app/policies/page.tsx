"use client";

import { useState, useMemo, useEffect, useRef, startTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { usePolicies, useTools, useProviders } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";
import { Policy, Tool, Provider } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Common agent roles - can be extracted from policies or config
const COMMON_AGENT_ROLES = ["coder_bot", "research_bot", "admin"];

export default function PoliciesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Initialize from URL params
  const initialSearch = searchParams.get("q") || "";
  const initialScope = searchParams.get("scope") || "all";
  const initialEffect = searchParams.get("effect") || "all";
  const initialStatus = searchParams.get("status") || "all";
  const initialArchived = searchParams.get("archived") === "true";

  const [showArchived, setShowArchived] = useState(initialArchived);
  const { data, isLoading, refetch } = usePolicies(showArchived);
  const { data: toolsData } = useTools();
  const { data: providersData } = useProviders();
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [editingPolicyData, setEditingPolicyData] = useState<Policy | null>(null);
  const [scopeTarget, setScopeTarget] = useState<string>("");
  const [customCode, setCustomCode] = useState<string>("");
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [newPolicyData, setNewPolicyData] = useState<Partial<Policy>>({
    name: "",
    description: "",
    scope: "global",
    effect: "allow",
    priority: 0,
    enabled: true,
  });
  const [newPolicyScopeTarget, setNewPolicyScopeTarget] = useState<string>("");
  const [newPolicyCustomCode, setNewPolicyCustomCode] = useState<string>("");
  
  const isUpdatingFromUrl = useRef(false);
  const prevSearchParamsRef = useRef<string>("");
  
  // Extract unique agent roles from existing policies
  const availableAgentRoles = useMemo(() => {
    const roles = new Set<string>(COMMON_AGENT_ROLES);
    if (data) {
      // We'd need to parse conditions from backend, but for now use common roles
      // In a real implementation, we'd extract from policy conditions
    }
    return Array.from(roles).sort();
  }, [data]);
  
  // Get MCP servers from tools
  const mcpServers = useMemo(() => {
    if (!toolsData) return [];
    const servers = new Set<string>();
    toolsData.forEach((tool: Tool) => {
      if (tool.source === "mcp" && tool.providerId) {
        servers.add(tool.providerId);
      }
    });
    return Array.from(servers).sort();
  }, [toolsData]);
  const [deletingPolicy, setDeletingPolicy] = useState<string | null>(null);
  const [archivingPolicy, setArchivingPolicy] = useState<string | null>(null);
  const [restoringPolicy, setRestoringPolicy] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [filterScope, setFilterScope] = useState<string>(initialScope);
  const [filterEffect, setFilterEffect] = useState<string>(initialEffect);
  const [filterEnabled, setFilterEnabled] = useState<string>(initialStatus);
  
  // Sync state from URL params when they change externally (e.g., browser back/forward)
  useEffect(() => {
    const currentParamsString = searchParams.toString();
    
    // Only update if searchParams actually changed
    if (currentParamsString === prevSearchParamsRef.current) {
      return;
    }
    
    prevSearchParamsRef.current = currentParamsString;

    const urlSearch = searchParams.get("q") || "";
    const urlScope = searchParams.get("scope") || "all";
    const urlEffect = searchParams.get("effect") || "all";
    const urlStatus = searchParams.get("status") || "all";
    const urlArchived = searchParams.get("archived") === "true";

    // Check if URL params differ from current state
    const searchChanged = urlSearch !== searchQuery;
    const scopeChanged = urlScope !== filterScope;
    const effectChanged = urlEffect !== filterEffect;
    const statusChanged = urlStatus !== filterEnabled;
    const archivedChanged = urlArchived !== showArchived;

    if (searchChanged || scopeChanged || effectChanged || statusChanged || archivedChanged) {
      isUpdatingFromUrl.current = true;
      
      startTransition(() => {
        if (searchChanged) {
          setSearchQuery(urlSearch);
        }
        if (scopeChanged) {
          setFilterScope(urlScope);
        }
        if (effectChanged) {
          setFilterEffect(urlEffect);
        }
        if (statusChanged) {
          setFilterEnabled(urlStatus);
        }
        if (archivedChanged) {
          setShowArchived(urlArchived);
        }
      });
      
      // Reset flag after state updates
      setTimeout(() => {
        isUpdatingFromUrl.current = false;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // Only depend on searchParams

  // Update URL when filters change (but not when updating from URL)
  useEffect(() => {
    if (isUpdatingFromUrl.current) {
      return;
    }

    const params = new URLSearchParams();
    
    if (searchQuery) {
      params.set("q", searchQuery);
    }
    
    if (filterScope !== "all") {
      params.set("scope", filterScope);
    }
    
    if (filterEffect !== "all") {
      params.set("effect", filterEffect);
    }
    
    if (filterEnabled !== "all") {
      params.set("status", filterEnabled);
    }
    
    if (showArchived) {
      params.set("archived", "true");
    }
    
    const currentParams = new URLSearchParams(window.location.search);
    const newParamsString = params.toString();
    const currentParamsString = currentParams.toString();
    
    // Only update URL if it's different to avoid unnecessary updates
    if (newParamsString !== currentParamsString) {
      const newUrl = newParamsString ? `?${newParamsString}` : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchQuery, filterScope, filterEffect, filterEnabled, showArchived, router]);
  
  // Filter policies based on search and filters
  const filteredPolicies = useMemo(() => {
    if (!data) return [];

    return data.filter((policy: Policy) => {
      // If showing archived, only show archived policies; otherwise, only show non-archived
      if (showArchived && !policy.archived) return false;
      if (!showArchived && policy.archived) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          policy.name.toLowerCase().includes(query) ||
          policy.description?.toLowerCase().includes(query) ||
          policy.scope.toLowerCase().includes(query) ||
          policy.effect.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Scope filter
      if (filterScope !== "all" && policy.scope !== filterScope) {
        return false;
      }

      // Effect filter
      if (filterEffect !== "all" && policy.effect !== filterEffect) {
        return false;
      }

      // Enabled filter
      if (filterEnabled !== "all") {
        const isEnabled = filterEnabled === "enabled";
        if (policy.enabled !== isEnabled) return false;
      }

      return true;
    });
  }, [data, searchQuery, filterScope, filterEffect, filterEnabled, showArchived]);
  
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this policy? This cannot be undone.")) return;
    setDeletingPolicy(id);
    try {
      await Api.deletePolicy(id);
      await refetch();
    } catch (error) {
      console.error("Failed to delete policy:", error);
      alert(`Failed to delete policy: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeletingPolicy(null);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Are you sure you want to archive this policy? You can restore it later.")) return;
    setArchivingPolicy(id);
    try {
      await Api.archivePolicy(id);
      await refetch();
    } catch (error) {
      console.error("Failed to archive policy:", error);
      alert(`Failed to archive policy: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setArchivingPolicy(null);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringPolicy(id);
    try {
      await Api.restorePolicy(id);
      await refetch();
      // Switch back to active policies view after restoring
      setShowArchived(false);
    } catch (error) {
      console.error("Failed to restore policy:", error);
      alert(`Failed to restore policy: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setRestoringPolicy(null);
    }
  };

  const handleEditClick = async (id: string) => {
    const policy = data?.find((p: Policy) => p.id === id);
    if (policy) {
      setEditingPolicyData({ ...policy });
      setEditingPolicy(id);
      
      // Set scopeTarget from policy (backend now includes this)
      setScopeTarget(policy.scopeTarget || "");
      
      // Extract custom code if effect is custom
      if (policy.effect === "custom") {
        setCustomCode(policy.customCode || "");
      } else {
        setCustomCode("");
      }
      
      // Fallback: If scopeTarget is not available, fetch full policy details
      if (!policy.scopeTarget && policy.scope !== "global") {
        try {
          const fullPolicy = await Api.getPolicy(id);
          if (fullPolicy.condition) {
            // Extract scope target from condition
            if (fullPolicy.condition.toolName) {
              const toolName = Array.isArray(fullPolicy.condition.toolName) 
                ? fullPolicy.condition.toolName[0] 
                : fullPolicy.condition.toolName;
              setScopeTarget(toolName);
            } else if (fullPolicy.condition.agentRole) {
              const agentRole = Array.isArray(fullPolicy.condition.agentRole)
                ? fullPolicy.condition.agentRole[0]
                : fullPolicy.condition.agentRole;
              setScopeTarget(agentRole);
            } else if (fullPolicy.condition.providerId) {
              const providerId = Array.isArray(fullPolicy.condition.providerId)
                ? fullPolicy.condition.providerId[0]
                : fullPolicy.condition.providerId;
              setScopeTarget(providerId);
            }
          }
          // Update custom code from full policy if needed
          if (fullPolicy.effect === "custom" && fullPolicy.customCode) {
            setCustomCode(fullPolicy.customCode);
          }
        } catch (error) {
          console.error("Failed to fetch policy details:", error);
        }
      }
    }
  };

  const handleUpdatePolicy = async () => {
    if (!editingPolicy || !editingPolicyData) return;
    
    // Build update payload with scope target
    const updatePayload: Partial<Policy> & { scopeTarget?: string } = {
      name: editingPolicyData.name,
      description: editingPolicyData.description,
      priority: editingPolicyData.priority,
      effect: editingPolicyData.effect,
      scope: editingPolicyData.scope,
      enabled: editingPolicyData.enabled,
    };
    
    // Add scope target if scope is not global
    if (editingPolicyData.scope !== "global" && scopeTarget) {
      updatePayload.scopeTarget = scopeTarget;
    }
    
    // Add custom code if effect is custom
    if (editingPolicyData.effect === "custom") {
      updatePayload.customCode = customCode;
    }
    
    setUpdatingPolicy(true);
    try {
      await Api.updatePolicy(editingPolicy, updatePayload);
      await refetch();
      setEditingPolicy(null);
      setEditingPolicyData(null);
      setScopeTarget("");
      setCustomCode("");
    } catch (error) {
      console.error("Failed to update policy:", error);
      alert(`Failed to update policy: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUpdatingPolicy(false);
    }
  };

  const handleCreatePolicy = async () => {
    if (!newPolicyData.name) {
      alert("Policy name is required");
      return;
    }
    
    // Validate scope target if scope is not global
    if (newPolicyData.scope !== "global" && !newPolicyScopeTarget) {
      const scopeLabel = newPolicyData.scope === "tool" ? "tool" 
        : newPolicyData.scope === "agent" ? "agent role"
        : newPolicyData.scope === "provider" ? "provider/agent"
        : newPolicyData.scope === "mcp" ? "MCP server"
        : newPolicyData.scope;
      alert(`Please select a ${scopeLabel} for this policy`);
      return;
    }
    
    // Build create payload with scope target
    const createPayload: Partial<Policy> & { scopeTarget?: string } = {
      name: newPolicyData.name,
      description: newPolicyData.description,
      priority: newPolicyData.priority ?? 0,
      effect: newPolicyData.effect ?? "allow",
      scope: newPolicyData.scope ?? "global",
      enabled: newPolicyData.enabled ?? true,
    };
    
    // Add scope target if scope is not global
    if (newPolicyData.scope !== "global" && newPolicyScopeTarget) {
      createPayload.scopeTarget = newPolicyScopeTarget;
    }
    
    // Add custom code if effect is custom
    if (newPolicyData.effect === "custom") {
      if (!newPolicyCustomCode) {
        alert("Custom code is required when effect is 'custom'");
        return;
      }
      createPayload.customCode = newPolicyCustomCode;
    }
    
    setCreatingPolicy(true);
    try {
      await Api.createPolicy(createPayload);
      await refetch();
      setShowCreateDialog(false);
      // Reset form
      setNewPolicyData({
        name: "",
        description: "",
        scope: "global",
        effect: "allow",
        priority: 0,
        enabled: true,
      });
      setNewPolicyScopeTarget("");
      setNewPolicyCustomCode("");
    } catch (error) {
      console.error("Failed to create policy:", error);
      alert(`Failed to create policy: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setCreatingPolicy(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterScope("all");
    setFilterEffect("all");
    setFilterEnabled("all");
  };

  const hasActiveFilters = searchQuery || filterScope !== "all" || filterEffect !== "all" || filterEnabled !== "all";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{showArchived ? "Archived Policies" : "Policies"}</h1>
          <p className="text-xs text-muted-foreground">
            {showArchived 
              ? "View and restore archived policies."
              : "View and manage policies that control which agents can call which tools."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showArchived ? "outline" : "ghost"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "Show Active" : "Show Archived"}
          </Button>
          {!showArchived && (
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
            >
              New policy
            </Button>
          )}
        </div>
      </div>

      {/* Search/Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search policies by name, description, scope, or effect..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
        <Select value={filterScope} onValueChange={setFilterScope}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All scopes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="tool">Tool</SelectItem>
            <SelectItem value="provider">Provider</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="global">Global</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEffect} onValueChange={setFilterEffect}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All effects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All effects</SelectItem>
            <SelectItem value="allow">Allow</SelectItem>
            <SelectItem value="deny">Deny</SelectItem>
            <SelectItem value="log">Log</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEnabled} onValueChange={setFilterEnabled}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs"
          >
            Clear filters
          </Button>
        )}
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading policies...</div>}

      {!isLoading && filteredPolicies.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          {hasActiveFilters
            ? "No policies found matching your filters."
            : "No policies available."}
        </div>
      )}

      {filteredPolicies.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Name</TableHead>
                <TableHead className="w-[100px]">Scope</TableHead>
                <TableHead className="w-[100px]">Effect</TableHead>
                <TableHead className="w-[80px]">Priority</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[200px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPolicies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div>
                      <div className="text-sm font-medium text-foreground">{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {p.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{p.scope}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{p.effect}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-foreground">{p.priority}</span>
                  </TableCell>
                  <TableCell>
                    {p.archived ? (
                      <Badge variant="outline" className="text-xs">
                        archived
                      </Badge>
                    ) : (
                      <Badge
                        variant={p.enabled ? "default" : "outline"}
                        className="text-xs"
                      >
                        {p.enabled ? "enabled" : "disabled"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {!p.archived && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => handleEditClick(p.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 text-amber-400 hover:text-amber-300"
                            onClick={() => handleArchive(p.id)}
                            disabled={archivingPolicy === p.id}
                          >
                            {archivingPolicy === p.id ? "..." : "Archive"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(p.id)}
                            disabled={deletingPolicy === p.id}
                          >
                            {deletingPolicy === p.id ? "..." : "Delete"}
                          </Button>
                        </>
                      )}
                      {p.archived && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 text-emerald-400 hover:text-emerald-300"
                          onClick={() => handleRestore(p.id)}
                          disabled={restoringPolicy === p.id}
                        >
                          {restoringPolicy === p.id ? "..." : "Restore"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          // Reset form when closing
          setNewPolicyData({
            name: "",
            description: "",
            scope: "global",
            effect: "allow",
            priority: 0,
            enabled: true,
          });
          setNewPolicyScopeTarget("");
          setNewPolicyCustomCode("");
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Policy</DialogTitle>
            <DialogDescription>
              Create a new policy rule. Scope determines what the policy applies to: Tool (specific tools), Agent (specific agent roles), Provider (specific providers like Cursor, Gemini), MCP Server (specific MCP servers like GitHub), or Global (all operations). Note: Advanced condition editing requires direct config.json editing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="create-name" className="text-sm font-medium">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="create-name"
                value={newPolicyData.name}
                onChange={(e) => setNewPolicyData({ ...newPolicyData, name: e.target.value })}
                placeholder="Policy name"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="create-description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="create-description"
                value={newPolicyData.description || ""}
                onChange={(e) => setNewPolicyData({ ...newPolicyData, description: e.target.value })}
                placeholder="Policy description (optional)"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label htmlFor="create-priority" className="text-sm font-medium">
                  Priority
                </label>
                <Input
                  id="create-priority"
                  type="number"
                  value={newPolicyData.priority ?? 0}
                  onChange={(e) => setNewPolicyData({ ...newPolicyData, priority: parseInt(e.target.value, 10) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="create-scope" className="text-sm font-medium">
                  Scope
                </label>
                <Select
                  value={newPolicyData.scope}
                  onValueChange={(value) => {
                    setNewPolicyData({ ...newPolicyData, scope: value as Policy["scope"] });
                    // Clear scope target when scope changes
                    setNewPolicyScopeTarget("");
                  }}
                >
                  <SelectTrigger id="create-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="tool">Tool</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="provider">Provider</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="create-effect" className="text-sm font-medium">
                  Effect
                </label>
                <Select
                  value={newPolicyData.effect}
                  onValueChange={(value) => setNewPolicyData({ ...newPolicyData, effect: value as Policy["effect"] })}
                >
                  <SelectTrigger id="create-effect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="deny">Deny</SelectItem>
                    <SelectItem value="log">Log</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newPolicyData.effect === "custom" && (
              <div className="space-y-2">
                <label htmlFor="create-custom-code" className="text-sm font-medium">
                  Custom Code <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="create-custom-code"
                  value={newPolicyCustomCode}
                  onChange={(e) => setNewPolicyCustomCode(e.target.value)}
                  placeholder="Enter JavaScript code for custom policy logic..."
                  className="w-full min-h-[200px] px-3 py-2 text-sm border border-input bg-background rounded-md font-mono resize-y"
                  style={{ fontFamily: 'monospace' }}
                />
                <p className="text-xs text-muted-foreground">
                  Available variables: tool, agentId, agentRole, env, args, log(message, data?), result
                </p>
              </div>
            )}
            {newPolicyData.scope !== "global" && (
              <div className="space-y-2">
                <label htmlFor="create-scope-target" className="text-sm font-medium">
                  {newPolicyData.scope === "tool" && "Select Tool"}
                  {newPolicyData.scope === "agent" && "Select Agent Role"}
                  {newPolicyData.scope === "provider" && "Select Provider"}
                  {newPolicyData.scope === "mcp" && "Select MCP Server"}
                  <span className="text-red-500">*</span>
                </label>
                {newPolicyData.scope === "tool" && (
                  <Select
                    value={newPolicyScopeTarget}
                    onValueChange={setNewPolicyScopeTarget}
                  >
                    <SelectTrigger id="create-scope-target">
                      <SelectValue placeholder="Select a tool" />
                    </SelectTrigger>
                    <SelectContent>
                      {toolsData?.map((tool: Tool) => (
                        <SelectItem key={tool.id} value={tool.name}>
                          {tool.name}
                          {tool.category && ` (${tool.category})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {newPolicyData.scope === "agent" && (
                  <Select
                    value={newPolicyScopeTarget}
                    onValueChange={setNewPolicyScopeTarget}
                  >
                    <SelectTrigger id="create-scope-target">
                      <SelectValue placeholder="Select an agent role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAgentRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {newPolicyData.scope === "provider" && (
                  <Select
                    value={newPolicyScopeTarget}
                    onValueChange={setNewPolicyScopeTarget}
                  >
                    <SelectTrigger id="create-scope-target">
                      <SelectValue placeholder="Select a provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providersData?.map((provider: Provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {newPolicyData.scope === "mcp" && (
                  <Select
                    value={newPolicyScopeTarget}
                    onValueChange={setNewPolicyScopeTarget}
                  >
                    <SelectTrigger id="create-scope-target">
                      <SelectValue placeholder="Select an MCP server" />
                    </SelectTrigger>
                    <SelectContent>
                      {mcpServers.map((server) => (
                        <SelectItem key={server} value={server}>
                          {server}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create-enabled"
                  checked={newPolicyData.enabled ?? true}
                  onCheckedChange={(checked) => setNewPolicyData({ ...newPolicyData, enabled: checked === true })}
                />
                <label htmlFor="create-enabled" className="text-sm cursor-pointer">
                  Enabled
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setNewPolicyData({
                  name: "",
                  description: "",
                  scope: "global",
                  effect: "allow",
                  priority: 0,
                  enabled: true,
                });
                setNewPolicyScopeTarget("");
                setNewPolicyCustomCode("");
              }}
              disabled={creatingPolicy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePolicy}
              disabled={creatingPolicy || !newPolicyData.name || (newPolicyData.scope !== "global" && !newPolicyScopeTarget) || (newPolicyData.effect === "custom" && !newPolicyCustomCode)}
            >
              {creatingPolicy ? "Creating..." : "Create Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {editingPolicy && editingPolicyData && (
        <Dialog open={!!editingPolicy} onOpenChange={(open) => {
          if (!open) {
            setEditingPolicy(null);
            setEditingPolicyData(null);
            setScopeTarget("");
            setCustomCode("");
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Policy</DialogTitle>
              <DialogDescription>
                Update the policy settings. Scope determines what the policy applies to: Tool (specific tools), Agent (specific agent roles), Provider (specific providers like Cursor, Gemini), MCP Server (specific MCP servers like GitHub), or Global (all operations). Note: Advanced condition editing requires direct config.json editing.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="edit-name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="edit-name"
                  value={editingPolicyData.name}
                  onChange={(e) => setEditingPolicyData({ ...editingPolicyData, name: e.target.value })}
                  placeholder="Policy name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-description" className="text-sm font-medium">
                  Description
                </label>
                <Input
                  id="edit-description"
                  value={editingPolicyData.description || ""}
                  onChange={(e) => setEditingPolicyData({ ...editingPolicyData, description: e.target.value })}
                  placeholder="Policy description (optional)"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label htmlFor="edit-priority" className="text-sm font-medium">
                    Priority
                  </label>
                  <Input
                    id="edit-priority"
                    type="number"
                    value={editingPolicyData.priority}
                    onChange={(e) => setEditingPolicyData({ ...editingPolicyData, priority: parseInt(e.target.value, 10) || 0 })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-scope" className="text-sm font-medium">
                    Scope
                  </label>
                  <Select
                    value={editingPolicyData.scope}
                    onValueChange={(value) => {
                      setEditingPolicyData({ ...editingPolicyData, scope: value as Policy["scope"] });
                      // Clear scope target when scope changes
                      setScopeTarget("");
                    }}
                  >
                    <SelectTrigger id="edit-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global</SelectItem>
                      <SelectItem value="tool">Tool</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="provider">Provider</SelectItem>
                      <SelectItem value="mcp">MCP Server</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-effect" className="text-sm font-medium">
                    Effect
                  </label>
                  <Select
                    value={editingPolicyData.effect}
                    onValueChange={(value) => setEditingPolicyData({ ...editingPolicyData, effect: value as Policy["effect"] })}
                  >
                    <SelectTrigger id="edit-effect">
                      <SelectValue />
                    </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="deny">Deny</SelectItem>
                    <SelectItem value="log">Log</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                  </Select>
                </div>
              </div>
              {editingPolicyData.effect === "custom" && (
                <div className="space-y-2">
                  <label htmlFor="edit-custom-code" className="text-sm font-medium">
                    Custom Code <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="edit-custom-code"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    placeholder="Enter JavaScript code for custom policy logic..."
                    className="w-full min-h-[200px] px-3 py-2 text-sm border border-input bg-background rounded-md font-mono resize-y"
                    style={{ fontFamily: 'monospace' }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available variables: tool, agentId, agentRole, env, args, log(message, data?), result
                  </p>
                </div>
              )}
              {editingPolicyData.scope !== "global" && (
                <div className="space-y-2">
                  <label htmlFor="edit-scope-target" className="text-sm font-medium">
                    {editingPolicyData.scope === "tool" && "Select Tool"}
                    {editingPolicyData.scope === "agent" && "Select Agent Role"}
                    {editingPolicyData.scope === "provider" && "Select Provider"}
                    {editingPolicyData.scope === "mcp" && "Select MCP Server"}
                  </label>
                  {editingPolicyData.scope === "tool" && (
                    <Select
                      value={scopeTarget}
                      onValueChange={setScopeTarget}
                    >
                      <SelectTrigger id="edit-scope-target">
                        <SelectValue placeholder="Select a tool" />
                      </SelectTrigger>
                      <SelectContent>
                        {toolsData?.map((tool: Tool) => (
                          <SelectItem key={tool.id} value={tool.name}>
                            {tool.name}
                            {tool.category && ` (${tool.category})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {editingPolicyData.scope === "agent" && (
                    <Select
                      value={scopeTarget}
                      onValueChange={setScopeTarget}
                    >
                      <SelectTrigger id="edit-scope-target">
                        <SelectValue placeholder="Select an agent role" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAgentRoles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {editingPolicyData.scope === "provider" && (
                    <Select
                      value={scopeTarget}
                      onValueChange={setScopeTarget}
                    >
                      <SelectTrigger id="edit-scope-target">
                        <SelectValue placeholder="Select a provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {providersData?.map((provider: Provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {editingPolicyData.scope === "mcp" && (
                    <Select
                      value={scopeTarget}
                      onValueChange={setScopeTarget}
                    >
                      <SelectTrigger id="edit-scope-target">
                        <SelectValue placeholder="Select an MCP server" />
                      </SelectTrigger>
                      <SelectContent>
                        {mcpServers.map((server) => (
                          <SelectItem key={server} value={server}>
                            {server}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-enabled"
                    checked={editingPolicyData.enabled}
                    onCheckedChange={(checked) => setEditingPolicyData({ ...editingPolicyData, enabled: checked === true })}
                  />
                  <label htmlFor="edit-enabled" className="text-sm cursor-pointer">
                    Enabled
                  </label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingPolicy(null);
                  setEditingPolicyData(null);
                  setScopeTarget("");
                  setCustomCode("");
                }}
                disabled={updatingPolicy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdatePolicy}
                disabled={updatingPolicy || !editingPolicyData.name || (editingPolicyData.effect === "custom" && !customCode)}
              >
                {updatingPolicy ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

