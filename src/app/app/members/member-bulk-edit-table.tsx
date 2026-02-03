"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import { countBusinessDays } from "@/lib/date";
import { IconEye, IconPencil, IconTrash } from "../_components/icons";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";

interface Member {
    id: string;
    firstName: string;
    lastName: string;
    balance: number;
    savings: number;
    createdAt: string;
    groupId: string | null;
    group?: { id: string; name: string } | null;
    daysCount: number;
}

interface User {
    role: Role;
}

export function MemberBulkEditTable({
    initialMembers,
    user,
    onBulkUpdate,
    deleteMemberAction,
    groupId,
    groupName,
}: {
    initialMembers: Member[];
    user: User;
    onBulkUpdate: (updates: { memberId: string; balanceDeduct: string; savingsIncrease: string; daysCount: string }[]) => Promise<{ success: boolean, errors?: { memberId: string, message: string, type: string }[] }>;
    deleteMemberAction: (memberId: string) => Promise<void>;
    groupId?: string;
    groupName?: string;
}) {
    const [updates, setUpdates] = useState<Record<string, { balanceDeduct: string; savingsIncrease: string; daysCount: string }>>({});
    const [errors, setErrors] = useState<{ memberId: string; message: string; type: string }[]>([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const today = useMemo(() => new Date(), []);

    const handleChange = (memberId: string, field: "balanceDeduct" | "savingsIncrease" | "daysCount", value: string) => {
        // Only allow numbers and decimal point for balance/savings, integers for daysCount
        if (field === "daysCount") {
            if (value !== "" && !/^\d*$/.test(value)) return;
        } else {
            if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
        }

        setUpdates((prev) => ({
            ...prev,
            [memberId]: {
                ...(prev[memberId] || { balanceDeduct: "", savingsIncrease: "", daysCount: "" }),
                [field]: value,
            },
        }));
    };

    const hasChanges = Object.values(updates).some((u) => u.balanceDeduct !== "" || u.savingsIncrease !== "" || u.daysCount !== "");

    const handleSave = async () => {
        if (!hasChanges || isSaving) return;
        setIsSaving(true);
        setErrors([]);
        setShowSuccess(false);
        try {
            const payload = Object.entries(updates)
                .filter(([_, u]) => u.balanceDeduct !== "" || u.savingsIncrease !== "" || u.daysCount !== "")
                .map(([id, u]) => ({
                    memberId: id,
                    balanceDeduct: u.balanceDeduct || "0",
                    savingsIncrease: u.savingsIncrease || "0",
                    daysCount: u.daysCount || "",
                }));
            const result = await onBulkUpdate(payload);
            if (result.success) {
                setUpdates({});
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 5000);
            } else if (result.errors) {
                setErrors(result.errors);
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {showSuccess && (
                <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/30 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 text-emerald-400">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-wider">Updates Saved Successfully!</span>
                    </div>
                </div>
            )}

            {errors.length > 0 && (
                <div className="rounded-xl border border-yellow-900/40 bg-yellow-950/30 p-4">
                    <div className="flex items-center gap-2 text-yellow-500 mb-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-wider">Blocked Duplicate Updates</span>
                    </div>
                    <ul className="space-y-1">
                        {errors.map((err, i) => (
                            <li key={i} className="text-xs text-yellow-200/80">
                                • {err.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {initialMembers.length} member{initialMembers.length === 1 ? "" : "s"} found
                        {groupName ? ` in ${groupName}` : ""}
                    </div>
                    {hasChanges && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-900/20"
                        >
                            {isSaving ? "Saving..." : "Save All Updates"}
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto bg-slate-950">
                    <table className="min-w-full table-fixed border-separate border-spacing-0 text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-900 shadow-sm">
                            <tr>
                                <th className="w-48 border-b border-r border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-300">Member</th>
                                <th className="w-28 border-b border-r border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-300 text-right">Balance</th>
                                <th className="w-24 border-b border-r border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-blue-400 text-right">Deduct (-)</th>
                                <th className="w-28 border-b border-r border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-300 text-right">Savings</th>
                                <th className="w-24 border-b border-r border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-emerald-400 text-right">Add (+)</th>
                                <th className="w-20 border-b border-r border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-300 text-center">Days</th>
                                <th className="w-32 border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-300 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {initialMembers.map((m) => {
                                const u = updates[m.id] || { balanceDeduct: "", savingsIncrease: "" };
                                const memberErrors = errors.filter(e => e.memberId === m.id);
                                const memberCreatedAt = new Date(m.createdAt);

                                return (
                                    <tr key={m.id} className="group hover:bg-blue-500/5 odd:bg-slate-950 even:bg-slate-900/30">
                                        <td className="border-b border-r border-slate-800 px-3 py-2 font-medium transition-colors group-hover:border-blue-500/30">
                                            <Link href={`/app/members/${m.id}`} className="block truncate hover:text-blue-400 text-slate-100">
                                                {m.lastName}, {m.firstName}
                                            </Link>
                                            <div className="text-[10px] text-slate-500 uppercase tracking-tighter truncate">
                                                {m.group?.name || "No Group"}
                                            </div>
                                        </td>
                                        <td className="border-b border-r border-slate-800 px-3 py-2 text-right font-mono font-medium text-slate-300 transition-colors group-hover:border-blue-500/30">
                                            {m.balance.toFixed(2)}
                                        </td>
                                        <td className={`border-b border-r border-slate-800 px-1 py-1 transition-colors group-hover:border-blue-500/30 ${memberErrors.some(e => e.type === "balance") ? "bg-red-500/10" : "bg-blue-500/5"}`}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={u.balanceDeduct}
                                                onChange={(e) => handleChange(m.id, "balanceDeduct", e.target.value)}
                                                placeholder="0.00"
                                                className={`w-full bg-transparent px-2 py-1 text-right font-mono outline-none placeholder:text-blue-900/50 focus:bg-blue-500/10 rounded ${memberErrors.some(e => e.type === "balance") ? "text-red-400" : "text-blue-400"}`}
                                            />
                                        </td>
                                        <td className="border-b border-r border-slate-800 px-3 py-2 text-right font-mono font-medium text-emerald-500/70 transition-colors group-hover:border-blue-500/30">
                                            {m.savings.toFixed(2)}
                                        </td>
                                        <td className={`border-b border-r border-slate-800 px-1 py-1 transition-colors group-hover:border-blue-500/30 ${memberErrors.some(e => e.type === "savings") ? "bg-red-500/10" : "bg-emerald-500/5"}`}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={u.savingsIncrease}
                                                onChange={(e) => handleChange(m.id, "savingsIncrease", e.target.value)}
                                                placeholder="0.00"
                                                className={`w-full bg-transparent px-2 py-1 text-right font-mono outline-none placeholder:text-emerald-900/50 focus:bg-emerald-500/10 rounded ${memberErrors.some(e => e.type === "savings") ? "text-red-400" : "text-emerald-400"}`}
                                            />
                                        </td>
                                        <td className={`border-b border-r border-slate-800 px-1 py-1 transition-colors group-hover:border-blue-500/30 bg-slate-500/5`}>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={u.daysCount}
                                                onChange={(e) => handleChange(m.id, "daysCount", e.target.value)}
                                                placeholder={String(m.daysCount)}
                                                className="w-full bg-transparent px-2 py-1 text-center font-mono outline-none placeholder:text-slate-600 focus:bg-slate-500/10 rounded text-slate-300"
                                            />
                                        </td>
                                        <td className="border-b border-slate-800 px-3 py-2 transition-colors group-hover:border-blue-500/30">
                                            <div className="flex justify-end gap-1.5">
                                                <Link
                                                    href={`/app/members/${m.id}`}
                                                    title="View details"
                                                    className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                                                >
                                                    <IconEye className="h-4 w-4" />
                                                </Link>
                                                <Link
                                                    href={`/app/members/${m.id}/edit`}
                                                    title="Edit"
                                                    className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                                                >
                                                    <IconPencil className="h-4 w-4" />
                                                </Link>
                                                {user.role === Role.SUPER_ADMIN ? (
                                                    <form action={() => deleteMemberAction(m.id)} className="inline">
                                                        <ConfirmSubmitButton
                                                            title="Delete"
                                                            confirmMessage={`Delete member "${m.lastName}, {m.firstName}"?`}
                                                            className="rounded-md border border-red-900/40 bg-red-950/20 p-1.5 text-red-500 hover:bg-red-900/40 hover:text-red-100"
                                                        >
                                                            <IconTrash className="h-4 w-4" />
                                                        </ConfirmSubmitButton>
                                                    </form>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {initialMembers.length === 0 ? (
                                <tr>
                                    <td className="py-12 text-center text-slate-500 italic" colSpan={7}>
                                        {user.role === Role.ENCODER && !groupId
                                            ? "Select a group to load member data..."
                                            : "No matching records found."}
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
