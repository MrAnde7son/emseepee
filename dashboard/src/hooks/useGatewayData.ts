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

export function usePolicies() {
  return useQuery({
    queryKey: ["policies"],
    queryFn: () => Api.getPolicies(),
  });
}

export function useEvents(search: string) {
  return useQuery({
    queryKey: ["events", search],
    queryFn: () => Api.getEvents(search ? { q: search } : undefined),
  });
}

