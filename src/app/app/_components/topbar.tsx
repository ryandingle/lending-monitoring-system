import Image from "next/image";
import type { AuthUser } from "@/lib/auth/session";
import { LogoutButton } from "../logout-button";
import { NotificationsBell } from "./notifications-bell";

export function Topbar({
  user,
  onMenuClick,
  onToggleSidebar,
  collapsed,
}: {
  user: AuthUser;
  onMenuClick?: () => void;
  onToggleSidebar?: () => void;
  collapsed?: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile Menu */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open navigation"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
            <Image
              src="/logo.jpg"
              alt="Logo"
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-contain bg-slate-50 p-0.5"
            />
          </div>

          {/* Desktop Collapse Toggle */}
          <div className="hidden md:flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleSidebar}
              className="group grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`h-5 w-5 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="flex flex-col">
              <div className="text-sm font-semibold text-slate-900">Triple E Microfinance</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Admin Portal</div>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <NotificationsBell user={user} />

          <div className="hidden text-right lg:block">
            <div className="text-sm font-medium text-slate-900">{user.name}</div>
            <div className="text-[10px] uppercase font-bold text-slate-500">{user.role}</div>
          </div>

          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
