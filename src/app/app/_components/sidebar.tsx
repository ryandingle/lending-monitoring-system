import { NavLink } from "./nav-link";
import { IconBriefcase, IconDashboard, IconFileText, IconFolder, IconSettings, IconShield, IconUsers } from "./icons";
import type { AuthUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";

export function Sidebar({ user, mobile }: { user: AuthUser; mobile?: boolean }) {
  return (
    <aside
      className={
        mobile
          ? "block h-full w-full bg-slate-950"
          : "hidden w-72 shrink-0 border-r border-slate-800 bg-slate-950 md:block"
      }
    >
      <div className="flex h-full flex-col">
        <div className="px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white">
              <span className="text-sm font-bold">L</span>
            </div>
            <div>
              <div className="text-base font-semibold text-slate-100">Lending</div>
              <div className="text-xs text-slate-400">Monitoring System</div>
            </div>
          </div>
        </div>

        <div className="px-3">
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Menu
          </div>
          <div className="space-y-1">
            {user.role === Role.ENCODER ? null : (
              <NavLink href="/app" label="Dashboard" icon={<IconDashboard />} />
            )}
            {user.role === Role.ENCODER ? null : (
              <NavLink href="/app/groups" label="Groups" icon={<IconFolder />} />
            )}
            <NavLink href="/app/members" label="Members" icon={<IconUsers />} />
            <NavLink href="/app/employees" label="Employees" icon={<IconBriefcase />} />
            {user.role === Role.SUPER_ADMIN ? (
              <NavLink href="/app/reports" label="Reports" icon={<IconFileText />} />
            ) : null}
            {user.role === Role.SUPER_ADMIN ? (
              <NavLink href="/app/users" label="Users" icon={<IconShield />} />
            ) : null}
            {user.role === Role.SUPER_ADMIN ? (
              <NavLink href="/app/audit" label="Audit Trail" icon={<IconShield />} />
            ) : null}
            <NavLink href="/app/account" label="Account" icon={<IconSettings />} />
          </div>
        </div>

        <div className="mt-auto border-t border-slate-800 p-4">
          <div className="rounded-xl bg-slate-900/60 p-3">
            <div className="text-xs font-semibold text-slate-300">Signed in as</div>
            <div className="mt-1 text-sm font-medium text-slate-100">{user.name}</div>
            <div className="text-xs text-slate-400">
              {user.role} · {user.email}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

