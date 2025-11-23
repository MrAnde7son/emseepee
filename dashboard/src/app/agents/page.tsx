"use client";

import React, { useState, useMemo } from "react";
import { useAgents, useProviders } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";
import { Agent } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  RefreshCcw,
  Plus,
  Edit,
  Trash2,
  Info,
  CheckCircle2,
  XCircle,
  X,
  Calendar,
  Tag,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form state for create/edit
  const [formData, setFormData] = useState({
    providerId: "",
    name: "",
    description: "",
    role: "",
    env: "",
    tenantId: "",
    owner: "",
    enabled: true,
  });

  const { data: providers } = useProviders();
  const filters = useMemo(() => {
    const f: { providerId?: string; role?: string } = {};
    if (selectedProvider !== "all") f.providerId = selectedProvider;
    if (selectedRole !== "all") f.role = selectedRole;
    return f;
  }, [selectedProvider, selectedRole]);

  const { data: agents = [], isLoading: isLoadingAgents, refetch } = useAgents(filters);

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    if (!searchQuery) return agents;
    const query = searchQuery.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.description?.toLowerCase().includes(query) ||
        agent.id.toLowerCase().includes(query) ||
        agent.role?.toLowerCase().includes(query)
    );
  }, [agents, searchQuery]);

  // Get unique roles and providers from agents
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    agents.forEach((agent) => {
      if (agent.role) roles.add(agent.role);
    });
    return Array.from(roles).sort();
  }, [agents]);

  const handleCreateAgent = async () => {
    if (!formData.providerId || !formData.name) {
      alert("Provider ID and name are required");
      return;
    }

    setIsLoading(true);
    try {
      await Api.createAgent({
        providerId: formData.providerId,
        name: formData.name,
        description: formData.description || undefined,
        role: formData.role || undefined,
        env: formData.env || undefined,
        tenantId: formData.tenantId || undefined,
        owner: formData.owner || undefined,
        enabled: formData.enabled,
      });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setIsCreateDialogOpen(false);
      setFormData({
        providerId: "",
        name: "",
        description: "",
        role: "",
        env: "",
        tenantId: "",
        owner: "",
        enabled: true,
      });
    } catch (error) {
      console.error("Failed to create agent:", error);
      alert(`Failed to create agent: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateAgent = async () => {
    if (!selectedAgent) return;

    setIsLoading(true);
    try {
      await Api.updateAgent(selectedAgent.id, {
        name: formData.name,
        description: formData.description,
        role: formData.role,
        env: formData.env,
        tenantId: formData.tenantId,
        owner: formData.owner,
        enabled: formData.enabled,
      });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setIsEditDialogOpen(false);
      setSelectedAgent(null);
    } catch (error) {
      console.error("Failed to update agent:", error);
      alert(`Failed to update agent: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!selectedAgent) return;

    setIsLoading(true);
    try {
      await Api.deleteAgent(selectedAgent.id);
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setIsDeleteDialogOpen(false);
      setSelectedAgent(null);
    } catch (error) {
      console.error("Failed to delete agent:", error);
      alert(`Failed to delete agent: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = (agent: Agent) => {
    setSelectedAgent(agent);
    setFormData({
      providerId: agent.providerId,
      name: agent.name,
      description: agent.description || "",
      role: agent.role || "",
      env: agent.env || "",
      tenantId: agent.tenantId || "",
      owner: agent.owner || "",
      enabled: agent.enabled,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsDeleteDialogOpen(true);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  const getProviderName = (providerId: string) => {
    return providers?.find((p) => p.id === providerId)?.name || providerId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="text-xs text-muted-foreground">
            Manage and configure agents across all providers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoadingAgents}
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${isLoadingAgents ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setFormData({
                providerId: "",
                name: "",
                description: "",
                role: "",
                env: "",
                tenantId: "",
                owner: "",
                enabled: true,
              });
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Agent
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedProvider} onValueChange={setSelectedProvider}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers?.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedRole} onValueChange={setSelectedRole}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {availableRoles.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(selectedProvider !== "all" || selectedRole !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedProvider("all");
              setSelectedRole("all");
            }}
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Agents Table */}
      <div className="border border-border rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingAgents ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading agents...
                </TableCell>
              </TableRow>
            ) : filteredAgents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {searchQuery || selectedProvider !== "all" || selectedRole !== "all"
                    ? "No agents match your filters"
                    : "No agents found. Create one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredAgents.map((agent) => (
                <TableRow 
                  key={agent.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedAgent(agent)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        {agent.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {agent.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getProviderName(agent.providerId)}</Badge>
                  </TableCell>
                  <TableCell>
                    {agent.role ? (
                      <Badge variant="secondary">
                        <Tag className="h-3 w-3 mr-1" />
                        {agent.role}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {agent.owner ? (
                      <span className="text-sm">{agent.owner}</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {agent.enabled ? (
                      <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-500/10 text-gray-500">
                        <XCircle className="h-3 w-3 mr-1" />
                        Disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {agent.env ? (
                      <Badge variant="outline">{agent.env}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(agent.lastSeenAt)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAgent(agent);
                        }}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(agent);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(agent);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Agent Details Dialog */}
      {selectedAgent && (
        <Dialog open={!!selectedAgent && !isEditDialogOpen && !isDeleteDialogOpen} onOpenChange={() => setSelectedAgent(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedAgent.name}</DialogTitle>
              <DialogDescription>Agent details and configuration</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Agent ID</label>
                <div className="text-sm text-muted-foreground font-mono">{selectedAgent.id}</div>
              </div>
              <div>
                <label className="text-sm font-medium">Provider</label>
                <div className="text-sm">{getProviderName(selectedAgent.providerId)}</div>
              </div>
              {selectedAgent.providerNativeId && (
                <div>
                  <label className="text-sm font-medium">Provider Native ID</label>
                  <div className="text-sm text-muted-foreground font-mono">{selectedAgent.providerNativeId}</div>
                </div>
              )}
              {selectedAgent.description && (
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <div className="text-sm">{selectedAgent.description}</div>
                </div>
              )}
              {selectedAgent.role && (
                <div>
                  <label className="text-sm font-medium">Role</label>
                  <div className="text-sm">{selectedAgent.role}</div>
                </div>
              )}
              {selectedAgent.env && (
                <div>
                  <label className="text-sm font-medium">Environment</label>
                  <div className="text-sm">{selectedAgent.env}</div>
                </div>
              )}
              {selectedAgent.tenantId && (
                <div>
                  <label className="text-sm font-medium">Tenant ID</label>
                  <div className="text-sm font-mono">{selectedAgent.tenantId}</div>
                </div>
              )}
              {selectedAgent.owner && (
                <div>
                  <label className="text-sm font-medium">Owner</label>
                  <div className="text-sm">{selectedAgent.owner}</div>
                </div>
              )}
              {selectedAgent.metadata && Object.keys(selectedAgent.metadata).length > 0 && (
                <div>
                  <label className="text-sm font-medium">Metadata</label>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                    {JSON.stringify(selectedAgent.metadata, null, 2)}
                  </pre>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Created</label>
                  <div className="text-sm">{formatDate(selectedAgent.createdAt)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Updated</label>
                  <div className="text-sm">{formatDate(selectedAgent.updatedAt)}</div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedAgent(null)}>
                Close
              </Button>
              <Button onClick={() => openEditDialog(selectedAgent)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Agent Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
            <DialogDescription>Create a new agent in a provider</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Provider</label>
              <Select
                value={formData.providerId}
                onValueChange={(value) => setFormData({ ...formData, providerId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers?.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Agent name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Agent description"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., coder_bot, research_bot"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Environment</label>
              <Input
                value={formData.env}
                onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                placeholder="e.g., production, staging"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Owner</label>
              <Input
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                placeholder="Owner/user identifier"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="enabled" className="text-sm font-medium">
                Enabled
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAgent} disabled={isLoading}>
              {isLoading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog 
        open={isEditDialogOpen} 
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setSelectedAgent(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>Update agent configuration</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Agent name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Agent description"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., coder_bot, research_bot"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Environment</label>
              <Input
                value={formData.env}
                onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                placeholder="e.g., production, staging"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Owner</label>
              <Input
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                placeholder="Owner/user identifier"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled-edit"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="enabled-edit" className="text-sm font-medium">
                Enabled
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateAgent} disabled={isLoading}>
              {isLoading ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Agent Dialog */}
      <Dialog 
        open={isDeleteDialogOpen} 
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) {
            setSelectedAgent(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedAgent?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAgent} disabled={isLoading}>
              {isLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
