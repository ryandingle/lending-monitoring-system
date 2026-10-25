"use client";

import { useState } from "react";
import {
    getReportPreset1Week,
    getReportPreset2Weeks,
    getReportPreset1Month,
} from "@/lib/date";
import { useReportsRange } from "./reports-range";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function DateRangeFilter() {
    const { from, to, setRange } = useReportsRange();

    const preset1 = getReportPreset1Week();
    const preset2 = getReportPreset2Weeks();
    const presetMonth = getReportPreset1Month();

    const getInitialMode = () => {
        if (from === preset1.from && to === preset1.to) return "1week";
        if (from === preset2.from && to === preset2.to) return "2weeks";
        if (from === presetMonth.from && to === presetMonth.to) return "1month";
        return "custom";
    };

    const [mode, setMode] = useState<string>(getInitialMode);

    const handlePresetChange = (value: string) => {
        setMode(value);

        if (value === "1week") setRange(preset1.from, preset1.to);
        else if (value === "2weeks") setRange(preset2.from, preset2.to);
        else if (value === "1month") setRange(presetMonth.from, presetMonth.to);
    };

    const handleCustomDateChange = (field: "from" | "to", value: string) => {
        if (!DATE_PATTERN.test(value)) return;
        if (field === "from") setRange(value, to);
        else setRange(from, value);
    };

    return (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Date range</h2>
            <p className="mt-1 text-xs text-slate-500">
                Exports will include data within the selected from and to dates.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3 items-end">
                <div className="sm:col-span-1">
                    <label className="text-sm font-medium text-slate-700">Range</label>
                    <select
                        value={mode}
                        onChange={(e) => handlePresetChange(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    >
                        <option value="1week">1 Week (Mon-Fri)</option>
                        <option value="2weeks">2 Weeks (Prev Mon-Fri)</option>
                        <option value="1month">1 Month (Current Month)</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>

                {mode === "custom" && (
                    <>
                        <div>
                            <label className="text-sm font-medium text-slate-700">From</label>
                            <input
                                type="date"
                                value={from}
                                onChange={(e) => handleCustomDateChange("from", e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">To</label>
                            <input
                                type="date"
                                value={to}
                                onChange={(e) => handleCustomDateChange("to", e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
