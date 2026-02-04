import Image from "next/image";
import { NavLink } from "./nav-link";
import { IconBriefcase, IconDashboard, IconFileText, IconFolder, IconSettings, IconShield, IconUsers } from "./icons";
import type { AuthUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import clsx from "clsx";

export function Sidebar({ user, mobile, collapsed }: { user: AuthUser; mobile?: boolean; collapsed?: boolean }) {
  const isCollapsed = !mobile && collapsed;

  return (
    <aside
      className={clsx(
        "shrink-0 border-r border-slate-800 bg-slate-950 transition-all duration-300",
        mobile ? "block h-full w-full" : "hidden md:block",
        isCollapsed ? "w-20" : "w-72"
      )}
    >
      <div className="flex h-full flex-col">
        <div className={clsx("px-5 py-5 transition-all", isCollapsed ? "px-4" : "px-5")}>
          <div className="flex items-center gap-3">
            <Image
              src="/logo.jpg"
              alt="Logo"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-contain bg-white p-0.5 shrink-0"
            />
            {!isCollapsed && (
              <div className="transition-opacity duration-300">
                <div className="text-base font-semibold text-slate-100 line-clamp-1">Triple E</div>
                <div className="text-xs text-slate-400 line-clamp-1 truncate">Microfinance Inc.</div>
              </div>
            )}
          </div>
        </div>

        <div className="px-3">
          {!isCollapsed && (
            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-opacity">
              Menu
            </div>
          )}
          <div className="space-y-1">
            {user.role !== Role.ENCODER ? (
              <NavLink href="/app" label={isCollapsed ? "" : "Dashboard"} icon={<IconDashboard />} />
            ) : null}
            <NavLink href="/app/groups" label={isCollapsed ? "" : "Groups"} icon={<IconFolder />} />
            {user.role !== Role.ENCODER ? (
              <NavLink href="/app/members" label={isCollapsed ? "" : "Members"} icon={<IconUsers />} />
            ) : null}
            {user.role === Role.SUPER_ADMIN ? (
              <NavLink href="/app/employees" label={isCollapsed ? "" : "Employees"} icon={<IconBriefcase />} />
            ) : null}
            {user.role === Role.SUPER_ADMIN || user.role === Role.ENCODER ? (
              <NavLink href="/app/reports" label={isCollapsed ? "" : "Reports"} icon={<IconFileText />} />
            ) : null}
            {user.role === Role.SUPER_ADMIN ? (
              <NavLink href="/app/users" label={isCollapsed ? "" : "Users"} icon={<IconShield />} />
            ) : null}
            {user.role === Role.SUPER_ADMIN ? (
              <NavLink href="/app/audit" label={isCollapsed ? "" : "Audit Trail"} icon={<IconShield />} />
            ) : null}
            <NavLink href="/app/account" label={isCollapsed ? "" : "Account"} icon={<IconSettings />} />
          </div>
        </div>

        <div className="mt-auto border-t border-slate-800 p-4">
          <div className={clsx("rounded-xl bg-slate-900/60 p-3 overflow-hidden", isCollapsed ? "p-1 flex justify-center" : "p-3")}>
            {isCollapsed ? (
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            ) : (
              <>
                <div className="text-xs font-semibold text-slate-300">Signed in as</div>
                <div className="mt-1 text-sm font-medium text-slate-100 truncate">{user.name}</div>
                <div className="text-xs text-slate-400 truncate">
                  {user.role} · {user.username}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
