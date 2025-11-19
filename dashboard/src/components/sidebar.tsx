"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Gauge, Plug, Shield, ListFilter, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/providers", label: "Providers", icon: Plug },
  { href: "/tools", label: "Tools library", icon: Gauge },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/events", label: "Events", icon: ListFilter },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-card/50 transition-all duration-300",
        isExpanded ? "w-64" : "w-16"
      )}
    >
      <div className="px-4 py-4 border-b border-border relative">
        {isExpanded ? (
          <>
            <div className="text-sm font-semibold text-muted-foreground">
              Agent Gateway
            </div>
            <div className="text-lg font-semibold text-foreground">
              Control Plane
            </div>
          </>
        ) : (
          <div className="text-lg font-semibold text-foreground text-center">
            AG
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border border-border bg-background hover:bg-accent"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isExpanded ? (
            <ChevronLeft className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                !isExpanded && "justify-center"
              )}
              title={!isExpanded ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {isExpanded && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div
        className={cn(
          "px-4 py-3 border-t border-border text-xs text-muted-foreground",
          !isExpanded && "text-center"
        )}
      >
        {isExpanded ? "agent-tools-gateway" : "ATG"}
      </div>
    </aside>
  );
}

