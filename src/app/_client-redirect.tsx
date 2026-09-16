"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function ClientRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Amplify static 404 fallback: when a page like /login gets a CDN-level
    // 404 response because Amplify was deployed as WEB (static) instead of
    // WEB_COMPUTE (SSR), this component mounts on the not-found page and
    // forces Next.js to re-resolve the browser's current URL through the
    // client-side router, which bootstraps the correct route handler.
    const qs = searchParams?.toString();
    const url = qs ? `${pathname ?? "/"}?${qs}` : pathname ?? "/";
    const id = window.setTimeout(() => router.replace(url), 25);
    return () => window.clearTimeout(id);
  }, [pathname, searchParams, router]);

  return null;
}
