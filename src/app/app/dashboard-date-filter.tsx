"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
    getReportPreset1Week,
    getReportPreset2Weeks,
    getReportPreset1Month,
} from "@/lib/date";

interface DashboardDateFilterProps {
    from: string;
    to: string;
}

export function DashboardDateFilter({ from, to }: DashboardDateFilterProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const preset1 = getReportPreset1Week();
    const preset2 = getReportPreset2Weeks();
    const presetMonth = getReportPreset1Month();

    const getInitialPreset = () => {
        if (from === preset1.from && to === preset1.to) return "1week";
        if (from === preset2.from && to === preset2.to) return "2weeks";
        if (from === presetMonth.from && to === presetMonth.to) return "1month";
        return "custom";
    };

    const [selectedPreset, setSelectedPreset] = useState<string>(getInitialPreset());
    const [customRange, setCustomRange] = useState({ from, to });

    const handleApply = (e: React.FormEvent) => {
        e.preventDefault();
        let targetFrom = customRange.from;
        let targetTo = customRange.to;

        if (selectedPreset === "1week") {
            targetFrom = preset1.from;
            targetTo = preset1.to;
        } else if (selectedPreset === "2weeks") {
            targetFrom = preset2.from;
            targetTo = preset2.to;
        } else if (selectedPreset === "1month") {
            targetFrom = presetMonth.from;
            targetTo = presetMonth.to;
        }

        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("from", targetFrom);
            params.set("to", targetTo);
            router.push(`/app?${params.toString()}`);
        });
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={handleApply} className="flex flex-wrap items-center gap-2">
                <select
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
                >
                    <option value="1week">1 Week (Mon-Fri)</option>
                    <option value="2weeks">2 Weeks (Prev Mon-Fri)</option>
                    <option value="1month">1 Month (This Month)</option>
                    <option value="custom">Custom Range</option>
                </select>

                {selectedPreset === "custom" && (
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customRange.from}
                            onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-blue-500 transition-all"
                            required
                        />
                        <span className="text-slate-500 text-xs">to</span>
                        <input
                            type="date"
                            value={customRange.to}
                            onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-blue-500 transition-all"
                            required
                        />
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isPending}
                    className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20"
                >
                    {isPending ? "..." : "Filter"}
                </button>
            </form>
        </div>
    );
}
