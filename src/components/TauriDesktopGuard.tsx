"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isTauri } from "@/lib/platform";

/** Keep the desktop shell on workspace routes — marketing pages are web-only. */
export function TauriDesktopGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isTauri()) return;
    if (pathname?.startsWith("/pill")) return;
    if (!pathname?.startsWith("/app")) {
      router.replace("/app");
    }
  }, [pathname, router]);

  return null;
}
