"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/auth/session";

type NotificationItem = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  isUnread: boolean;
};

type Payload = {
  unreadCount: number;
  lastSeen: string;
  items: NotificationItem[];
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatTitle(n: NotificationItem) {
  const who = n.actorName || n.actorEmail || "Encoder";
  const what = n.action.replaceAll("_", " ").toLowerCase();
  return `${who} · ${what}`;
}

export function NotificationsBell({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const refreshSeqRef = useRef(0);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const seq = ++refreshSeqRef.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Payload;
      if (seq !== refreshSeqRef.current) return;
      setUnreadCount(data.unreadCount ?? 0);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      if (!silent) setError("Could not load notifications.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch {
      setError("Could not mark notifications as read.");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const markOneRead = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    // optimistic UI
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isUnread: false } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        cache: "no-store",
        keepalive: true,
      });
    } catch {
      if (!silent) setError("Could not mark notification as read.");
    } finally {
      // reconcile counts/items (silent by default)
      refresh({ silent: true });
    }
  }, [refresh]);

  useEffect(() => {
    // initial load for badge
    refresh({ silent: true });
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (user.role !== "SUPER_ADMIN") return;

    // Poll so the badge updates without manual refresh.
    // Faster while dropdown is open, slower while closed.
    const intervalMs = open ? 5_000 : 15_000;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refresh({ silent: !open });
    }, intervalMs);

    function onVisibilityOrFocus() {
      if (document.visibilityState !== "visible") return;
      refresh({ silent: !open });
    }

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [open, refresh, user.role]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onMouseDown(e: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  const badge = useMemo(() => {
    if (!(unreadCount > 0)) return null;
    return (
      <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[11px] font-semibold text-white">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    );
  }, [unreadCount]);

  if (user.role !== "SUPER_ADMIN") return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        aria-label="Notifications"
      >
        {badge}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-5 w-5"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-[22rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Notifications</div>
              <div className="text-xs text-slate-500">
                Encoder activity (audited actions)
              </div>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mark read
            </button>
          </div>

          <div className="max-h-[22rem] overflow-auto">
            {error ? (
              <div className="px-4 py-3 text-sm text-red-600">{error}</div>
            ) : null}

            {loading && items.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-500">Loading…</div>
            ) : null}

            {items.map((n) => {
              const href = `/app/audit?q=${encodeURIComponent(
                [n.action, n.actorEmail ?? "", n.entityId ?? ""].filter(Boolean).join(" "),
              )}`;

              return (
                <div
                  key={n.id}
                  className="border-b border-slate-200 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        // mark read immediately, then navigate
                        if (n.isUnread) markOneRead(n.id, { silent: true });
                        setOpen(false);
                        router.push(href);
                      }}
                    >
                      <div className="truncate text-sm text-slate-900">{formatTitle(n)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {n.entityType ? `${n.entityType}${n.entityId ? ` · ${n.entityId}` : ""}` : "—"}
                      </div>
                    </button>

                    <div className="shrink-0 text-right">
                      <div className="text-[11px] text-slate-500">{formatWhen(n.createdAt)}</div>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        {n.isUnread ? (
                          <div className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            New
                          </div>
                        ) : null}
                        <button
                          type="button"
                          aria-label={n.isUnread ? "Mark as read" : "Read"}
                          title={n.isUnread ? "Mark as read" : "Read"}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!n.isUnread) return;
                            markOneRead(n.id);
                          }}
                          className={`grid h-7 w-7 place-items-center rounded-lg border ${
                            n.isUnread
                              ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {items.length === 0 && !loading && !error ? (
              <div className="px-4 py-6 text-sm text-slate-500">
                No encoder activity yet.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

