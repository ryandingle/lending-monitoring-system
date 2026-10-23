"use client";

import { useState } from "react";
import {
    formatDateYMD,
    getFriday,
    getMonday,
    getReportPreset1Week,
    getReportPreset2Weeks,
    getReportPreset1Month,
} from "@/lib/date";
import { useReportsRange } from "./reports-range";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getTwoWeekWorkingRange(anchorYmd: string) {
    const anchorDate = new Date(`${anchorYmd}T00:00:00`);
    const currentWeekMonday = getMonday(anchorDate);
    const previousWeekMonday = new Date(currentWeekMonday);
    previousWeekMonday.setDate(previousWeekMonday.getDate() - 7);
    const currentWeekFriday = getFriday(anchorDate);

    return {
        from: formatDateYMD(previousWeekMonday),
        to: formatDateYMD(currentWeekFriday),
    };
}

export function DateRangeFilter() {
    const { from, to, setRange } = useReportsRange();
    const [customAnchorDate, setCustomAnchorDate] = useState(to);

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
        else if (value === "custom") setCustomAnchorDate(to);
    };

    const handleAnchorDateChange = (value: string) => {
        if (!DATE_PATTERN.test(value)) return;
        setCustomAnchorDate(value);
        const range = getTwoWeekWorkingRange(value);
        setRange(range.from, range.to);
    };

    return (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Date range</h2>
            <p className="mt-1 text-xs text-slate-500">
                Exports will include data within the selected from and to dates.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-4 items-end">
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
                            <label className="text-sm font-medium text-slate-700">
                                Selected date
                            </label>
                            <input
                                type="date"
                                value={customAnchorDate}
                                onChange={(e) => handleAnchorDateChange(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">From</label>
                            <input
                                type="date"
                                value={from}
                                readOnly
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">To</label>
                            <input
                                type="date"
                                value={to}
                                readOnly
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none"
                            />
                        </div>
                        <p className="text-xs text-slate-500 sm:col-span-4">
                            Selecting any date uses the same 2-week working window as the
                            default preset: previous Monday through the Friday of the selected
                            date&apos;s week.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
