"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PATHS = ["/login", "/register"];

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Client-side auth gate that redirects to /login when no token is present.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = () => {
      const isPublic = PUBLIC_PATHS.some((path) => pathname?.startsWith(path));
      if (isPublic) {
        setAuthorized(true);
        return;
      }

      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (!token) {
        router.replace("/login");
        return;
      }

      if (!cancelled) {
        setAuthorized(true);
      }
    };

    // Defer state change to avoid synchronous setState in effect
    const timer = setTimeout(checkAuth, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname, router]);

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
