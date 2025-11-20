"use client";

import { useState, useMemo, useEffect, useRef, startTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useEvents } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";

import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Checkbox } from "@/components/ui/checkbox";
import { Pagination } from "@/components/ui/pagination";

import { ShieldAlert, Filter, X } from "lucide-react";

interface EventFilters {
  decisions: string[];
  providers: string[];
  agents: string[];
  tools: string[];
  riskLevels: string[];
}

export default function EventsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Initialize from URL params
  const initialSearch = searchParams.get("q") || "";
  const initialDecisions = searchParams.get("decision")?.split(",").filter(Boolean) || [];
  const initialProvider = searchParams.get("provider") || "";
  const initialAgent = searchParams.get("agent") || "";
  const initialTool = searchParams.get("tool") || "";
  const initialRiskLevels = searchParams.get("risk")?.split(",").filter(Boolean) || [];
  const initialPage = parseInt(searchParams.get("page") || "1", 10);

  const [search, setSearch] = useState(initialSearch);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<EventFilters>({
    decisions: initialDecisions,
    providers: initialProvider ? [initialProvider] : [],
    agents: initialAgent ? [initialAgent] : [],
    tools: initialTool ? [initialTool] : [],
    riskLevels: initialRiskLevels,
  });

  const [currentPage, setCurrentPage] = useState(initialPage);
  const pageSize = 50;
  const eventFilters = {
    decision: filters.decisions.length > 0 ? filters.decisions : undefined,
    provider: filters.providers.length > 0 ? filters.providers[0] : undefined,
    agent: filters.agents.length > 0 ? filters.agents[0] : undefined,
    tool: filters.tools.length > 0 ? filters.tools[0] : undefined,
    risk: filters.riskLevels.length > 0 ? filters.riskLevels : undefined,
  };
  const { data, isLoading } = useEvents(search, currentPage, pageSize, eventFilters);
  const isUpdatingFromUrl = useRef(false);
  const prevSearchParamsRef = useRef<string>("");

  // Sync state from URL params when they change externally (e.g., browser back/forward)
  useEffect(() => {
    const currentParamsString = searchParams.toString();
    
    // Only update if searchParams actually changed
    if (currentParamsString === prevSearchParamsRef.current) {
      return;
    }
    
    prevSearchParamsRef.current = currentParamsString;

    const urlSearch = searchParams.get("q") || "";
    const urlDecisions = searchParams.get("decision")?.split(",").filter(Boolean) || [];
    const urlProvider = searchParams.get("provider") || "";
    const urlAgent = searchParams.get("agent") || "";
    const urlTool = searchParams.get("tool") || "";
    const urlRiskLevels = searchParams.get("risk")?.split(",").filter(Boolean) || [];
    const urlPage = parseInt(searchParams.get("page") || "1", 10);

    const urlProviderArray = urlProvider ? [urlProvider] : [];
    const urlAgentArray = urlAgent ? [urlAgent] : [];
    const urlToolArray = urlTool ? [urlTool] : [];

    // Check if URL params differ from current state
    const searchChanged = urlSearch !== search;
    const decisionsChanged = JSON.stringify(urlDecisions) !== JSON.stringify(filters.decisions);
    const providersChanged = JSON.stringify(urlProviderArray) !== JSON.stringify(filters.providers);
    const agentsChanged = JSON.stringify(urlAgentArray) !== JSON.stringify(filters.agents);
    const toolsChanged = JSON.stringify(urlToolArray) !== JSON.stringify(filters.tools);
    const riskLevelsChanged = JSON.stringify(urlRiskLevels) !== JSON.stringify(filters.riskLevels);
    const pageChanged = urlPage !== currentPage;

    if (searchChanged || decisionsChanged || providersChanged || agentsChanged || toolsChanged || riskLevelsChanged || pageChanged) {
      isUpdatingFromUrl.current = true;
      
      startTransition(() => {
        if (searchChanged) {
          setSearch(urlSearch);
        }

        if (decisionsChanged || providersChanged || agentsChanged || toolsChanged || riskLevelsChanged) {
          setFilters({
            decisions: urlDecisions,
            providers: urlProviderArray,
            agents: urlAgentArray,
            tools: urlToolArray,
            riskLevels: urlRiskLevels,
          });
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

  // Update URL when filters or search change (but not when updating from URL)
  useEffect(() => {
    if (isUpdatingFromUrl.current) {
      return;
    }

    const params = new URLSearchParams();
    
    if (search) {
      params.set("q", search);
    }
    
    if (filters.decisions.length > 0) {
      params.set("decision", filters.decisions.join(","));
    }
    
    if (filters.providers.length > 0) {
      params.set("provider", filters.providers[0]);
    }
    
    if (filters.agents.length > 0) {
      params.set("agent", filters.agents[0]);
    }
    
    if (filters.tools.length > 0) {
      params.set("tool", filters.tools[0]);
    }
    
    if (filters.riskLevels.length > 0) {
      params.set("risk", filters.riskLevels.join(","));
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
  }, [search, filters, currentPage, router]);

  const onSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1); // Reset to first page on search
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, search]);

  // Fetch filter options from backend (all unique values across all events)
  const { data: filterOptionsData } = useQuery({
    queryKey: ["eventFilterOptions"],
    queryFn: () => Api.getEventFilterOptions(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  const filterOptions = useMemo(() => {
    return filterOptionsData || { providers: [], decisions: [], agents: [], tools: [], riskLevels: [] };
  }, [filterOptionsData]);

  // Use data directly from backend (already filtered)
  const filteredData = data?.data || [];

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return filters.decisions.length + filters.providers.length + filters.agents.length + filters.tools.length + filters.riskLevels.length;
  }, [filters]);

  const toggleDecision = (decision: string) => {
    setFilters((prev) => ({
      ...prev,
      decisions: prev.decisions.includes(decision)
        ? prev.decisions.filter((d) => d !== decision)
        : [...prev.decisions, decision],
    }));
  };

  const toggleRiskLevel = (riskLevel: string) => {
    setFilters((prev) => ({
      ...prev,
      riskLevels: prev.riskLevels.includes(riskLevel)
        ? prev.riskLevels.filter((r) => r !== riskLevel)
        : [...prev.riskLevels, riskLevel],
    }));
  };

  const setProvider = (provider: string) => {
    setFilters((prev) => ({
      ...prev,
      providers: provider === "all" ? [] : [provider],
    }));
  };

  const setAgent = (agent: string) => {
    setFilters((prev) => ({
      ...prev,
      agents: agent === "all" ? [] : [agent],
    }));
  };

  const setTool = (tool: string) => {
    setFilters((prev) => ({
      ...prev,
      tools: tool === "all" ? [] : [tool],
    }));
  };

  const clearFilters = () => {
    setFilters({
      decisions: [],
      providers: [],
      agents: [],
      tools: [],
      riskLevels: [],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-xs text-muted-foreground">
            Explore all gateway activity. Search and inspect decisions per tool call.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search agent, tool, provider, intent…"
            className="h-8 w-56 text-xs"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 relative"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading events…</div>}

      {!isLoading && (!data?.data || data.data.length === 0) && (
        <div className="border border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          No events yet. Once agents start calling tools through the gateway, they&apos;ll
          appear here.
        </div>
      )}

      {!isLoading && filteredData && filteredData.length === 0 && data && data.data.length > 0 && (
        <div className="border border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          No events match the current filters. Try adjusting your filter criteria.
        </div>
      )}

      {filteredData && filteredData.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted">
                <TableHead className="text-xs text-muted-foreground">Timestamp</TableHead>
                <TableHead className="text-xs text-muted-foreground">Agent</TableHead>
                <TableHead className="text-xs text-muted-foreground">Provider</TableHead>
                <TableHead className="text-xs text-muted-foreground">Tool / intent</TableHead>
                <TableHead className="text-xs text-muted-foreground">Decision</TableHead>
                <TableHead className="text-xs text-muted-foreground">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-[11px] text-foreground">
                    {new Date(e.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-foreground">
                    {e.agentId}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {e.provider}
                  </TableCell>
                  <TableCell className="text-[11px] text-foreground">
                    <span className="font-mono text-[11px]">{e.toolName}</span>
                    {e.intentSummary && (
                      <span className="text-muted-foreground"> – {e.intentSummary}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.decision === "deny"
                          ? "destructive"
                          : e.decision === "log"
                          ? "outline"
                          : "default"
                      }
                    >
                      {e.decision}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {e.latencyMs != null ? `${e.latencyMs} ms` : "-"}
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

      {/* Filters Sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Filter Events</SheetTitle>
            <SheetDescription>
              Filter events by decision, provider, agent, tool, or risk level
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-6 px-4">
            {/* Decision Filter */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Decision</h3>
              <div className="space-y-2">
                {filterOptions.decisions.map((decision) => (
                  <div key={decision} className="flex items-center space-x-2">
                    <Checkbox
                      id={`decision-${decision}`}
                      checked={filters.decisions.includes(decision)}
                      onCheckedChange={() => toggleDecision(decision)}
                    />
                    <label
                      htmlFor={`decision-${decision}`}
                      className="text-sm cursor-pointer flex items-center gap-2"
                    >
                      <Badge
                        variant={
                          decision === "deny"
                            ? "destructive"
                            : decision === "log"
                            ? "outline"
                            : "default"
                        }
                        className="text-xs"
                      >
                        {decision}
                      </Badge>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Provider Filter */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Provider</h3>
              <Select
                value={filters.providers.length > 0 ? filters.providers[0] : "all"}
                onValueChange={setProvider}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {filterOptions.providers.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agent Filter */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Agent</h3>
              <Select
                value={filters.agents.length > 0 ? filters.agents[0] : "all"}
                onValueChange={setAgent}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {filterOptions.agents.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      <span className="font-mono text-xs">{agent}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tool Filter */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Tool</h3>
              <Select
                value={filters.tools.length > 0 ? filters.tools[0] : "all"}
                onValueChange={setTool}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All tools" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tools</SelectItem>
                  {filterOptions.tools.map((tool) => (
                    <SelectItem key={tool} value={tool}>
                      <span className="font-mono text-xs">{tool}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Risk Level Filter */}
            {filterOptions.riskLevels.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Risk Level</h3>
                <div className="space-y-2">
                  {filterOptions.riskLevels.map((riskLevel) => (
                    <div key={riskLevel} className="flex items-center space-x-2">
                      <Checkbox
                        id={`risk-${riskLevel}`}
                        checked={filters.riskLevels.includes(riskLevel)}
                        onCheckedChange={() => toggleRiskLevel(riskLevel)}
                      />
                      <label
                        htmlFor={`risk-${riskLevel}`}
                        className="text-sm cursor-pointer flex items-center gap-2"
                      >
                        <Badge
                          variant="outline"
                          className={
                            riskLevel === "high"
                              ? "border-red-500/60 text-red-400"
                              : riskLevel === "medium"
                              ? "border-amber-400/60 text-amber-300"
                              : "border-emerald-500/50 text-emerald-300"
                          }
                        >
                          {riskLevel}
                        </Badge>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clear Filters Button */}
            {activeFilterCount > 0 && (
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

