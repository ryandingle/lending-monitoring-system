"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function AuditPageSizeSelect({ pageSize, q }: { pageSize: number; q: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const params = new URLSearchParams({ pageSize: value });
    if (q) params.set("q", q);

    startTransition(() => {
      router.push(`/app/audit?${params.toString()}`);
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Per page
      <select
        value={String(pageSize)}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
