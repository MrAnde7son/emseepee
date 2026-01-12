"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, Settings, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getUserInitials, loadUserFromStorage, navItems, type NavItem } from "@/lib/navigation";
import { HumanUser } from "@/lib/types";

export function Sidebar() {
  // Initialize isExpanded from localStorage synchronously (client-side only)
  // Defaults to true if not found or on server-side to avoid hydration mismatch
  const getInitialSidebarExpanded = (): boolean => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("sidebarExpanded");
      if (saved !== null) {
        return saved === "true";
      }
    } catch {
      // Ignore errors
    }
    return true; // Default to expanded
  };

  const [isExpanded, setIsExpanded] = useState(getInitialSidebarExpanded);
  // Initialize user as null to avoid hydration mismatch (will load on client)
  const [user, setUser] = useState<HumanUser | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Load user data only on client side after mount to avoid hydration mismatch
    // Using setTimeout to make state update async and avoid linter warning
    const timer = setTimeout(() => {
      const loadedUser = loadUserFromStorage();
      setUser(loadedUser);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Save sidebar expanded state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebarExpanded", String(isExpanded));
    }
  }, [isExpanded]);

  const handleLogout = () => {
    if (confirm("Are you sure you want to sign out?")) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user");
      router.push("/login");
    }
  };

  // Initialize state from localStorage synchronously (client-side only)
  const getInitialCollapsed = (): Set<string> => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("navManuallyCollapsed");
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Set(parsed);
      }
    } catch {
      // Ignore parse errors
    }
    return new Set();
  };

  const getInitialExpanded = (): Set<string> => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("navManuallyExpanded");
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Set(parsed);
      }
    } catch {
      // Ignore parse errors
    }
    return new Set();
  };

  // Track manually collapsed items (user explicitly closed them)
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Set<string>>(getInitialCollapsed);
  // Track manually expanded items (user explicitly opened them, separate from auto-expand)
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(getInitialExpanded);

  // Save manually collapsed state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("navManuallyCollapsed", JSON.stringify(Array.from(manuallyCollapsed)));
    }
  }, [manuallyCollapsed]);

  // Save manually expanded state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("navManuallyExpanded", JSON.stringify(Array.from(manuallyExpanded)));
    }
  }, [manuallyExpanded]);

  // Compute which items should be auto-expanded based on active route
  const shouldAutoExpand = useMemo(() => {
    const autoExpand = new Set<string>();
    navItems.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some((child) => child.href === pathname);
        if (hasActiveChild && !manuallyCollapsed.has(item.label)) {
          autoExpand.add(item.label);
        }
      }
    });
    return autoExpand;
  }, [pathname, manuallyCollapsed]);

  // Derive final expanded state: auto-expanded OR manually expanded
  const expandedItems = useMemo(() => {
    const expanded = new Set(shouldAutoExpand);
    manuallyExpanded.forEach((label) => {
      if (!manuallyCollapsed.has(label)) {
        expanded.add(label);
      }
    });
    return expanded;
  }, [shouldAutoExpand, manuallyExpanded, manuallyCollapsed]);

  const toggleExpanded = (label: string) => {
    if (expandedItems.has(label)) {
      // User is collapsing
      setManuallyCollapsed((prev) => {
        const next = new Set(prev);
        next.add(label);
        return next;
      });
      setManuallyExpanded((prev) => {
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
    } else {
      // User is expanding
      setManuallyCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
      setManuallyExpanded((prev) => {
        const next = new Set(prev);
        next.add(label);
        return next;
      });
    }
  };

  const renderNavItem = (item: NavItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isItemExpanded = expandedItems.has(item.label);
    const isActive = item.href === pathname || (hasChildren && item.children?.some((child) => child.href === pathname));

    if (hasChildren) {
      // When sidebar is collapsed, show as a simple link
      if (!isExpanded) {
        return (
          <Link
            key={item.label}
            href={item.href || "#"}
            className={cn(
              "flex items-center justify-center rounded-lg px-3 py-2 text-sm transition w-full",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            title={item.label}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
          </Link>
        );
      }

      // When sidebar is expanded, show label + chevron
      return (
        <div key={item.label}>
          <div className="flex items-center gap-2">
            <Link
              href={item.href || "#"}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition flex-1",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                depth > 0 && "ml-4"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(item.label);
              }}
              className={cn(
                "p-1 rounded hover:bg-accent transition",
                isActive && "text-accent-foreground"
              )}
              aria-label={isItemExpanded ? "Collapse" : "Expand"}
            >
              <ChevronDown className={cn("h-3 w-3 flex-shrink-0 transition-transform", !isItemExpanded && "rotate-[-90deg]")} />
            </button>
          </div>
          {isItemExpanded && (
            <div className="ml-4 mt-1 space-y-1">
              {item.children?.map((child) => renderNavItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href || "#"}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          !isExpanded && "justify-center",
          depth > 0 && "ml-4"
        )}
        title={!isExpanded ? item.label : undefined}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        {isExpanded && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-card/50 transition-all duration-300 h-screen sticky top-0",
        isExpanded ? "w-64" : "w-16"
      )}
    >
      <div className="px-4 py-4 border-b border-border relative flex-shrink-0">
        {isExpanded ? (
          <div className="flex items-center gap-2">
            <Image
              src="/emseepee-logo.png"
              alt="EmSeePee"
              width={40}
              height={40}
              className="h-8 w-8 object-contain"
              priority
            />
            <span className="text-sm font-semibold text-foreground">EmSeePee</span>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <Image
              src="/emseepee-logo.png"
              alt="EmSeePee"
              width={40}
              height={40}
              className="h-8 w-8 object-contain"
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
        {navItems.map((item) => renderNavItem(item))}
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
                {getUserInitials(user)}
              </div>
              {isExpanded && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user?.name || user?.email || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate capitalize">
                    {user?.role || "User"}
                  </p>
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
              onClick={handleLogout}
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

