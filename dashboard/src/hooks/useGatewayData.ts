"use client";

import { useQuery } from "@tanstack/react-query";

import { Api } from "@/lib/api";

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => Api.getProviders(),
  });
}

export function useTools() {
  return useQuery({
    queryKey: ["tools"],
    queryFn: () => Api.getTools(),
  });
}

export function usePolicies(includeArchived?: boolean) {
  return useQuery({
    queryKey: ["policies", includeArchived],
    queryFn: () => Api.getPolicies(includeArchived),
  });
}

export function useEvents(search: string) {
  return useQuery({
    queryKey: ["events", search],
    queryFn: () => Api.getEvents(search ? { q: search } : undefined),
  });
}

