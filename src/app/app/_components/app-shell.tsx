"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { AuthUser } from "@/lib/auth/session";

export function AppShell({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Prevent background scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const overlay = useMemo(() => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-40 md:hidden">
        <button
          type="button"
          aria-label="Close navigation"
          className="absolute inset-0 bg-black/60"
          onClick={() => setOpen(false)}
        />
        <div className="absolute left-0 top-0 h-full w-72">
          <div className="h-full border-r border-slate-800 bg-slate-950 shadow-2xl">
            <Sidebar user={user} mobile />
          </div>
        </div>
      </div>
    );
  }, [open, user]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {overlay}

      <div className="flex min-h-screen">
        <Sidebar user={user} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} onMenuClick={() => setOpen(true)} />
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

