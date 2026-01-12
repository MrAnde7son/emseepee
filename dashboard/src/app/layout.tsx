import "./globals.css";

import type { Metadata } from "next";

import { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { QueryClientProvider } from "@/components/query-client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/sidebar";
import { TelemetryProvider } from "@/components/telemetry-provider";
import { AuthGuard } from "@/components/auth-guard";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = {
  title: "EmSeePee",
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
          <TelemetryProvider />
          <QueryClientProvider>
            <AuthGuard>
              <div className="min-h-screen flex">
                {/* Sidebar */}
                <Sidebar />

                {/* Main content */}
                <div className="flex-1 flex flex-col min-h-screen">
                  <MobileNav />
                  <main className="flex-1 p-4 md:p-6 overflow-y-auto">{children}</main>
                </div>
              </div>
            </AuthGuard>
          </QueryClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
