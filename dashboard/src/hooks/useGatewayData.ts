"use client";

import { useQuery } from "@tanstack/react-query";

import { Api } from "@/lib/api";

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => Api.getProviders(),
  });
}

export function useIdpConnections() {
  return useQuery({
    queryKey: ["idp-connections"],
    queryFn: () => Api.getIdpConnections(),
  });
}

export function useTools(page?: number, limit?: number, search?: string) {
  return useQuery({
    queryKey: ["tools", page, limit, search],
    queryFn: () => Api.getTools(page, limit, search),
  });
}

export function usePolicies(includeArchived?: boolean, page?: number, limit?: number, filters?: { search?: string; scope?: string; effect?: string; enabled?: string; priority?: string }) {
  return useQuery({
    queryKey: ["policies", includeArchived, page, limit, filters],
    queryFn: () => Api.getPolicies(includeArchived, page, limit, filters),
  });
}

export function useEvents(search: string, page?: number, limit?: number, filters?: { decision?: string[]; provider?: string; agent?: string; tool?: string; risk?: string[] }) {
  return useQuery({
    queryKey: ["events", search, page, limit, filters],
    queryFn: () => Api.getEvents({ q: search, page, limit, ...filters }),
  });
}

export function useAgents(filters?: { providerId?: string; role?: string; tenantId?: string }) {
  return useQuery({
    queryKey: ["agents", filters],
    queryFn: () => Api.getAgents(filters),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => Api.getUsers(),
  });
}

