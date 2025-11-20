"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Gauge, Plug, Shield, ListFilter, Settings, Bot, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/providers", label: "Providers", icon: Plug },
  { href: "/tools", label: "Library", icon: Gauge },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/events", label: "Events", icon: ListFilter },
  { href: "/agents", label: "Agents", icon: Bot },
];

export function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-card/50 transition-all duration-300 h-screen",
        isExpanded ? "w-64" : "w-16"
      )}
    >
      <div className="px-4 py-4 border-b border-border relative flex-shrink-0">
        {isExpanded ? (
          <div className="flex items-center gap-2">
            <Image
              src="/hakuna-logo.png"
              alt="Hakuna"
              width={120}
              height={40}
              className="h-8 w-auto object-contain"
              priority
            />
            <span className="text-sm font-semibold text-foreground">Hakuna</span>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <Image
              src="/hakuna-logo.png"
              alt="Hakuna"
              width={40}
              height={40}
              className="h-8 w-auto object-contain"
              priority
            />
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
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto min-h-0">
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
      <div className="border-t border-border px-4 py-3 flex-shrink-0">
        {/* Profile Section */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-3 w-full rounded-lg px-2 py-2 transition-colors hover:bg-accent text-left",
                !isExpanded && "justify-center"
              )}
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 via-orange-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                IM
              </div>
              {isExpanded && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    Itamar Mizrahi
                  </p>
                  <p className="text-xs text-muted-foreground truncate">Owner</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => router.push("/settings")}
              className="cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                // In real implementation, this would handle logout
                if (confirm("Are you sure you want to sign out?")) {
                  // Handle logout logic here (clear tokens, session, etc.)
                  console.log("Logging out...");
                  // router.push("/login");
                  alert("Logout functionality - backend integration pending");
                }
              }}
              className="cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

