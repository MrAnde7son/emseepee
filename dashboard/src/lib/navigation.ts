import { Bot, Gauge, ListFilter, Plug, Shield, Users, ChevronDown, ChevronRight } from "lucide-react";

import { HumanUser } from "./types";

export interface NavItem {
  href?: string;
  label: string;
  icon: typeof Plug;
  children?: NavItem[];
}

export const navItems: NavItem[] = [
  {
    href: "/providers/agentic", // Default route when clicking Providers
    label: "Providers",
    icon: Plug,
    children: [
      { href: "/providers/agentic", label: "Agentic", icon: Plug },
      { href: "/providers/identity", label: "Identity", icon: Shield },
    ],
  },
  { href: "/tools", label: "Library", icon: Gauge },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/events", label: "Events", icon: ListFilter },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/users", label: "Users", icon: Users },
];

export function getUserInitials(user: HumanUser | null): string {
  if (!user) return "U";

  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return user.name.substring(0, 2).toUpperCase();
  }

  return user.email.substring(0, 2).toUpperCase();
}

export function loadUserFromStorage(): HumanUser | null {
  if (typeof window === "undefined" || !window?.localStorage) return null;

  const userStr = window.localStorage.getItem("user");
  if (userStr) {
    try {
      return JSON.parse(userStr) as HumanUser;
    } catch {
      window.localStorage.removeItem("user");
      window.localStorage.removeItem("auth_token");
      return null;
    }
  }
  return null;
}
