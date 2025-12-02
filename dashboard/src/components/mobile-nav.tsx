"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { getUserInitials, loadUserFromStorage, navItems } from "@/lib/navigation";
import { HumanUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<HumanUser | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setUser(loadUserFromStorage());
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const handleLogout = () => {
    if (confirm("Are you sure you want to sign out?")) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user");
      router.push("/login");
      setOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85%] max-w-xs p-0">
              <SheetHeader className="flex-row items-center gap-3 p-4">
                <Image
                  src="/hakuna-logo.png"
                  alt="Hakuna"
                  width={36}
                  height={36}
                  className="h-9 w-9 object-contain"
                  priority
                />
                <SheetTitle className="text-left text-base">Hakuna</SheetTitle>
              </SheetHeader>
              <Separator />
              <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                      onClick={() => setOpen(false)}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <Separator />
              <div className="flex items-center justify-between gap-3 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 via-orange-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                    {getUserInitials(user)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {user?.name || user?.email || "User"}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {user?.role || "User"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open settings"
                    onClick={() => {
                      setOpen(false);
                      router.push("/settings");
                    }}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sign out"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <Image
              src="/hakuna-logo.png"
              alt="Hakuna"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <span className="text-base font-semibold text-foreground">Hakuna</span>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
