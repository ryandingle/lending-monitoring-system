"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/app" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-slate-900 text-slate-100"
          : "text-slate-300 hover:bg-slate-900/60 hover:text-slate-100"
      }`}
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-lg ${
          active ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-200"
        }`}
      >
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

