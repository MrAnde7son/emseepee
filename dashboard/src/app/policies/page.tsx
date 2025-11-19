"use client";

import { useState, useMemo } from "react";
import { usePolicies } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";
import { Policy } from "@/lib/types";

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

export default function PoliciesPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading, refetch } = usePolicies(showArchived);
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [editingPolicyData, setEditingPolicyData] = useState<Policy | null>(null);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  const [deletingPolicy, setDeletingPolicy] = useState<string | null>(null);
  const [archivingPolicy, setArchivingPolicy] = useState<string | null>(null);
  const [restoringPolicy, setRestoringPolicy] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [filterEffect, setFilterEffect] = useState<string>("all");
  const [filterEnabled, setFilterEnabled] = useState<string>("all");
  
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

  const handleEditClick = (id: string) => {
    const policy = data?.find((p: Policy) => p.id === id);
    if (policy) {
      setEditingPolicyData({ ...policy });
      setEditingPolicy(id);
    }
  };

  const handleUpdatePolicy = async () => {
    if (!editingPolicy || !editingPolicyData) return;
    
    setUpdatingPolicy(true);
    try {
      await Api.updatePolicy(editingPolicy, {
        name: editingPolicyData.name,
        description: editingPolicyData.description,
        priority: editingPolicyData.priority,
        effect: editingPolicyData.effect,
        enabled: editingPolicyData.enabled,
      });
      await refetch();
      setEditingPolicy(null);
      setEditingPolicyData(null);
    } catch (error) {
      console.error("Failed to update policy:", error);
      alert(`Failed to update policy: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUpdatingPolicy(false);
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
        <div className="border border-border rounded-xl divide-y divide-border text-xs">
          {filteredPolicies.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1.5fr,1fr,1fr,auto,auto,auto] gap-2 px-3 py-2 items-center bg-card/50"
            >
              <div>
                <div className="text-foreground text-sm">{p.name}</div>
                {p.description && (
                  <div className="text-[11px] text-muted-foreground line-clamp-1">
                    {p.description}
                  </div>
                )}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">{p.scope}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{p.effect}</div>
              <div className="text-[11px] text-foreground">{p.priority}</div>
              <div>
                {p.archived ? (
                  <Badge variant="outline" className="text-xs">
                    archived
                  </Badge>
                ) : (
                  <Badge
                    variant={p.enabled ? "default" : "outline"}
                  >
                    {p.enabled ? "enabled" : "disabled"}
                  </Badge>
                )}
              </div>
              <div className="flex gap-1 justify-end">
                {!p.archived && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-6"
                      onClick={() => handleEditClick(p.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-6 text-amber-400 hover:text-amber-300"
                      onClick={() => handleArchive(p.id)}
                      disabled={archivingPolicy === p.id}
                    >
                      {archivingPolicy === p.id ? "..." : "Archive"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-6 text-red-400 hover:text-red-300"
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
                    className="text-xs h-6 text-emerald-400 hover:text-emerald-300"
                    onClick={() => handleRestore(p.id)}
                    disabled={restoringPolicy === p.id}
                  >
                    {restoringPolicy === p.id ? "..." : "Restore"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Policy</DialogTitle>
            <DialogDescription>
              Create a new policy rule. Note: Full policy editing requires direct config.json editing.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground py-4">
            Policy creation via UI is coming soon. For now, please edit config.json directly.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {editingPolicy && editingPolicyData && (
        <Dialog open={!!editingPolicy} onOpenChange={(open) => {
          if (!open) {
            setEditingPolicy(null);
            setEditingPolicyData(null);
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Policy</DialogTitle>
              <DialogDescription>
                Update the policy settings. Note: Advanced condition editing requires direct config.json editing.
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
              <div className="grid grid-cols-2 gap-4">
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
                    </SelectContent>
                  </Select>
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
                }}
                disabled={updatingPolicy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdatePolicy}
                disabled={updatingPolicy || !editingPolicyData.name}
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

