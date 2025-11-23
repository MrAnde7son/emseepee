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
import { Pagination } from "@/components/ui/pagination";

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
  const initialPriority = searchParams.get("priority") || "all";
  const initialArchived = searchParams.get("archived") === "true";
  const initialPage = parseInt(searchParams.get("page") || "1", 10);

  const [showArchived, setShowArchived] = useState(initialArchived);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [filterScope, setFilterScope] = useState<string>(initialScope);
  const [filterEffect, setFilterEffect] = useState<string>(initialEffect);
  const [filterEnabled, setFilterEnabled] = useState<string>(initialStatus);
  const [filterPriority, setFilterPriority] = useState<string>(initialPriority);
  
  const pageSize = 50;
  const filters = {
    search: searchQuery || undefined,
    scope: filterScope !== "all" ? filterScope : undefined,
    effect: filterEffect !== "all" ? filterEffect : undefined,
    enabled: filterEnabled !== "all" ? filterEnabled : undefined,
    priority: filterPriority !== "all" ? filterPriority : undefined,
  };
  const { data, isLoading, refetch } = usePolicies(showArchived, currentPage, pageSize, filters);
  const { data: toolsData } = useTools();
  const { data: providersData } = useProviders();
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [editingPolicyData, setEditingPolicyData] = useState<Policy | null>(null);
  const [scopeTarget, setScopeTarget] = useState<string>("");
  const [customCode, setCustomCode] = useState<string>("");
  const [stopOnMatch, setStopOnMatch] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [webhookMethod, setWebhookMethod] = useState<"GET" | "POST" | "PUT">("POST");
  const [conditionArgs, setConditionArgs] = useState<Record<string, string>>({});
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
  const [newPolicyStopOnMatch, setNewPolicyStopOnMatch] = useState<boolean>(false);
  const [newPolicyActionMessage, setNewPolicyActionMessage] = useState<string>("");
  const [newPolicyWebhookUrl, setNewPolicyWebhookUrl] = useState<string>("");
  const [newPolicyWebhookMethod, setNewPolicyWebhookMethod] = useState<"GET" | "POST" | "PUT">("POST");
  const [newPolicyConditionArgs, setNewPolicyConditionArgs] = useState<Record<string, string>>({});
  
  const isUpdatingFromUrl = useRef(false);
  const prevSearchParamsRef = useRef<string>("");
  
  // Extract unique agent roles from existing policies
  const availableAgentRoles = useMemo(() => {
    const roles = new Set<string>(COMMON_AGENT_ROLES);
    if (data?.data) {
      // We'd need to parse conditions from backend, but for now use common roles
      // In a real implementation, we'd extract from policy conditions
    }
    return Array.from(roles).sort();
  }, [data?.data]);
  
  // Get MCP servers from tools
  const mcpServers = useMemo(() => {
    if (!toolsData?.data) return [];
    const servers = new Set<string>();
    toolsData.data.forEach((tool: Tool) => {
      if (tool.source === "mcp" && tool.providerId) {
        servers.add(tool.providerId);
      }
    });
    return Array.from(servers).sort();
  }, [toolsData?.data]);
  const [deletingPolicy, setDeletingPolicy] = useState<string | null>(null);
  const [archivingPolicy, setArchivingPolicy] = useState<string | null>(null);
  const [restoringPolicy, setRestoringPolicy] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
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
    const urlPriority = searchParams.get("priority") || "all";
    const urlArchived = searchParams.get("archived") === "true";
    const urlPage = parseInt(searchParams.get("page") || "1", 10);

    // Check if URL params differ from current state
    const searchChanged = urlSearch !== searchQuery;
    const scopeChanged = urlScope !== filterScope;
    const effectChanged = urlEffect !== filterEffect;
    const statusChanged = urlStatus !== filterEnabled;
    const priorityChanged = urlPriority !== filterPriority;
    const archivedChanged = urlArchived !== showArchived;
    const pageChanged = urlPage !== currentPage;

    if (searchChanged || scopeChanged || effectChanged || statusChanged || priorityChanged || archivedChanged || pageChanged) {
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
        if (priorityChanged) {
          setFilterPriority(urlPriority);
        }
        if (archivedChanged) {
          setShowArchived(urlArchived);
        }
        if (pageChanged) {
          setCurrentPage(urlPage);
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
    
    if (filterPriority !== "all") {
      params.set("priority", filterPriority);
    }
    
    if (showArchived) {
      params.set("archived", "true");
    }
    
    if (currentPage > 1) {
      params.set("page", currentPage.toString());
    }
    
    const currentParams = new URLSearchParams(window.location.search);
    const newParamsString = params.toString();
    const currentParamsString = currentParams.toString();
    
    // Only update URL if it's different to avoid unnecessary updates
    if (newParamsString !== currentParamsString) {
      const newUrl = newParamsString ? `?${newParamsString}` : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchQuery, filterScope, filterEffect, filterEnabled, filterPriority, showArchived, currentPage, router]);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterScope, filterEffect, filterEnabled, filterPriority, showArchived]);

  // Use data directly from backend (already filtered)
  const filteredPolicies = data?.data || [];
  
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
    try {
      // Always fetch full policy details to get condition, stopOnMatch, etc.
      const fullPolicy = await Api.getPolicy(id);
      setEditingPolicyData({ ...fullPolicy });
      setEditingPolicy(id);
      
      // Set scopeTarget from policy
      setScopeTarget(fullPolicy.scopeTarget || "");
      
      // Extract custom code if effect is custom
      if (fullPolicy.effect === "custom") {
        setCustomCode(fullPolicy.customCode || "");
      } else {
        setCustomCode("");
      }
      
      // Extract stopOnMatch
      setStopOnMatch(fullPolicy.stopOnMatch ?? false);
      
      // Extract action message
      setActionMessage(fullPolicy.actionMessage || "");
      
      // Extract webhook settings
      setWebhookUrl(fullPolicy.webhookUrl || "");
      setWebhookMethod(fullPolicy.webhookMethod || "POST");
      
      // Extract condition args
      if (fullPolicy.condition?.args) {
        const args: Record<string, string> = {};
        for (const [key, value] of Object.entries(fullPolicy.condition.args)) {
          args[key] = typeof value === "string" ? value : JSON.stringify(value);
        }
        setConditionArgs(args);
      } else {
        setConditionArgs({});
      }
      
      // Extract scope target from condition if not already set
      if (!fullPolicy.scopeTarget && fullPolicy.condition) {
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
    } catch (error) {
      console.error("Failed to fetch policy details:", error);
      alert(`Failed to load policy: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleUpdatePolicy = async () => {
    if (!editingPolicy || !editingPolicyData) return;
    
    // Start with existing condition or build new one based on scope
    const existingCondition = editingPolicyData.condition || {};
    const condition: Record<string, unknown> = { ...existingCondition };
    
    // Update scope-specific fields
    if (editingPolicyData.scope === "tool" && scopeTarget) {
      condition.toolName = scopeTarget;
      // Remove other scope fields when switching to tool scope
      delete condition.agentRole;
      delete condition.providerId;
      delete condition.sensitivity;
    } else if (editingPolicyData.scope === "agent" && scopeTarget) {
      condition.agentRole = scopeTarget;
      delete condition.toolName;
      delete condition.providerId;
      delete condition.sensitivity;
    } else if (editingPolicyData.scope === "provider" && scopeTarget) {
      condition.providerId = scopeTarget;
      delete condition.toolName;
      delete condition.agentRole;
      delete condition.sensitivity;
    } else if (editingPolicyData.scope === "sensitivity" && scopeTarget) {
      condition.sensitivity = scopeTarget;
      delete condition.toolName;
      delete condition.agentRole;
      delete condition.providerId;
    } else if (editingPolicyData.scope === "global") {
      // Clear all scope-specific fields for global scope
      delete condition.toolName;
      delete condition.agentRole;
      delete condition.providerId;
      delete condition.sensitivity;
      delete condition.category;
    }
    
    // Update condition args
    if (Object.keys(conditionArgs).length > 0) {
      const parsedArgs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(conditionArgs)) {
        if (key.trim() && value.trim()) {
          // Try to parse as JSON, otherwise use as string
          try {
            parsedArgs[key] = JSON.parse(value);
          } catch {
            parsedArgs[key] = value;
          }
        }
      }
      if (Object.keys(parsedArgs).length > 0) {
        condition.args = parsedArgs;
      } else {
        delete condition.args;
      }
    } else {
      delete condition.args;
    }
    
    // Build action
    const action: Record<string, unknown> = {
      operation: editingPolicyData.effect === "deny" ? "block" : editingPolicyData.effect === "allow" ? "allow" : editingPolicyData.effect,
    };
    
    if (actionMessage.trim()) {
      action.message = actionMessage;
    }
    
    if (editingPolicyData.effect === "custom" && customCode.trim()) {
      action.customCode = customCode;
    }
    
    if (editingPolicyData.effect === "webhook") {
      if (webhookUrl.trim()) {
        action.webhookUrl = webhookUrl;
      }
      action.webhookMethod = webhookMethod;
    }
    
    // Build full PolicyRule update payload
    const updatePayload: {
      name?: string;
      description?: string;
      priority?: number;
      condition?: Record<string, unknown>;
      action?: Record<string, unknown>;
      stopOnMatch?: boolean;
    } = {
      name: editingPolicyData.name,
      description: editingPolicyData.description,
      priority: editingPolicyData.priority,
      condition,
      action,
      stopOnMatch,
    };
    
    setUpdatingPolicy(true);
    try {
      await Api.updatePolicy(editingPolicy, updatePayload);
      await refetch();
      setEditingPolicy(null);
      setEditingPolicyData(null);
      setScopeTarget("");
      setCustomCode("");
      setStopOnMatch(false);
      setActionMessage("");
      setWebhookUrl("");
      setWebhookMethod("POST");
      setConditionArgs({});
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
    
    // Build condition based on scope and scopeTarget
    const condition: Record<string, unknown> = {};
    
    if (newPolicyData.scope === "tool" && newPolicyScopeTarget) {
      condition.toolName = newPolicyScopeTarget;
    } else if (newPolicyData.scope === "agent" && newPolicyScopeTarget) {
      condition.agentRole = newPolicyScopeTarget;
    } else if (newPolicyData.scope === "provider" && newPolicyScopeTarget) {
      condition.providerId = newPolicyScopeTarget;
    } else if (newPolicyData.scope === "sensitivity" && newPolicyScopeTarget) {
      condition.sensitivity = newPolicyScopeTarget;
    }
    
    // Add condition args if any
    if (Object.keys(newPolicyConditionArgs).length > 0) {
      const parsedArgs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(newPolicyConditionArgs)) {
        if (value.trim()) {
          // Try to parse as JSON, otherwise use as string
          try {
            parsedArgs[key] = JSON.parse(value);
          } catch {
            parsedArgs[key] = value;
          }
        }
      }
      if (Object.keys(parsedArgs).length > 0) {
        condition.args = parsedArgs;
      }
    }
    
    // Build action
    const effect = newPolicyData.effect ?? "allow";
    const action: Record<string, unknown> = {
      operation: effect === "deny" ? "block" : effect === "allow" ? "allow" : effect,
    };
    
    if (newPolicyActionMessage.trim()) {
      action.message = newPolicyActionMessage;
    }
    
    if (effect === "custom") {
      if (!newPolicyCustomCode.trim()) {
        alert("Custom code is required when effect is 'custom'");
        return;
      }
      action.customCode = newPolicyCustomCode;
    }
    
    if (effect === "webhook") {
      if (newPolicyWebhookUrl.trim()) {
        action.webhookUrl = newPolicyWebhookUrl;
      }
      action.webhookMethod = newPolicyWebhookMethod;
    }
    
    // Build full PolicyRule create payload
    const createPayload: {
      name: string;
      description?: string;
      priority: number;
      condition: Record<string, unknown>;
      action: Record<string, unknown>;
      stopOnMatch?: boolean;
    } = {
      name: newPolicyData.name,
      description: newPolicyData.description,
      priority: newPolicyData.priority ?? 0,
      condition,
      action,
      stopOnMatch: newPolicyStopOnMatch,
    };
    
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
      setNewPolicyStopOnMatch(false);
      setNewPolicyActionMessage("");
      setNewPolicyWebhookUrl("");
      setNewPolicyWebhookMethod("POST");
      setNewPolicyConditionArgs({});
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
    setFilterPriority("all");
  };

  const hasActiveFilters = searchQuery || filterScope !== "all" || filterEffect !== "all" || filterEnabled !== "all" || filterPriority !== "all";

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
        <Input
          type="number"
          placeholder="Priority"
          value={filterPriority === "all" ? "" : filterPriority}
          onChange={(e) => {
            const value = e.target.value;
            setFilterPriority(value === "" ? "all" : value);
          }}
          className="w-[120px]"
        />
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

      {!isLoading && (!data?.data || data.data.length === 0) && (
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

      {data && data.totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={data.totalPages}
          totalItems={data.total}
          pageSize={pageSize}
          onPageChange={(page) => {
            setCurrentPage(page);
            // Scroll to top when page changes
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
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
          setNewPolicyStopOnMatch(false);
          setNewPolicyActionMessage("");
          setNewPolicyWebhookUrl("");
          setNewPolicyWebhookMethod("POST");
          setNewPolicyConditionArgs({});
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Policy</DialogTitle>
            <DialogDescription>
              Create a new policy rule. Scope determines what the policy applies to: Tool (specific tools), Agent (specific agent roles), Provider (specific providers like Cursor, Gemini), MCP Server (specific MCP servers like GitHub), or Global (all operations).
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
                    <SelectItem value="sensitivity">Sensitivity</SelectItem>
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
            {newPolicyData.effect === "webhook" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="create-webhook-url" className="text-sm font-medium">
                    Webhook URL
                  </label>
                  <Input
                    id="create-webhook-url"
                    value={newPolicyWebhookUrl}
                    onChange={(e) => setNewPolicyWebhookUrl(e.target.value)}
                    placeholder="https://example.com/webhook"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="create-webhook-method" className="text-sm font-medium">
                    Webhook Method
                  </label>
                  <Select value={newPolicyWebhookMethod} onValueChange={(value) => setNewPolicyWebhookMethod(value as "GET" | "POST" | "PUT")}>
                    <SelectTrigger id="create-webhook-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="create-action-message" className="text-sm font-medium">
                Action Message
              </label>
              <Input
                id="create-action-message"
                value={newPolicyActionMessage}
                onChange={(e) => setNewPolicyActionMessage(e.target.value)}
                placeholder="Optional message to log or display when policy matches"
              />
              <p className="text-xs text-muted-foreground">
                This message will be logged or displayed when the policy is triggered
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Condition Arguments</label>
              <p className="text-xs text-muted-foreground mb-2">
                Define conditions on tool arguments (e.g., path: "secret" to match paths containing "secret")
              </p>
              <div className="space-y-2">
                {Object.entries(newPolicyConditionArgs).map(([key, value], idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder="Argument name (e.g., path)"
                      value={key}
                      onChange={(e) => {
                        const newArgs = { ...newPolicyConditionArgs };
                        delete newArgs[key];
                        newArgs[e.target.value] = value;
                        setNewPolicyConditionArgs(newArgs);
                      }}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Value (string or JSON)"
                      value={value}
                      onChange={(e) => {
                        setNewPolicyConditionArgs({ ...newPolicyConditionArgs, [key]: e.target.value });
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newArgs = { ...newPolicyConditionArgs };
                        delete newArgs[key];
                        setNewPolicyConditionArgs(newArgs);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewPolicyConditionArgs({ ...newPolicyConditionArgs, "": "" });
                  }}
                >
                  Add Argument Condition
                </Button>
              </div>
            </div>
            {newPolicyData.scope !== "global" && (
              <div className="space-y-2">
                <label htmlFor="create-scope-target" className="text-sm font-medium">
                  {newPolicyData.scope === "tool" && "Select Tool"}
                  {newPolicyData.scope === "agent" && "Select Agent Role"}
                  {newPolicyData.scope === "provider" && "Select Provider"}
                  {newPolicyData.scope === "mcp" && "Select MCP Server"}
                  {newPolicyData.scope === "sensitivity" && "Select Sensitivity Level"}
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
                      {toolsData?.data?.map((tool: Tool) => (
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
                {newPolicyData.scope === "sensitivity" && (
                  <Select
                    value={newPolicyScopeTarget}
                    onValueChange={setNewPolicyScopeTarget}
                  >
                    <SelectTrigger id="create-scope-target">
                      <SelectValue placeholder="Select sensitivity level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
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
              <label className="text-sm font-medium">Policy Behavior</label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create-stop-on-match"
                  checked={newPolicyStopOnMatch}
                  onCheckedChange={(checked) => setNewPolicyStopOnMatch(checked === true)}
                />
                <label htmlFor="create-stop-on-match" className="text-sm cursor-pointer">
                  Stop on Match (stop evaluating other policies after this one matches)
                </label>
              </div>
            </div>
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
                setNewPolicyStopOnMatch(false);
                setNewPolicyActionMessage("");
                setNewPolicyWebhookUrl("");
                setNewPolicyWebhookMethod("POST");
                setNewPolicyConditionArgs({});
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
            setStopOnMatch(false);
            setActionMessage("");
            setWebhookUrl("");
            setWebhookMethod("POST");
            setConditionArgs({});
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Policy</DialogTitle>
              <DialogDescription>
                Update the policy settings. Scope determines what the policy applies to: Tool (specific tools), Agent (specific agent roles), Provider (specific providers like Cursor, Gemini), MCP Server (specific MCP servers like GitHub), or Global (all operations).
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
                      <SelectItem value="sensitivity">Sensitivity</SelectItem>
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
              {editingPolicyData.effect === "webhook" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-webhook-url" className="text-sm font-medium">
                      Webhook URL
                    </label>
                    <Input
                      id="edit-webhook-url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://example.com/webhook"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="edit-webhook-method" className="text-sm font-medium">
                      Webhook Method
                    </label>
                    <Select value={webhookMethod} onValueChange={(value) => setWebhookMethod(value as "GET" | "POST" | "PUT")}>
                      <SelectTrigger id="edit-webhook-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="edit-action-message" className="text-sm font-medium">
                  Action Message
                </label>
                <Input
                  id="edit-action-message"
                  value={actionMessage}
                  onChange={(e) => setActionMessage(e.target.value)}
                  placeholder="Optional message to log or display when policy matches"
                />
                <p className="text-xs text-muted-foreground">
                  This message will be logged or displayed when the policy is triggered
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Condition Arguments</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Define conditions on tool arguments (e.g., path: "secret" to match paths containing "secret")
                </p>
                <div className="space-y-2">
                  {Object.entries(conditionArgs).map(([key, value], idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        placeholder="Argument name (e.g., path)"
                        value={key}
                        onChange={(e) => {
                          const newArgs = { ...conditionArgs };
                          delete newArgs[key];
                          newArgs[e.target.value] = value;
                          setConditionArgs(newArgs);
                        }}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Value (string or JSON)"
                        value={value}
                        onChange={(e) => {
                          setConditionArgs({ ...conditionArgs, [key]: e.target.value });
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newArgs = { ...conditionArgs };
                          delete newArgs[key];
                          setConditionArgs(newArgs);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setConditionArgs({ ...conditionArgs, "": "" });
                    }}
                  >
                    Add Argument Condition
                  </Button>
                </div>
              </div>
              {editingPolicyData.scope !== "global" && (
                <div className="space-y-2">
                  <label htmlFor="edit-scope-target" className="text-sm font-medium">
                    {editingPolicyData.scope === "tool" && "Select Tool"}
                    {editingPolicyData.scope === "agent" && "Select Agent Role"}
                    {editingPolicyData.scope === "provider" && "Select Provider"}
                    {editingPolicyData.scope === "mcp" && "Select MCP Server"}
                    {editingPolicyData.scope === "sensitivity" && "Select Sensitivity Level"}
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
                        {toolsData?.data?.map((tool: Tool) => (
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
                  {editingPolicyData.scope === "sensitivity" && (
                    <Select
                      value={scopeTarget}
                      onValueChange={setScopeTarget}
                    >
                      <SelectTrigger id="edit-scope-target">
                        <SelectValue placeholder="Select sensitivity level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
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
                <label className="text-sm font-medium">Policy Behavior</label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-stop-on-match"
                    checked={stopOnMatch}
                    onCheckedChange={(checked) => setStopOnMatch(checked === true)}
                  />
                  <label htmlFor="edit-stop-on-match" className="text-sm cursor-pointer">
                    Stop on Match (stop evaluating other policies after this one matches)
                  </label>
                </div>
              </div>
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

