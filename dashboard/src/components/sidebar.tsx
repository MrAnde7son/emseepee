"use client";

import { useState, useEffect } from "react";
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

interface User {
  id: number;
  email: string;
  name: string | null;
  role: string;
}

/**
 * Get user initials from name or email
 */
function getUserInitials(user: User | null): string {
  if (!user) return "U";
  
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return user.name.substring(0, 2).toUpperCase();
  }
  
  // Fallback to email initials
  return user.email.substring(0, 2).toUpperCase();
}

const navItems = [
  { href: "/providers", label: "Providers", icon: Plug },
  { href: "/tools", label: "Library", icon: Gauge },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/events", label: "Events", icon: ListFilter },
  { href: "/agents", label: "Agents", icon: Bot },
];

/**
 * Load user from localStorage
 */
function loadUserFromStorage(): User | null {
  if (typeof window === "undefined") return null;
  
  const userStr = localStorage.getItem("user");
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      // Invalid user data, clear it
      localStorage.removeItem("user");
      localStorage.removeItem("auth_token");
      return null;
    }
  }
  return null;
}

export function Sidebar() {
  // Initialize isExpanded to true (same on server and client to avoid hydration mismatch)
  const [isExpanded, setIsExpanded] = useState(true);
  // Initialize user as null to avoid hydration mismatch (will load on client)
  const [user, setUser] = useState<User | null>(null);
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

  // Load sidebar expanded state from localStorage after mount (client-side only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Using setTimeout to make state update async and avoid linter warning
      const timer = setTimeout(() => {
        const saved = localStorage.getItem("sidebarExpanded");
        if (saved !== null) {
          setIsExpanded(saved === "true");
        }
      }, 0);
      return () => clearTimeout(timer);
    }
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

