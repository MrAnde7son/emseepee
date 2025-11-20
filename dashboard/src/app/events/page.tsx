"use client";

import { useState, useMemo } from "react";

import { useEvents } from "@/hooks/useGatewayData";

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

import { ShieldAlert, Filter, X } from "lucide-react";

interface EventFilters {
  decisions: string[];
  providers: string[];
  agents: string[];
  riskLevels: string[];
}

export default function EventsPage() {
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<EventFilters>({
    decisions: [],
    providers: [],
    agents: [],
    riskLevels: [],
  });

  const { data, isLoading } = useEvents(search);

  const onSearchChange = (value: string) => {
    setSearch(value);
  };

  // Extract unique values for filter options
  const filterOptions = useMemo(() => {
    if (!data) return { providers: [], decisions: [], agents: [], riskLevels: [] };
    
    const providers = Array.from(new Set(data.map((e) => e.provider))).sort();
    const decisions = Array.from(new Set(data.map((e) => e.decision))).sort();
    const agents = Array.from(new Set(data.map((e) => e.agentId))).sort();
    const riskLevels = Array.from(
      new Set(
        data
          .map((e) => e.riskLevel)
          .filter((r): r is "low" | "medium" | "high" => 
            r === "low" || r === "medium" || r === "high"
          )
      )
    ).sort();
    
    return { providers, decisions, agents, riskLevels };
  }, [data]);

  // Apply filters to data
  const filteredData = useMemo(() => {
    if (!data) return [];
    
    return data.filter((event) => {
      // Filter by decision
      if (filters.decisions.length > 0 && !filters.decisions.includes(event.decision)) {
        return false;
      }
      
      // Filter by provider
      if (filters.providers.length > 0 && !filters.providers.includes(event.provider)) {
        return false;
      }
      
      // Filter by agent
      if (filters.agents.length > 0 && !filters.agents.includes(event.agentId)) {
        return false;
      }
      
      // Filter by risk level
      if (filters.riskLevels.length > 0) {
        if (!event.riskLevel || !filters.riskLevels.includes(event.riskLevel)) {
          return false;
        }
      }
      
      return true;
    });
  }, [data, filters]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return filters.decisions.length + filters.providers.length + filters.agents.length + filters.riskLevels.length;
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

  const clearFilters = () => {
    setFilters({
      decisions: [],
      providers: [],
      agents: [],
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

      {!isLoading && data && data.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          No events yet. Once agents start calling tools through the gateway, they&apos;ll
          appear here.
        </div>
      )}

      {!isLoading && filteredData && filteredData.length === 0 && data && data.length > 0 && (
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

      {/* Filters Sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Filter Events</SheetTitle>
            <SheetDescription>
              Filter events by decision, provider, agent, or risk level
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

