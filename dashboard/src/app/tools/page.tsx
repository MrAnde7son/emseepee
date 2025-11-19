"use client";

import { useState, useMemo } from "react";
import { useTools } from "@/hooks/useGatewayData";
import { Tool } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface GroupedTools {
  providerId: string | null;
  providerName: string;
  tools: Tool[];
}

export default function ToolsPage() {
  const { data, isLoading } = useTools();
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Group tools by providerId (MCP)
  const groupedTools = useMemo(() => {
    if (!data) return [];

    // Filter tools based on search query
    const filtered = data.filter((tool) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        tool.name.toLowerCase().includes(query) ||
        tool.providerId?.toLowerCase().includes(query) ||
        tool.source.toLowerCase().includes(query) ||
        tool.category?.toLowerCase().includes(query)
      );
    });

    // Group by providerId
    const groups = new Map<string | null, Tool[]>();
    
    filtered.forEach((tool) => {
      const key = tool.providerId || null;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(tool);
    });

    // Convert to array and format
    const result: GroupedTools[] = [];
    
    groups.forEach((tools, providerId) => {
      if (providerId === null) {
        // Separate built-in and third-party tools
        const builtinTools = tools.filter(t => t.source === "builtin");
        const thirdPartyTools = tools.filter(t => t.source === "third-party");
        
        if (builtinTools.length > 0) {
          result.push({
            providerId: null,
            providerName: "Built-in Tools",
            tools: builtinTools,
          });
        }
        
        if (thirdPartyTools.length > 0) {
          result.push({
            providerId: null,
            providerName: "Third-party Tools",
            tools: thirdPartyTools,
          });
        }
      } else {
        // MCP providers
        result.push({
          providerId,
          providerName: providerId,
          tools,
        });
      }
    });

    // Sort: built-in first, then third-party, then MCP providers alphabetically
    result.sort((a, b) => {
      if (a.providerName === "Built-in Tools") return -1;
      if (b.providerName === "Built-in Tools") return 1;
      if (a.providerName === "Third-party Tools") return -1;
      if (b.providerName === "Third-party Tools") return 1;
      return a.providerName.localeCompare(b.providerName);
    });

    return result;
  }, [data, searchQuery]);

  // Get section key for tracking expanded state
  const getSectionKey = (group: GroupedTools) => {
    return group.providerId || group.providerName.toLowerCase().replace(/\s+/g, "-");
  };

  // Toggle section expanded state
  const toggleSection = (group: GroupedTools) => {
    const key = getSectionKey(group);
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key); // Expand: remove from collapsed set
      } else {
        next.add(key); // Collapse: add to collapsed set
      }
      return next;
    });
  };

  // Check if section is expanded (default to true - all sections start expanded)
  const isExpanded = (group: GroupedTools) => {
    const key = getSectionKey(group);
    // If key is in collapsed set, section is collapsed
    // Otherwise, section is expanded (default)
    return !collapsedSections.has(key);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Library</h1>
          <p className="text-xs text-muted-foreground">
            Built-in and 3rd party tools discovered across providers. Install and govern
            them centrally.
          </p>
        </div>
        <Button size="sm" onClick={() => { /* TODO: open marketplace / add MCP */ }}>
          Install from library
        </Button>
      </div>

      {/* Search/Filter */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search tools by name, provider, source, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
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

      {isLoading && <div className="text-sm text-muted-foreground">Loading tools...</div>}

      {!isLoading && groupedTools.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          {searchQuery ? "No tools found matching your search." : "No tools available."}
        </div>
      )}

      {groupedTools.length > 0 && (
        <div className="space-y-4">
          {groupedTools.map((group) => (
            <div
              key={group.providerId || group.providerName.toLowerCase().replace(/\s+/g, "-")}
              className="border border-border rounded-xl overflow-hidden"
            >
              {/* MCP/Built-in Header */}
              <button
                onClick={() => toggleSection(group)}
                className="w-full bg-muted/30 px-4 py-3 border-b border-border hover:bg-muted/40 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <svg
                      className={`w-4 h-4 text-muted-foreground transition-transform ${
                        isExpanded(group) ? "rotate-90" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {group.providerName}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.tools.length} {group.tools.length === 1 ? "tool" : "tools"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.providerId && (
                      <Badge variant="outline" className="text-xs">
                        MCP
                      </Badge>
                    )}
                    {!group.providerId && group.providerName === "Third-party Tools" && (
                      <Badge variant="outline" className="text-xs">
                        3rd Party
                      </Badge>
                    )}
                  </div>
                </div>
              </button>

              {/* Tools List */}
              {isExpanded(group) && (
                <div className="divide-y divide-border">
                {group.tools.map((tool) => (
                  <div
                    key={tool.id}
                    className="px-4 py-3 bg-card/50 hover:bg-card/70 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-foreground">
                            {tool.name}
                          </span>
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
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-mono">{tool.source}</span>
                          {tool.category && (
                            <>
                              <span>•</span>
                              <span>{tool.category}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {tool.installed ? (
                          <Button size="sm" variant="outline" className="text-xs">
                            Uninstall
                          </Button>
                        ) : (
                          <Button size="sm" className="text-xs">Install</Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

