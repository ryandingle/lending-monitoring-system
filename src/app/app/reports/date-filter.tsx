"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
    getReportPreset1Week,
    getReportPreset2Weeks,
    getReportPreset1Month,
} from "@/lib/date";

interface DateRangeFilterProps {
    from: string;
    to: string;
}

export function DateRangeFilter({ from, to }: DateRangeFilterProps) {
    const router = useRouter();
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
            const params = new URLSearchParams();
            params.set("from", targetFrom);
            params.set("to", targetTo);
            router.push(`/app/reports?${params.toString()}`);
        });
    };

    return (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Date range</h2>
            <p className="mt-1 text-xs text-slate-500">
                Exports will include data within the selected from and to dates.
            </p>

            <form onSubmit={handleApply} className="mt-4 grid gap-3 sm:grid-cols-4 items-end">
                <div className="sm:col-span-1">
                    <label className="text-sm font-medium text-slate-700">Range</label>
                    <select
                        value={selectedPreset}
                        onChange={(e) => setSelectedPreset(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    >
                        <option value="1week">1 Week (Mon-Fri)</option>
                        <option value="2weeks">2 Weeks (Prev Mon-Fri)</option>
                        <option value="1month">1 Month (Current Month)</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>

                {selectedPreset === "custom" && (
                    <>
                        <div>
                            <label className="text-sm font-medium text-slate-700">From</label>
                            <input
                                type="date"
                                value={customRange.from}
                                onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">To</label>
                            <input
                                type="date"
                                value={customRange.to}
                                onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                required
                            />
                        </div>
                    </>
                )}

                <div className={selectedPreset === "custom" ? "" : "sm:col-start-2"}>
                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? "Applying..." : "Apply"}
                    </button>
                </div>
            </form>
        </div>
    );
}
