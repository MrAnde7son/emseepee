"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useTools } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";
import { Tool } from "@/lib/types";

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
  FileText,
  Terminal,
  Globe,
  Package,
  Server,
  Search,
  CheckCircle2,
  Circle,
  ChevronRight,
  Settings,
  Info,
  Wrench,
} from "lucide-react";

interface CategoryInfo {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const categories: CategoryInfo[] = [
  {
    id: "file",
    name: "File Operations",
    description: "Read, write, and search files with policy enforcement",
    icon: FileText,
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  {
    id: "terminal",
    name: "Terminal Commands",
    description: "Execute terminal commands with security controls",
    icon: Terminal,
    color: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  {
    id: "browser",
    name: "Browser Operations",
    description: "Web search and browser automation capabilities",
    icon: Globe,
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  },
  {
    id: "third_party",
    name: "Third-Party Tools",
    description: "Custom integrations and HTTP-based tools",
    icon: Package,
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
];


interface McpServerDetails {
  id: string;
  name: string;
  description?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled?: boolean;
  icon?: string;
  defaultPolicy: {
    allowedRoles: string[];
    sensitivity: string;
  };
  toolPolicyOverrides?: Record<string, {
    allowedRoles?: string[];
    sensitivity?: string;
  }>;
  disabledTools?: string[];
}

// Helper component to render icons (supports both Lucide icons and image URLs)
function IconRenderer({ icon, className }: { icon?: string; className?: string }) {
  if (!icon) {
    return <Server className={className} />;
  }
  
  // Check if it's a URL (starts with http:// or https:// or /)
  if (icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img 
        src={icon} 
        alt="" 
        className={className}
        onError={(e) => {
          // Fallback to Server icon if image fails to load
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  
  // Map of Lucide icon names to components
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Server,
    FileText,
    Terminal,
    Globe,
    Package,
  };
  
  const IconComponent = iconMap[icon] || Server;
  return <IconComponent className={className} />;
}

export default function ToolsPage() {
  const { data: tools, isLoading, refetch } = useTools();
  const [searchQuery, setSearchQuery] = useState("");
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<{ type: "category" | "mcp"; id: string } | null>(null);
  const [mcpDetails, setMcpDetails] = useState<McpServerDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [mcpIcons, setMcpIcons] = useState<Map<string, string>>(new Map());

  // Group tools by category (exclude MCP tools as they're shown separately)
  const toolsByCategory = useMemo(() => {
    if (!tools) return {};
    
    const grouped: Record<string, Tool[]> = {};
    tools.forEach((tool) => {
      // Skip MCP tools - they're shown under their MCP server, not in categories
      if (tool.source === "mcp" || tool.category === "mcp") {
        return;
      }
      const category = tool.category || "third_party";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(tool);
    });
    return grouped;
  }, [tools]);

  // Group MCP servers
  const mcpServers = useMemo(() => {
    if (!tools) return [];
    
    const mcpMap = new Map<string, { tools: Tool[]; installed: boolean }>();
    
    tools.forEach((tool) => {
      if (tool.source === "mcp" && tool.providerId) {
        const existing = mcpMap.get(tool.providerId) || { tools: [], installed: tool.installed };
        existing.tools.push(tool);
        // If any tool from this MCP is installed, consider the MCP installed
        if (tool.installed) {
          existing.installed = true;
        }
        mcpMap.set(tool.providerId, existing);
      }
    });
    
    return Array.from(mcpMap.entries()).map(([id, data]) => ({
      id,
      name: id,
      description: `MCP server with ${data.tools.length} tool${data.tools.length !== 1 ? "s" : ""}`,
      toolCount: data.tools.length,
      installed: data.installed,
    }));
  }, [tools]);

  const handleToggleTool = async (toolId: string, currentlyInstalled: boolean) => {
    setInstalling((prev) => new Set(prev).add(toolId));
    try {
      if (currentlyInstalled) {
        await Api.disableTool(toolId);
      } else {
        await Api.enableTool(toolId);
      }
      await refetch();
    } catch (error) {
      console.error("Failed to toggle tool:", error);
      alert(`Failed to ${currentlyInstalled ? "disable" : "enable"} tool: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(toolId);
        return next;
      });
    }
  };

  const handleToggleMcp = async (mcpId: string, currentlyInstalled: boolean) => {
    setInstalling((prev) => new Set(prev).add(mcpId));
    try {
      if (currentlyInstalled) {
        await Api.disableMcpServer(mcpId);
      } else {
        await Api.enableMcpServer(mcpId);
      }
      await refetch();
    } catch (error) {
      console.error("Failed to toggle MCP server:", error);
      alert(`Failed to ${currentlyInstalled ? "disable" : "enable"} MCP server: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(mcpId);
        return next;
      });
    }
  };

  const handleToggleAllCategoryTools = async (categoryId: string, currentlyInstalled: boolean) => {
    const categoryTools = toolsByCategory[categoryId] || [];
    if (categoryTools.length === 0) return;

    setInstalling((prev) => {
      const next = new Set(prev);
      categoryTools.forEach((tool) => next.add(tool.id));
      return next;
    });

    try {
      const promises = categoryTools.map((tool) =>
        currentlyInstalled
          ? Api.disableTool(tool.id)
          : Api.enableTool(tool.id)
      );
      await Promise.all(promises);
      await refetch();
    } catch (error) {
      console.error("Failed to toggle category tools:", error);
      alert(`Failed to ${currentlyInstalled ? "disable" : "enable"} tools: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        categoryTools.forEach((tool) => next.delete(tool.id));
        return next;
      });
    }
  };

  // Get tools for selected item
  const selectedTools = useMemo(() => {
    if (!selectedItem || !tools) return [];
    if (selectedItem.type === "category") {
      return toolsByCategory[selectedItem.id] || [];
    } else {
      return tools.filter((tool) => tool.source === "mcp" && tool.providerId === selectedItem.id);
    }
  }, [selectedItem, toolsByCategory, tools]);

  // Get selected item info
  const selectedItemInfo = useMemo(() => {
    if (!selectedItem) return null;
    if (selectedItem.type === "category") {
      return categories.find((cat) => cat.id === selectedItem.id);
    } else {
      const mcp = mcpServers.find((mcp) => mcp.id === selectedItem.id);
      if (mcp) {
        const icon = mcpIcons.get(mcp.id) || Server;
        return {
          type: "mcp" as const,
          id: mcp.id,
          name: mcp.name,
          description: mcp.description,
          icon: typeof icon === "string" ? icon : Server,
          color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
        };
      }
      return null;
    }
  }, [selectedItem, mcpServers, mcpIcons]);

  // Preload all MCP server icons on mount
  useEffect(() => {
    if (mcpServers.length === 0) return;
    
    // Load icons for all MCP servers in parallel
    const loadIcons = async () => {
      const iconPromises = mcpServers.map(async (mcp) => {
        try {
          const details = await Api.getMcpServerDetails(mcp.id);
          if (details.icon) {
            return { id: mcp.id, icon: details.icon };
          }
        } catch (error) {
          console.error(`Failed to load icon for ${mcp.id}:`, error);
        }
        return null;
      });
      
      const results = await Promise.all(iconPromises);
      results.forEach((result) => {
        if (result) {
          setMcpIcons((prev) => new Map(prev).set(result.id, result.icon));
        }
      });
    };
    
    loadIcons();
  }, [mcpServers]);

  // Load details when selected
  useEffect(() => {
    if (selectedItem?.type === "mcp") {
      setLoadingDetails(true);
      Api.getMcpServerDetails(selectedItem.id)
        .then((details) => {
          setMcpDetails(details);
          // Store icon for future use
          if (details.icon) {
            setMcpIcons((prev) => new Map(prev).set(selectedItem.id, details.icon!));
          }
        })
        .catch((error) => {
          console.error("Failed to load MCP server details:", error);
          setMcpDetails(null);
        })
        .finally(() => {
          setLoadingDetails(false);
        });
    } else {
      setMcpDetails(null);
      setLoadingDetails(false);
    }
  }, [selectedItem]);

  // Combine categories and MCP servers into unified items
  const allItems = useMemo(() => {
    if (!tools) return [];
    
    const items: Array<{ type: "category" | "mcp"; id: string; name: string; description: string; icon: React.ComponentType<{ className?: string }> | string; color: string; toolCount: number; installedCount: number }> = [];
    
    // Add categories
    categories.forEach((cat) => {
      const categoryTools = toolsByCategory[cat.id] || [];
      items.push({
        type: "category",
        id: cat.id,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        color: cat.color,
        toolCount: categoryTools.length,
        installedCount: categoryTools.filter((t) => t.installed).length,
      });
    });
    
    // Add MCP servers
    mcpServers.forEach((mcp) => {
      // Get icon from stored icons - if it's a string (URL), use it; otherwise use Server component
      const storedIcon = mcpIcons.get(mcp.id);
      const icon = storedIcon || Server;
      items.push({
        type: "mcp",
        id: mcp.id,
        name: mcp.name,
        description: mcp.description,
        icon: icon,
        color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
        toolCount: mcp.toolCount,
        installedCount: mcp.installed ? mcp.toolCount : 0,
      });
    });
    
    return items;
  }, [tools, toolsByCategory, mcpServers, mcpIcons]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery) return allItems;
    const query = searchQuery.toLowerCase();
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        (item.type === "category" && (toolsByCategory[item.id]?.some((tool) =>
          tool.name.toLowerCase().includes(query)
        ) ?? false)) ||
        (item.type === "mcp" && selectedTools.some((tool) =>
          tool.name.toLowerCase().includes(query)
        ))
    );
  }, [searchQuery, allItems, toolsByCategory, selectedTools]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="text-sm text-muted-foreground">
            Browse and install tools and MCP servers by category
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tools, categories, or MCP servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery("")}
            className="text-xs"
          >
            Clear
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading catalog...</div>
      )}

      {!isLoading && (
        <>
          {/* Unified Cards Grid */}
          <div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => {
                const icon = item.icon;
                const isIconString = typeof icon === "string";
                const itemTools = item.type === "category" 
                  ? (toolsByCategory[item.id] || [])
                  : ((tools || []).filter((t) => t.source === "mcp" && t.providerId === item.id));

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="border border-border rounded-xl p-6 bg-card hover:bg-accent/5 transition-colors cursor-pointer"
                    onClick={() => setSelectedItem({ type: item.type, id: item.id })}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-lg border ${item.color}`}>
                        {isIconString ? (
                          <IconRenderer icon={icon} className="h-6 w-6" />
                        ) : (
                          React.createElement(icon as React.ComponentType<{ className?: string }>, { className: "h-6 w-6" })
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {item.installedCount}/{item.toolCount} installed
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">{item.name}</h3>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {item.description}
                    </p>
                    <div className="space-y-2">
                      {itemTools.length > 0 ? (
                        itemTools.slice(0, 3).map((tool) => (
                          <div
                            key={tool.id}
                            className="flex items-center justify-between text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-muted-foreground truncate flex-1">
                              {tool.name}
                            </span>
                            <Button
                              size="sm"
                              variant={tool.installed ? "outline" : "default"}
                              className="h-6 px-2 text-xs ml-2"
                              onClick={() =>
                                handleToggleTool(tool.id, tool.installed)
                              }
                              disabled={installing.has(tool.id)}
                            >
                              {installing.has(tool.id) ? (
                                "..."
                              ) : tool.installed ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <Circle className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No tools available
                        </p>
                      )}
                      {itemTools.length > 3 && (
                        <p className="text-xs text-muted-foreground pt-2">
                          +{itemTools.length - 3} more tools
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredItems.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg mt-4">
                {searchQuery
                  ? "No results found matching your search."
                  : "No tools or MCP servers available."}
              </div>
            )}
          </div>
        </>
      )}

      {/* Unified Detail Dialog */}
      <Dialog open={selectedItem !== null} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-[95vh] flex flex-col p-0">
          <div className="p-6 pb-4 border-b">
            <DialogHeader>
              <div className="flex items-center gap-3">
                {selectedItemInfo && (
                  <div className={`p-3 rounded-lg border ${selectedItemInfo.color}`}>
                    {typeof selectedItemInfo.icon === "string" ? (
                      <IconRenderer icon={selectedItemInfo.icon} className="h-6 w-6" />
                    ) : (
                      <selectedItemInfo.icon className="h-6 w-6" />
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <DialogTitle>{selectedItemInfo?.name || "Details"}</DialogTitle>
                  <DialogDescription>
                    {selectedItem?.type === "mcp" 
                      ? (mcpDetails?.description || `MCP server with ${selectedTools.length} tool${selectedTools.length !== 1 ? "s" : ""}`)
                      : selectedItemInfo?.description}
                  </DialogDescription>
                </div>
                {selectedItem?.type === "mcp" && (
                  <Button
                    size="sm"
                    variant={selectedTools.some((t) => t.installed) ? "outline" : "default"}
                    onClick={() => {
                      const isInstalled = selectedTools.some((t) => t.installed);
                      handleToggleMcp(selectedItem.id, isInstalled);
                    }}
                    disabled={installing.has(selectedItem.id)}
                  >
                    {installing.has(selectedItem.id)
                      ? "..."
                      : selectedTools.some((t) => t.installed)
                      ? "Disable All"
                      : "Enable All"}
                  </Button>
                )}
                {selectedItem?.type === "category" && (
                  <Button
                    size="sm"
                    variant={selectedTools.some((t) => t.installed) ? "outline" : "default"}
                    onClick={() => {
                      const isInstalled = selectedTools.some((t) => t.installed);
                      handleToggleAllCategoryTools(selectedItem.id, isInstalled);
                    }}
                    disabled={selectedTools.some((t) => installing.has(t.id))}
                  >
                    {selectedTools.some((t) => installing.has(t.id))
                      ? "..."
                      : selectedTools.some((t) => t.installed)
                      ? "Disable All"
                      : "Enable All"}
                  </Button>
                )}
              </div>
            </DialogHeader>
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {loadingDetails ? (
              <div className="text-sm text-muted-foreground text-center py-8 px-6">
                Loading details...
              </div>
            ) : (
              <Tabs defaultValue="description" className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-6 pt-4">
                  <TabsList>
                    <TabsTrigger value="description">
                      <Info className="h-4 w-4 mr-2" />
                      Description
                    </TabsTrigger>
                    <TabsTrigger value="tools">
                      <Wrench className="h-4 w-4 mr-2" />
                      Tools ({selectedTools.length})
                    </TabsTrigger>
                    {selectedItem?.type === "mcp" && (
                      <TabsTrigger value="configuration">
                        <Settings className="h-4 w-4 mr-2" />
                        Configuration
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                <TabsContent value="description" className="space-y-4 overflow-y-auto flex-1 px-6 pb-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-sm mb-2">Description</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedItem?.type === "mcp" 
                          ? (mcpDetails?.description || "No description available.")
                          : (selectedItemInfo?.description || "No description available.")}
                      </p>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-sm mb-2">Status</h3>
                      <div className="flex items-center gap-2">
                        {selectedItem?.type === "mcp" ? (
                          <>
                            <Badge variant={mcpDetails?.enabled ? "default" : "outline"}>
                              {mcpDetails?.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {selectedTools.filter((t) => t.installed).length} of {selectedTools.length} tools installed
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {selectedTools.filter((t) => t.installed).length} of {selectedTools.length} tools installed
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedItem?.type === "mcp" && mcpDetails && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2">Command</h3>
                        <div className="bg-muted rounded-lg p-3 font-mono text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-muted-foreground">$</span>
                            <span>{mcpDetails.command}</span>
                          </div>
                          {mcpDetails.args.length > 0 && (
                            <div className="ml-4 text-muted-foreground">
                              {mcpDetails.args.join(" ")}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="tools" className="space-y-4 overflow-y-auto flex-1 px-6 pb-6">
                  <div className="space-y-3">
                    {selectedTools.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        {selectedItem?.type === "mcp" 
                          ? "No tools available from this MCP server"
                          : "No tools available in this category"}
                      </div>
                    ) : (
                      selectedTools.map((tool) => (
                        <div
                          key={tool.id}
                          className="border border-border rounded-lg p-4 bg-card/50 hover:bg-card/70 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold text-sm">{tool.name}</h4>
                                {tool.riskLevel && (
                                  <Badge
                                    variant="outline"
                                    className={
                                      tool.riskLevel === "high"
                                        ? "border-red-500/60 text-red-400"
                                        : tool.riskLevel === "medium"
                                        ? "border-amber-400/60 text-amber-300"
                                        : "border-emerald-500/50 text-emerald-300"
                                    }
                                  >
                                    {tool.riskLevel}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {tool.source === "mcp" ? "MCP" : tool.source}
                                </Badge>
                                {tool.category && tool.category !== "mcp" && (
                                  <Badge variant="outline" className="text-xs">
                                    {tool.category}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Status:</span>
                                  <span>{tool.installed ? "Installed" : "Not installed"}</span>
                                </div>
                                {tool.providerId && (
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">Provider:</span>
                                    <span>{tool.providerId}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={tool.installed ? "outline" : "default"}
                                onClick={() => handleToggleTool(tool.id, tool.installed)}
                                disabled={installing.has(tool.id)}
                              >
                                {installing.has(tool.id) ? (
                                  "..."
                                ) : tool.installed ? (
                                  "Uninstall"
                                ) : (
                                  "Install"
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="configuration" className="space-y-4 overflow-y-auto flex-1 px-6 pb-6">
                {mcpDetails ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-sm mb-2">Execution Configuration</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-[100px]">Command:</span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">{mcpDetails.command}</code>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-[100px]">Arguments:</span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {mcpDetails.args.length > 0 ? mcpDetails.args.join(" ") : "None"}
                          </code>
                        </div>
                        {mcpDetails.cwd && (
                          <div className="flex items-start gap-2">
                            <span className="font-medium min-w-[100px]">Working Dir:</span>
                            <code className="bg-muted px-2 py-1 rounded text-xs">{mcpDetails.cwd}</code>
                          </div>
                        )}
                      </div>
                    </div>

                    {mcpDetails.env && Object.keys(mcpDetails.env).length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2">Environment Variables</h3>
                        <div className="bg-muted rounded-lg p-3 space-y-1">
                          {Object.entries(mcpDetails.env).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-2 text-xs font-mono">
                              <span className="text-muted-foreground min-w-[150px]">{key}:</span>
                              <span className="break-all">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="font-semibold text-sm mb-2">Default Policy</h3>
                      <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Sensitivity:</span>
                          <Badge
                            variant="outline"
                            className={
                              mcpDetails.defaultPolicy.sensitivity === "high"
                                ? "border-red-500/60 text-red-400"
                                : mcpDetails.defaultPolicy.sensitivity === "medium"
                                ? "border-amber-400/60 text-amber-300"
                                : "border-emerald-500/50 text-emerald-300"
                            }
                          >
                            {mcpDetails.defaultPolicy.sensitivity}
                          </Badge>
                        </div>
                        <div>
                          <span className="font-medium">Allowed Roles:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {mcpDetails.defaultPolicy.allowedRoles.map((role) => (
                              <Badge key={role} variant="outline" className="text-xs">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {mcpDetails.disabledTools && mcpDetails.disabledTools.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2">Disabled Tools</h3>
                        <div className="bg-muted rounded-lg p-3">
                          <div className="flex flex-wrap gap-2">
                            {mcpDetails.disabledTools.map((toolName) => (
                              <Badge key={toolName} variant="outline" className="text-xs border-red-500/60 text-red-400">
                                {toolName}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            These tools are disabled and will not be registered even if the MCP server is enabled.
                          </p>
                        </div>
                      </div>
                    )}

                    {mcpDetails.toolPolicyOverrides && Object.keys(mcpDetails.toolPolicyOverrides).length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2">Tool Policy Overrides</h3>
                        <div className="space-y-2">
                          {Object.entries(mcpDetails.toolPolicyOverrides).map(([toolName, override]) => (
                            <div key={toolName} className="border border-border rounded-lg p-3">
                              <div className="font-medium text-sm mb-2">{toolName}</div>
                              <div className="space-y-1 text-xs">
                                {override.sensitivity && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Sensitivity:</span>
                                    <Badge
                                      variant="outline"
                                      className={
                                        override.sensitivity === "high"
                                          ? "border-red-500/60 text-red-400"
                                          : override.sensitivity === "medium"
                                          ? "border-amber-400/60 text-amber-300"
                                          : "border-emerald-500/50 text-emerald-300"
                                      }
                                    >
                                      {override.sensitivity}
                                    </Badge>
                                  </div>
                                )}
                                {override.allowedRoles && (
                                  <div>
                                    <span className="text-muted-foreground">Allowed Roles:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {override.allowedRoles.map((role) => (
                                        <Badge key={role} variant="outline" className="text-xs">
                                          {role}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Configuration not available
                  </div>
                )}
              </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
