"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";

export function PageLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const prevRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const current = `${pathname}?${searchParams.toString()}`;

  // Compare with previous value and update loading state
  useEffect(() => {
    if (prevRef.current !== null && prevRef.current !== current) {
      const show = setTimeout(() => setIsLoading(true), 0);
      const hide = setTimeout(() => setIsLoading(false), 300);
      return () => {
        clearTimeout(show);
        clearTimeout(hide);
      };
    }

    prevRef.current = current;
  }, [current]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="relative">
        {/* Spinner */}
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />

        {/* Pulsing background */}
        <div className="absolute inset-0 -z-10 h-20 w-20 -translate-x-2 -translate-y-2 animate-pulse rounded-full bg-blue-500/10 blur-xl" />
      </div>

      {/* Loading text */}
      <div className="absolute mt-28 text-sm font-medium text-slate-600 animate-pulse">
        Loading...
      </div>
    </div>
  );
}
