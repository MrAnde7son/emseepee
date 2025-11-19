import "./globals.css";

import type { Metadata } from "next";

import { ReactNode } from "react";

import Link from "next/link";

import { cn } from "@/lib/utils";

import { Gauge, Plug, Shield, ListFilter, Settings } from "lucide-react";

import { QueryClientProvider } from "@/components/query-client-provider";

export const metadata: Metadata = {
  title: "Agent Tools Gateway",
  description: "Gateway for AI agents and tools",
};

const navItems = [
  { href: "/providers", label: "Providers", icon: Plug },
  { href: "/tools", label: "Tools library", icon: Gauge },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/events", label: "Events", icon: ListFilter },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={cn("font-sans bg-slate-950 text-slate-100")}>
        <QueryClientProvider>
          <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className="hidden md:flex md:w-64 flex-col border-r border-slate-800 bg-slate-950/90">
              <div className="px-4 py-4 border-b border-slate-800">
                <div className="text-sm font-semibold text-slate-400">
                  Agent Gateway
                </div>
                <div className="text-lg font-semibold text-slate-100">
                  Control Plane
                </div>
              </div>
              <nav className="flex-1 px-2 py-4 space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
              <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-500">
                agent-tools-gateway
              </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col">
              <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950/80 backdrop-blur">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm text-slate-200">
                    Gateway status: <span className="font-semibold">Connected</span>
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Built for agents, tools and policies
                </div>
              </header>
              <main className="flex-1 p-4 md:p-6">{children}</main>
            </div>
          </div>
        </QueryClientProvider>
      </body>
    </html>
  );
}
