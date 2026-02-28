"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Role } from "@prisma/client";
import { countBusinessDays } from "@/lib/date";
import { IconEye, IconPencil, IconTrash } from "../_components/icons";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";
import { PaginationControls } from "../_components/pagination-controls";

export interface Member {
    id: string;
    firstName: string;
    lastName: string;
    balance: number;
    savings: number;
    createdAt: string;
    groupId: string | null;
    group?: { id: string; name: string } | null;
    daysCount: number;
    age?: number | null;
    address?: string | null;
    phoneNumber?: string | null;
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
    pagination,
    sort,
    onEditMember,
    onDeleteMember,
}: {
    initialMembers: Member[];
    user: User;
    onBulkUpdate: (updates: { memberId: string; balanceDeduct: string; savingsIncrease: string; daysCount: string }[]) => Promise<{ success: boolean, errors?: { memberId: string, message: string, type: string }[], warnings?: { memberId: string, message: string }[] }>;
    deleteMemberAction: (memberId: string) => Promise<void>;
    groupId?: string;
    groupName?: string;
    pagination?: {
        page: number;
        limit: number;
        totalCount: number;
        totalPages: number;
    };
    sort?: "asc" | "desc";
    onEditMember?: (member: Member) => void;
    onDeleteMember?: (member: Member) => void;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    const [updates, setUpdates] = useState<Record<string, { balanceDeduct: string; savingsIncrease: string; daysCount: string }>>({});
    const [errors, setErrors] = useState<{ memberId: string; message: string; type: string }[]>([]);
    const [warnings, setWarnings] = useState<{ memberId: string; message: string }[]>([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Clear updates when page/sort/limit changes to avoid applying updates to wrong rows if they shift
    useEffect(() => {
        setUpdates({});
        setErrors([]);
        setWarnings([]);
        setShowSuccess(false);
    }, [pagination?.page, pagination?.limit, sort, groupId]);

    const updateUrl = (params: Record<string, string | number | null>) => {
        const newParams = new URLSearchParams(searchParams.toString());
        Object.entries(params).forEach(([key, value]) => {
            if (value === null) {
                newParams.delete(key);
            } else {
                newParams.set(key, String(value));
            }
        });
        router.push(`${pathname}?${newParams.toString()}`);
    };

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
        setWarnings([]);
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
                setWarnings(result.warnings || []);
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 5000);
            } else if (result.errors) {
                setErrors(result.errors);
                setWarnings(result.warnings || []);
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {showSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 text-emerald-700">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-wider">Updates Saved Successfully!</span>
                    </div>
                </div>
            )}

            {warnings.length > 0 && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                    <div className="flex items-center gap-2 text-yellow-700 mb-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-wider">Warnings</span>
                    </div>
                    <ul className="space-y-1">
                        {warnings.map((w, i) => (
                            <li key={i} className="text-xs text-yellow-800/80">
                                • {w.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {errors.length > 0 && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                    <div className="flex items-center gap-2 text-yellow-700 mb-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-wider">Blocked Duplicate Updates</span>
                    </div>
                    <ul className="space-y-1">
                        {errors.map((err, i) => (
                            <li key={i} className="text-xs text-yellow-800/80">
                                • {err.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
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

                <div className="overflow-x-auto bg-white">
                    <table className="min-w-full table-fixed border-separate border-spacing-0 text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                            <tr>
                                <th 
                                    className="w-48 border-b border-r border-slate-200 px-3 py-2 font-semibold uppercase tracking-wider text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                    onClick={() => updateUrl({ sort: sort === "asc" ? "desc" : "asc", page: 1 })}
                                    title="Click to sort by Last Name"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Member</span>
                                        {sort && (
                                            <span className="text-[10px] text-blue-600">
                                                {sort === "asc" ? "▲" : "▼"}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th className="w-28 border-b border-r border-slate-200 px-3 py-2 font-semibold uppercase tracking-wider text-slate-700 text-right">Balance</th>
                                <th className="w-24 border-b border-r border-slate-200 px-3 py-2 font-semibold uppercase tracking-wider text-blue-600 text-right">Deduct (-)</th>
                                <th className="w-28 border-b border-r border-slate-200 px-3 py-2 font-semibold uppercase tracking-wider text-slate-700 text-right">Savings</th>
                                <th className="w-24 border-b border-r border-slate-200 px-3 py-2 font-semibold uppercase tracking-wider text-emerald-600 text-right">Add (+)</th>
                                <th className="w-20 border-b border-r border-slate-200 px-3 py-2 font-semibold uppercase tracking-wider text-slate-700 text-center">Days</th>
                                <th className="w-32 border-b border-slate-200 px-3 py-2 font-semibold uppercase tracking-wider text-slate-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {initialMembers.map((m) => {
                                const u = updates[m.id] || { balanceDeduct: "", savingsIncrease: "" };
                                const memberErrors = errors.filter(e => e.memberId === m.id);
                                const memberCreatedAt = new Date(m.createdAt);

                                return (
                                    <tr key={m.id} className="group hover:bg-blue-500/5 odd:bg-white even:bg-slate-50">
                                        <td className="border-b border-r border-slate-200 px-3 py-2 font-medium transition-colors group-hover:border-blue-500/30">
                                            <Link href={`/app/members/${m.id}`} className="block truncate hover:text-blue-600 text-slate-900">
                                                {m.lastName}, {m.firstName}
                                            </Link>
                                            <div className="text-[10px] text-slate-500 uppercase tracking-tighter truncate">
                                                {m.group?.name || "No Group"}
                                            </div>
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-3 py-2 text-right font-mono font-medium text-slate-700 transition-colors group-hover:border-blue-500/30">
                                            {m.balance.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                        </td>
                                        <td className={`border-b border-r border-slate-200 px-1 py-1 transition-colors group-hover:border-blue-500/30 ${memberErrors.some(e => e.type === "balance") ? "bg-red-500/10" : "bg-blue-500/5"}`}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={u.balanceDeduct}
                                                onChange={(e) => handleChange(m.id, "balanceDeduct", e.target.value)}
                                                placeholder="0"
                                                className={`w-full bg-transparent px-2 py-1 text-right font-mono outline-none placeholder:text-blue-200 focus:bg-blue-500/10 rounded ${memberErrors.some(e => e.type === "balance") ? "text-red-600" : "text-blue-600"}`}
                                            />
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-3 py-2 text-right font-mono font-medium text-emerald-600 transition-colors group-hover:border-blue-500/30">
                                            {m.savings.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                        </td>
                                        <td className={`border-b border-r border-slate-200 px-1 py-1 transition-colors group-hover:border-blue-500/30 ${memberErrors.some(e => e.type === "savings") ? "bg-red-500/10" : "bg-emerald-500/5"}`}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={u.savingsIncrease}
                                                onChange={(e) => handleChange(m.id, "savingsIncrease", e.target.value)}
                                                placeholder="0"
                                                className={`w-full bg-transparent px-2 py-1 text-right font-mono outline-none placeholder:text-emerald-200 focus:bg-emerald-500/10 rounded ${memberErrors.some(e => e.type === "savings") ? "text-red-600" : "text-emerald-600"}`}
                                            />
                                        </td>
                                        <td className={`border-b border-r border-slate-200 px-1 py-1 transition-colors group-hover:border-blue-500/30 bg-slate-100`}>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={u.daysCount}
                                                onChange={(e) => handleChange(m.id, "daysCount", e.target.value)}
                                                placeholder={String(m.daysCount)}
                                                className="w-full bg-transparent px-2 py-1 text-center font-mono outline-none placeholder:text-slate-400 focus:bg-slate-200 rounded text-slate-900"
                                            />
                                        </td>
                                        <td className="border-b border-slate-200 px-3 py-2 transition-colors group-hover:border-blue-500/30">
                                            <div className="flex justify-end gap-1.5">
                                                <Link
                                                    href={`/app/members/${m.id}`}
                                                    title="View details"
                                                    className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                                >
                                                    <IconEye className="h-4 w-4" />
                                                </Link>
                                                {onEditMember ? (
                                                    <button
                                                        onClick={() => onEditMember(m)}
                                                        title="Edit"
                                                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                                    >
                                                        <IconPencil className="h-4 w-4" />
                                                    </button>
                                                ) : (
                                                    <Link
                                                        href={`/app/members/${m.id}/edit`}
                                                        title="Edit"
                                                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                                    >
                                                        <IconPencil className="h-4 w-4" />
                                                    </Link>
                                                )}
                                                {user.role === Role.SUPER_ADMIN ? (
                                                    onDeleteMember ? (
                                                        <button
                                                            onClick={() => onDeleteMember(m)}
                                                            title="Delete"
                                                            className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100 hover:text-red-700"
                                                        >
                                                            <IconTrash className="h-4 w-4" />
                                                        </button>
                                                    ) : (
                                                        <form action={() => deleteMemberAction(m.id)} className="inline">
                                                            <ConfirmSubmitButton
                                                                title="Delete"
                                                                confirmMessage={`Delete member "${m.lastName}, ${m.firstName}"?`}
                                                                className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100 hover:text-red-700"
                                                            >
                                                                <IconTrash className="h-4 w-4" />
                                                            </ConfirmSubmitButton>
                                                        </form>
                                                    )
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {initialMembers.length === 0 ? (
                                <tr>
                                    <td className="py-12 text-center text-slate-500 italic" colSpan={7}>
                                        {!groupId
                                            ? "Select a group to load member data..."
                                            : "No matching records found."}
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </div>
            {pagination && pagination.totalPages > 0 && (
                <PaginationControls
                    currentPage={pagination.page}
                    totalItems={pagination.totalCount}
                    pageSize={pagination.limit}
                    onPageChange={(p) => updateUrl({ page: p })}
                    onPageSizeChange={(l) => updateUrl({ limit: l, page: 1 })}
                    pageSizeOptions={[50, 100, 200, 500, 1000]}
                    className="border-t border-slate-200 bg-white px-4 py-3 rounded-2xl"
                />
            )}
        </div>
    );
}
