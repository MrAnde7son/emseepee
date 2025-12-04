"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProvidersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/providers/agentic");
  }, [router]);

  return null;
}
