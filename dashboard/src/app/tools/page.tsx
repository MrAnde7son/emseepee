"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Edit,
  Save,
  X,
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";

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
    id: "web",
    name: "Web Operations",
    description: "Web search capabilities",
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
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Initialize from URL params
  const initialPage = parseInt(searchParams.get("page") || "1", 10);
  const initialSearch = searchParams.get("q") || "";
  
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const pageSize = 50;
  const { data: toolsResponse, isLoading, refetch } = useTools(currentPage, pageSize, searchQuery);
  const tools = toolsResponse?.data;
  
  const isUpdatingFromUrl = React.useRef(false);
  const prevSearchParamsRef = React.useRef<string>("");
  
  // Sync state from URL params when they change externally (e.g., browser back/forward)
  useEffect(() => {
    const currentParamsString = searchParams.toString();
    
    // Only update if searchParams actually changed
    if (currentParamsString === prevSearchParamsRef.current) {
      return;
    }
    
    prevSearchParamsRef.current = currentParamsString;

    const urlPage = parseInt(searchParams.get("page") || "1", 10);
    const urlSearch = searchParams.get("q") || "";

    // Check if URL params differ from current state
    const pageChanged = urlPage !== currentPage;
    const searchChanged = urlSearch !== searchQuery;

    if (pageChanged || searchChanged) {
      isUpdatingFromUrl.current = true;
      
      if (pageChanged) {
        setCurrentPage(urlPage);
      }
      if (searchChanged) {
        setSearchQuery(urlSearch);
      }
      
      // Reset flag after state updates
      setTimeout(() => {
        isUpdatingFromUrl.current = false;
      }, 0);
    }
  }, [searchParams, currentPage, searchQuery]);
  
  // Update URL when page or search change (but not when updating from URL)
  useEffect(() => {
    if (isUpdatingFromUrl.current) {
      return;
    }

    const params = new URLSearchParams();
    
    if (searchQuery) {
      params.set("q", searchQuery);
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
  }, [searchQuery, currentPage, router]);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<{ type: "category" | "mcp"; id: string } | null>(null);
  const [mcpDetails, setMcpDetails] = useState<McpServerDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [mcpIcons, setMcpIcons] = useState<Map<string, string>>(new Map());
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editedConfig, setEditedConfig] = useState<Partial<McpServerDetails>>({});
  const [updatingConfig, setUpdatingConfig] = useState(false);

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
    
    const mcpMap = new Map<string, { tools: Tool[]; installed: boolean; hasPlaceholder: boolean }>();
    
    tools.forEach((tool) => {
      if (tool.source === "mcp" && tool.providerId) {
        // Check if this is a placeholder tool (id starts with "mcp-")
        const isPlaceholder = tool.id.startsWith("mcp-");
        const existing = mcpMap.get(tool.providerId) || { tools: [], installed: tool.installed, hasPlaceholder: false };
        
        if (isPlaceholder) {
          existing.hasPlaceholder = true;
        } else {
          existing.tools.push(tool);
        }
        
        // If any tool from this MCP is installed, consider the MCP installed
        if (tool.installed) {
          existing.installed = true;
        }
        mcpMap.set(tool.providerId, existing);
      }
    });
    
    return Array.from(mcpMap.entries()).map(([id, data]) => {
      // If only placeholder exists, show a message about installing to discover tools
      const actualToolCount = data.tools.length;
      const description = data.hasPlaceholder && actualToolCount === 0
        ? "Install to discover available tools"
        : `MCP server with ${actualToolCount} tool${actualToolCount !== 1 ? "s" : ""}`;
      
      return {
        id,
        name: id,
        description,
        toolCount: actualToolCount,
        installed: data.installed,
        hasPlaceholder: data.hasPlaceholder,
      };
    });
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

  // Get tools for selected item (filter out placeholder tools)
  const selectedTools = useMemo(() => {
    if (!selectedItem || !tools) return [];
    if (selectedItem.type === "category") {
      return toolsByCategory[selectedItem.id] || [];
    } else {
      return tools.filter((tool) => 
        tool.source === "mcp" && 
        tool.providerId === selectedItem.id &&
        !tool.id.startsWith("mcp-") // Exclude placeholder tools
      );
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
      setIsEditingConfig(false);
      setEditedConfig({});
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
      setIsEditingConfig(false);
      setEditedConfig({});
    }
  }, [selectedItem]);

  const handleStartEdit = () => {
    if (mcpDetails) {
      setEditedConfig({
        ...mcpDetails,
        defaultPolicy: {
          ...mcpDetails.defaultPolicy,
        },
      });
      setIsEditingConfig(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingConfig(false);
    setEditedConfig({});
  };

  const handleSaveConfig = async () => {
    if (!selectedItem || selectedItem.type !== "mcp" || !mcpDetails) return;
    
    // Clean up the config before saving
    const cleanedConfig: Partial<McpServerDetails> = { ...editedConfig };
    
    // Filter out empty roles
    if (cleanedConfig.defaultPolicy?.allowedRoles) {
      cleanedConfig.defaultPolicy.allowedRoles = cleanedConfig.defaultPolicy.allowedRoles.filter(role => role.trim() !== "");
    }
    
    // Filter out empty env vars
    if (cleanedConfig.env) {
      const cleanedEnv: Record<string, string> = {};
      Object.entries(cleanedConfig.env).forEach(([key, value]) => {
        if (key.trim() !== "" && value.trim() !== "") {
          cleanedEnv[key.trim()] = value.trim();
        }
      });
      cleanedConfig.env = Object.keys(cleanedEnv).length > 0 ? cleanedEnv : undefined;
    }
    
    // Remove empty cwd
    if (cleanedConfig.cwd?.trim() === "") {
      cleanedConfig.cwd = undefined;
    }
    
    setUpdatingConfig(true);
    try {
      const updated = await Api.updateMcpServerConfig(selectedItem.id, cleanedConfig);
      setMcpDetails(updated);
      setIsEditingConfig(false);
      setEditedConfig({});
      await refetch(); // Refresh tools list
    } catch (error) {
      console.error("Failed to update MCP server configuration:", error);
      alert(`Failed to update configuration: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUpdatingConfig(false);
    }
  };

  // Combine categories and MCP servers into unified items
  const allItems = useMemo(() => {
    if (!tools) return [];
    
    const items: Array<{ type: "category" | "mcp"; id: string; name: string; description: string; icon: React.ComponentType<{ className?: string }> | string; color: string; toolCount: number; installedCount: number }> = [];
    
    // Add categories (only if they have tools)
    categories.forEach((cat) => {
      const categoryTools = toolsByCategory[cat.id] || [];
      // Only add category if it has at least one tool
      if (categoryTools.length > 0) {
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
      }
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

  // Items are already filtered by backend search, so use allItems directly
  const filteredItems = allItems;

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
                // Filter out placeholder tools (id starts with "mcp-")
                const itemTools = item.type === "category" 
                  ? (toolsByCategory[item.id] || [])
                  : ((tools || []).filter((t) => 
                      t.source === "mcp" && 
                      t.providerId === item.id && 
                      !t.id.startsWith("mcp-")
                    ));
                
                // Check if this is an MCP server with only placeholder (not installed)
                const mcpServer = mcpServers.find(m => m.id === item.id);
                const isUninstalledMcp = item.type === "mcp" && mcpServer?.hasPlaceholder && itemTools.length === 0;

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
                      {!isUninstalledMcp && (
                        <Badge variant="outline" className="text-xs">
                          {item.installedCount}/{item.toolCount} installed
                        </Badge>
                      )}
                      {isUninstalledMcp && (
                        <Badge variant="outline" className="text-xs">
                          Not installed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">{item.name}</h3>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {item.description}
                    </p>
                    <div className="space-y-2">
                      {isUninstalledMcp ? (
                        <p className="text-xs text-muted-foreground italic">
                          Install this MCP server to discover and use its tools
                        </p>
                      ) : itemTools.length > 0 ? (
                        <>
                          {itemTools.slice(0, 3).map((tool) => (
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
                          ))}
                          {itemTools.length > 3 && (
                            <p className="text-xs text-muted-foreground pt-2">
                              +{itemTools.length - 3} more tools
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No tools available
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

          {toolsResponse && toolsResponse.totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={toolsResponse.totalPages}
              totalItems={toolsResponse.total}
              pageSize={pageSize}
              onPageChange={(page) => {
                setCurrentPage(page);
                setSelectedItem(null); // Close detail dialog when changing pages
                // Scroll to top when page changes
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="mt-6"
            />
          )}
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
                            {selectedTools.length > 0 ? (
                              <span className="text-sm text-muted-foreground">
                                {selectedTools.filter((t) => t.installed).length} of {selectedTools.length} tools installed
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Install to discover available tools
                              </span>
                            )}
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
                        {selectedItem?.type === "mcp" ? (
                          <div className="space-y-4">
                            <p>This MCP server is not installed yet.</p>
                            <p className="text-xs">
                              Install it to discover and use its available tools.
                            </p>
                            {mcpDetails && !mcpDetails.enabled && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => {
                                  handleToggleMcp(selectedItem.id, false);
                                }}
                                disabled={installing.has(selectedItem.id)}
                                className="mt-2"
                              >
                                {installing.has(selectedItem.id)
                                  ? "Installing..."
                                  : "Install MCP Server"}
                              </Button>
                            )}
                          </div>
                        ) : (
                          "No tools available in this category"
                        )}
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
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Configuration</h3>
                      {!isEditingConfig ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleStartEdit}
                          className="gap-2"
                        >
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                            disabled={updatingConfig}
                            className="gap-2"
                          >
                            <X className="h-4 w-4" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveConfig}
                            disabled={updatingConfig}
                            className="gap-2"
                          >
                            <Save className="h-4 w-4" />
                            {updatingConfig ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold text-sm mb-2">Execution Configuration</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-[100px] pt-2">Command:</span>
                          {isEditingConfig ? (
                            <Input
                              value={editedConfig.command || ""}
                              onChange={(e) => setEditedConfig({ ...editedConfig, command: e.target.value })}
                              className="flex-1"
                              placeholder="e.g., npx, node"
                            />
                          ) : (
                            <code className="bg-muted px-2 py-1 rounded text-xs">{mcpDetails.command}</code>
                          )}
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-[100px] pt-2">Arguments:</span>
                          {isEditingConfig ? (
                            <Input
                              value={editedConfig.args?.join(" ") || ""}
                              onChange={(e) => setEditedConfig({ 
                                ...editedConfig, 
                                args: e.target.value.split(" ").filter(Boolean) 
                              })}
                              className="flex-1"
                              placeholder="Space-separated arguments"
                            />
                          ) : (
                            <code className="bg-muted px-2 py-1 rounded text-xs">
                              {mcpDetails.args.length > 0 ? mcpDetails.args.join(" ") : "None"}
                            </code>
                          )}
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-[100px] pt-2">Working Dir:</span>
                          {isEditingConfig ? (
                            <Input
                              value={editedConfig.cwd || ""}
                              onChange={(e) => setEditedConfig({ ...editedConfig, cwd: e.target.value || undefined })}
                              className="flex-1"
                              placeholder="Optional working directory"
                            />
                          ) : (
                            <code className="bg-muted px-2 py-1 rounded text-xs">
                              {mcpDetails.cwd || "Not set"}
                            </code>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-sm mb-2">Environment Variables</h3>
                      {isEditingConfig ? (
                        <div className="space-y-2">
                          {editedConfig.env && Object.keys(editedConfig.env).length > 0 ? (
                            Object.entries(editedConfig.env).map(([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <Input
                                  value={key}
                                  onChange={(e) => {
                                    const newEnv = { ...editedConfig.env };
                                    delete newEnv[key];
                                    newEnv[e.target.value] = value;
                                    setEditedConfig({ ...editedConfig, env: newEnv });
                                  }}
                                  className="flex-1"
                                  placeholder="Variable name"
                                />
                                <Input
                                  value={value}
                                  onChange={(e) => {
                                    setEditedConfig({
                                      ...editedConfig,
                                      env: { ...editedConfig.env, [key]: e.target.value },
                                    });
                                  }}
                                  className="flex-1"
                                  placeholder="Variable value"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const newEnv = { ...editedConfig.env };
                                    delete newEnv[key];
                                    setEditedConfig({ ...editedConfig, env: newEnv });
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground">No environment variables</p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditedConfig({
                                ...editedConfig,
                                env: { ...editedConfig.env, "": "" },
                              });
                            }}
                          >
                            Add Environment Variable
                          </Button>
                        </div>
                      ) : (
                        mcpDetails.env && Object.keys(mcpDetails.env).length > 0 ? (
                          <div className="bg-muted rounded-lg p-3 space-y-1">
                            {Object.entries(mcpDetails.env).map(([key, value]) => (
                              <div key={key} className="flex items-start gap-2 text-xs font-mono">
                                <span className="text-muted-foreground min-w-[150px]">{key}:</span>
                                <span className="break-all">{value}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No environment variables</p>
                        )
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold text-sm mb-2">Default Policy</h3>
                      <div className="bg-muted rounded-lg p-3 space-y-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Sensitivity:</span>
                          {isEditingConfig ? (
                            <Select
                              value={editedConfig.defaultPolicy?.sensitivity || mcpDetails.defaultPolicy.sensitivity}
                              onValueChange={(value) => {
                                setEditedConfig({
                                  ...editedConfig,
                                  defaultPolicy: {
                                    ...(editedConfig.defaultPolicy || mcpDetails.defaultPolicy),
                                    sensitivity: value as "low" | "medium" | "high",
                                  },
                                });
                              }}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
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
                          )}
                        </div>
                        <div>
                          <span className="font-medium">Allowed Roles:</span>
                          {isEditingConfig ? (
                            <div className="mt-2 space-y-2">
                              {(editedConfig.defaultPolicy?.allowedRoles || mcpDetails.defaultPolicy.allowedRoles).map((role, index) => (
                                <div key={index} className="flex gap-2">
                                  <Input
                                    value={role}
                                    onChange={(e) => {
                                      const roles = [...(editedConfig.defaultPolicy?.allowedRoles || mcpDetails.defaultPolicy.allowedRoles)];
                                      roles[index] = e.target.value;
                                      setEditedConfig({
                                        ...editedConfig,
                                        defaultPolicy: {
                                          ...(editedConfig.defaultPolicy || mcpDetails.defaultPolicy),
                                          allowedRoles: roles,
                                        },
                                      });
                                    }}
                                    className="flex-1"
                                    placeholder="Role name"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const roles = [...(editedConfig.defaultPolicy?.allowedRoles || mcpDetails.defaultPolicy.allowedRoles)];
                                      roles.splice(index, 1);
                                      setEditedConfig({
                                        ...editedConfig,
                                        defaultPolicy: {
                                          ...(editedConfig.defaultPolicy || mcpDetails.defaultPolicy),
                                          allowedRoles: roles,
                                        },
                                      });
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditedConfig({
                                    ...editedConfig,
                                    defaultPolicy: {
                                      ...(editedConfig.defaultPolicy || mcpDetails.defaultPolicy),
                                      allowedRoles: [
                                        ...(editedConfig.defaultPolicy?.allowedRoles || mcpDetails.defaultPolicy.allowedRoles),
                                        "",
                                      ],
                                    },
                                  });
                                }}
                              >
                                Add Role
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {mcpDetails.defaultPolicy.allowedRoles.map((role) => (
                                <Badge key={role} variant="outline" className="text-xs">
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isEditingConfig && mcpDetails.disabledTools && mcpDetails.disabledTools.length > 0 && (
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
