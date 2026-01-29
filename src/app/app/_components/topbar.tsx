import type { AuthUser } from "@/lib/auth/session";
import { LogoutButton } from "../logout-button";
import { NotificationsBell } from "./notifications-bell";

export function Topbar({
  user,
  onMenuClick,
}: {
  user: AuthUser;
  onMenuClick?: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open navigation"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white">
              <span className="text-sm font-bold">L</span>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="text-sm font-semibold text-slate-100">Dashboard</div>
            <div className="text-xs text-slate-400">Overview</div>
          </div>
        </div>

        <form action="/app/members" method="get" className="hidden flex-1 md:block">
          <div className="relative">
            <input
              name="q"
              placeholder="Search members (name, phone, group)…"
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </div>
          </div>
        </form>

        <div className="flex items-center gap-3">
          <NotificationsBell user={user} />

          <div className="hidden text-right md:block">
            <div className="text-sm font-medium text-slate-100">{user.name}</div>
            <div className="text-xs text-slate-400">{user.role}</div>
          </div>

          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

