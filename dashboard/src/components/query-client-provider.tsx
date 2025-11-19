"use client";

import { ReactNode, useState } from "react";

import { QueryClient, QueryClientProvider as RQProvider } from "@tanstack/react-query";

export function QueryClientProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 10_000,
          },
        },
      }),
  );
  return <RQProvider client={client}>{children}</RQProvider>;
}

