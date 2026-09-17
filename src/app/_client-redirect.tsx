"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const SESSION_KEY = "__lms_nf_count";
const MAX_ATTEMPTS = 2;

export default function ClientRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (triggeredRef.current) return;

    // Keep an attempt counter in sessionStorage to break loops when a bogus
    // pathname (e.g. /docs) keeps resolving back to the not-found page.
    let count = 0;
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      const parsed = raw ? Number(raw) : NaN;
      count = Number.isFinite(parsed) ? parsed : 0;
    } catch {
      // ignore storage access errors
    }

    const qs = searchParams?.toString();
    const original = qs ? `${pathname ?? "/"}?${qs}` : pathname ?? "/";

    if (pathname && pathname !== "/") {
      if (count >= MAX_ATTEMPTS) {
        // Give up redirecting to the same bogus URL and send the user home.
        triggeredRef.current = true;
        try {
          window.sessionStorage.removeItem(SESSION_KEY);
        } catch {
          // ignore
        }
        const id = window.setTimeout(() => router.replace("/"), 25);
        return () => window.clearTimeout(id);
      }
      try {
        window.sessionStorage.setItem(SESSION_KEY, String(count + 1));
      } catch {
        // ignore
      }
      triggeredRef.current = true;
      const id = window.setTimeout(() => router.replace(original), 25);
      return () => window.clearTimeout(id);
    }

    // Pathname is empty or "/" - just reset counter and do nothing.
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }, [pathname, searchParams, router]);

  return null;
}

