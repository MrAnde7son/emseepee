import "./globals.css";

import type { Metadata } from "next";

import { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { QueryClientProvider } from "@/components/query-client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Hakuna",
  description: "Gateway for AI agents and tools",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn("font-sans bg-background text-foreground")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryClientProvider>
            <div className="min-h-screen flex">
              {/* Sidebar */}
              <Sidebar />

              {/* Main content */}
              <div className="flex-1 flex flex-col">
                <header className="sticky top-0 z-50 h-14 border-b border-border flex items-center justify-between px-4 bg-card/50 backdrop-blur">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-muted-foreground">
                      Gateway status: <span className="font-semibold text-foreground">Connected</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <ThemeToggle />
                  </div>
                </header>
                <main className="flex-1 p-4 md:p-6">{children}</main>
              </div>
            </div>
          </QueryClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
