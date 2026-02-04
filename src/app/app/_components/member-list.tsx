"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconSearch, IconPencil, IconTrash, IconChevronUp, IconChevronDown, IconPlus, IconX, IconEye } from "./icons";
import { PaginationControls } from "./pagination-controls";
import { Role } from "@prisma/client";

export type Member = {
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
  balanceAdjustments?: {
    id: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    createdAt: string;
    encodedBy: { name: string };
  }[];
  _count?: {
    balanceAdjustments: number;
    savingsAdjustments: number;
  };
};

export type Group = {
  id: string;
  name: string;
};

interface MemberListProps {
  initialMembers: Member[];
  initialTotal: number;
  initialGroups: Group[];
  userRole: Role;
  initialGroupId?: string;
  fixedGroupId?: string;
  showTitle?: boolean;
}

export function MemberList({
  initialMembers,
  initialTotal,
  initialGroups,
  userRole,
  initialGroupId,
  fixedGroupId,
  showTitle = true,
}: MemberListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState(fixedGroupId || initialGroupId || "");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(false);
  
  // Bulk Edit State
  const [updates, setUpdates] = useState<Record<string, { balanceDeduct: string; savingsIncrease: string; daysCount: string }>>({});
  const [bulkErrors, setBulkErrors] = useState<{ memberId: string; message: string; type: string }[]>([]);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState(false);

  // View Modal State
  const [viewMember, setViewMember] = useState<Member | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  // Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  
  // Adjustment Form State
  const [adjustmentForm, setAdjustmentForm] = useState<{
    type: 'balance' | 'savings' | null;
    action: 'INCREASE' | 'DEDUCT' | 'WITHDRAW' | null;
    amount: string;
  }>({ type: null, action: null, amount: "" });
  const [adjustmentLoading, setAdjustmentLoading] = useState(false);

  // Adjustments State
  const [balanceAdjustments, setBalanceAdjustments] = useState<any[]>([]);
  const [balanceTotal, setBalanceTotal] = useState(0);
  const [balancePage, setBalancePage] = useState(1);
  const [balanceLimit, setBalanceLimit] = useState(5);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [savingsAdjustments, setSavingsAdjustments] = useState<any[]>([]);
  const [savingsTotal, setSavingsTotal] = useState(0);
  const [savingsPage, setSavingsPage] = useState(1);
  const [savingsLimit, setSavingsLimit] = useState(5);
  const [savingsLoading, setSavingsLoading] = useState(false);

  // Confirmation Modal State
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    type: 'DELETE_MEMBER' | 'REVERT_BALANCE' | 'REVERT_SAVINGS' | null;
    id: string | null;
    title: string;
    message: string;
  }>({ isOpen: false, type: null, id: null, title: "", message: "" });
  const [isConfirming, setIsConfirming] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    groupId: "",
    age: "",
    address: "",
    phoneNumber: "",
    balance: "0",
    savings: "0",
    daysCount: "0",
  });

  const canCreate = userRole === Role.SUPER_ADMIN || userRole === Role.ENCODER;
  const canDelete = userRole === Role.SUPER_ADMIN;
  const canBulkUpdate = userRole === Role.SUPER_ADMIN || userRole === Role.ENCODER;

  const fetchMembers = async (p = page, q = search, g = groupId, s = sort, l = limit) => {
    // If fixedGroupId is set, always use it
    const effectiveGroupId = fixedGroupId || g;

    if (!effectiveGroupId && !q) {
      if (!fixedGroupId) {
         // Only clear if we are not in fixed group mode (where we expect to show all members of that group)
         // Wait, original logic: if (!g && !q) setMembers([]). 
         // If fixedGroupId is set, effectiveGroupId is set, so we proceed.
         setMembers([]);
         setTotal(0);
         setIsLoading(false);
         return;
      }
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(l));
      if (q) params.set("q", q);
      if (effectiveGroupId) params.set("groupId", effectiveGroupId);
      if (s) params.set("sort", s);

      const res = await fetch(`/api/members?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch members");
      const data = await res.json();
      setMembers(data.items);
      setTotal(data.total);
      
      // Clear updates when data refreshes
      setUpdates({});
      setBulkErrors([]);
      setBulkSuccess(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
        setPage(1);
        fetchMembers(1, search, groupId, sort);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!fixedGroupId && groupId !== (searchParams.get("groupId") || "")) {
        setPage(1);
        fetchMembers(1, search, groupId, sort);
    }
  }, [groupId]);

  useEffect(() => {
      // If fixedGroupId changes (unlikely) or on mount
      if (fixedGroupId) {
          setGroupId(fixedGroupId);
          // fetchMembers called by search effect mostly, but ensuring correct group
      }
  }, [fixedGroupId]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchMembers(newPage, search, groupId, sort);
  };

  const handleSortToggle = () => {
    const newSort = sort === "asc" ? "desc" : "asc";
    setSort(newSort);
    fetchMembers(1, search, groupId, newSort);
  };

  // Bulk Update Handlers
  const handleBulkChange = (memberId: string, field: "balanceDeduct" | "savingsIncrease" | "daysCount", value: string) => {
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

  const handleBulkSave = async () => {
    if (Object.keys(updates).length === 0 || isBulkSaving) return;
    setIsBulkSaving(true);
    setBulkErrors([]);
    setBulkSuccess(false);

    try {
        const payload = Object.entries(updates).map(([memberId, data]) => ({
            memberId,
            ...data
        })).filter(u => u.balanceDeduct || u.savingsIncrease || u.daysCount);

        const res = await fetch("/api/members/bulk-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates: payload }),
        });
        
        const result = await res.json();
        
        if (!res.ok) throw new Error(result.error || "Failed to update");

        if (result.success) {
            setBulkSuccess(true);
            setUpdates({});
            fetchMembers(); // Refresh data
        } else {
            setBulkErrors(result.errors || []);
             // Refresh data to show partial updates if any
            fetchMembers();
        }
    } catch (error: any) {
        console.error(error);
        alert("An error occurred during bulk update.");
    } finally {
        setIsBulkSaving(false);
    }
  };

  const fetchBalanceAdjustments = async (memberId: string, page = 1, limit = balanceLimit) => {
    setBalanceLoading(true);
    try {
        const res = await fetch(`/api/adjustments/balance?memberId=${memberId}&page=${page}&limit=${limit}`);
        if (!res.ok) throw new Error("Failed to fetch balance adjustments");
        const data = await res.json();
        setBalanceAdjustments(data.items);
        setBalanceTotal(data.total);
        setBalancePage(data.page);
    } catch (error) {
        console.error(error);
    } finally {
        setBalanceLoading(false);
    }
  };

  const fetchSavingsAdjustments = async (memberId: string, page = 1, limit = savingsLimit) => {
    setSavingsLoading(true);
    try {
        const res = await fetch(`/api/adjustments/savings?memberId=${memberId}&page=${page}&limit=${limit}`);
        if (!res.ok) throw new Error("Failed to fetch savings adjustments");
        const data = await res.json();
        setSavingsAdjustments(data.items);
        setSavingsTotal(data.total);
        setSavingsPage(data.page);
    } catch (error) {
        console.error(error);
    } finally {
        setSavingsLoading(false);
    }
  };

  const handleViewMember = async (id: string) => {
    setIsViewModalOpen(true);
    setViewLoading(true);
    setViewMember(null);
    try {
        const res = await fetch(`/api/members/${id}`);
        if (!res.ok) throw new Error("Failed to fetch member details");
        const data = await res.json();
        setViewMember(data);
        
        // Fetch adjustments separately
        fetchBalanceAdjustments(id, 1);
        fetchSavingsAdjustments(id, 1);
    } catch (error) {
        console.error(error);
        alert("Failed to load member details");
        setIsViewModalOpen(false);
    } finally {
        setViewLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmation.id || !confirmation.type) return;
    setIsConfirming(true);
    
    try {
        if (confirmation.type === 'DELETE_MEMBER') {
            const res = await fetch(`/api/members/${confirmation.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete");
            fetchMembers();
            if (isViewModalOpen) setIsViewModalOpen(false);
        } else if (confirmation.type === 'REVERT_BALANCE') {
            const res = await fetch(`/api/adjustments/balance/${confirmation.id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to revert");
            }
            if (viewMember) {
                // Silent refresh of member data to update balance
                const memberRes = await fetch(`/api/members/${viewMember.id}`);
                if (memberRes.ok) {
                    const memberData = await memberRes.json();
                    setViewMember(memberData);
                }
                fetchBalanceAdjustments(viewMember.id, balancePage);
            }
            fetchMembers();
        } else if (confirmation.type === 'REVERT_SAVINGS') {
            const res = await fetch(`/api/adjustments/savings/${confirmation.id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to revert");
            }
            if (viewMember) {
                // Silent refresh of member data to update savings
                const memberRes = await fetch(`/api/members/${viewMember.id}`);
                if (memberRes.ok) {
                    const memberData = await memberRes.json();
                    setViewMember(memberData);
                }
                fetchSavingsAdjustments(viewMember.id, savingsPage);
            }
            fetchMembers();
        }
        
        setConfirmation({ ...confirmation, isOpen: false });
    } catch (error: any) {
        alert(error.message || "An error occurred");
    } finally {
        setIsConfirming(false);
    }
  };

  const handleRevertBalanceAdjustment = (adjId: string) => {
    setConfirmation({
        isOpen: true,
        type: 'REVERT_BALANCE',
        id: adjId,
        title: "Revert Balance Adjustment",
        message: "Are you sure you want to revert this adjustment? This will reverse the transaction."
    });
  };

  const handleRevertSavingsAdjustment = (adjId: string) => {
    setConfirmation({
        isOpen: true,
        type: 'REVERT_SAVINGS',
        id: adjId,
        title: "Revert Savings Adjustment",
        message: "Are you sure you want to revert this adjustment? This will reverse the transaction."
    });
  };

  const handleSaveAdjustment = async () => {
    if (!viewMember || !adjustmentForm.type || !adjustmentForm.action || !adjustmentForm.amount) return;
    
    setAdjustmentLoading(true);
    try {
        const endpoint = adjustmentForm.type === 'balance' ? '/api/adjustments/balance' : '/api/adjustments/savings';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                memberId: viewMember.id,
                type: adjustmentForm.action,
                amount: Number(adjustmentForm.amount)
            })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to create adjustment");
        }

        const result = await res.json();

        // Update viewMember balance/savings locally
        setViewMember(prev => {
            if (!prev) return null;
            return {
                ...prev,
                balance: result.newBalance !== undefined ? Number(result.newBalance) : prev.balance,
                savings: result.newSavings !== undefined ? Number(result.newSavings) : prev.savings
            };
        });

        // Refresh only the relevant table
        if (adjustmentForm.type === 'balance') {
            fetchBalanceAdjustments(viewMember.id, 1);
        } else {
            fetchSavingsAdjustments(viewMember.id, 1);
        }
        
        fetchMembers(); // Refresh main list in background
        setAdjustmentForm({ type: null, action: null, amount: "" });
    } catch (error: any) {
        alert(error.message);
    } finally {
        setAdjustmentLoading(false);
    }
  };

  // CRUD Handlers
  const handleOpenModal = (member?: Member) => {
    setEditingMember(member || null);
    setFormData({
        firstName: member?.firstName || "",
        lastName: member?.lastName || "",
        groupId: member?.groupId || (fixedGroupId || groupId) || (initialGroups.length > 0 ? initialGroups[0].id : ""),
        age: member?.age?.toString() || "",
        address: member?.address || "",
        phoneNumber: member?.phoneNumber || "",
        balance: member?.balance?.toString() || "0",
        savings: member?.savings?.toString() || "0",
        daysCount: member?.daysCount?.toString() || "0",
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);

    try {
        const url = editingMember ? `/api/members/${editingMember.id}` : "/api/members";
        const method = editingMember ? "PUT" : "POST";
        
        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...formData,
                groupId: formData.groupId, // Use form data group ID
                age: formData.age ? Number(formData.age) : undefined,
                balance: Number(formData.balance),
                savings: Number(formData.savings),
                daysCount: Number(formData.daysCount),
            }),
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to save member");
        }

        handleCloseModal();
        fetchMembers(); // Refresh list
    } catch (error: any) {
        setModalError(error.message);
    } finally {
        setModalLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmation({
        isOpen: true,
        type: 'DELETE_MEMBER',
        id,
        title: "Delete Member",
        message: "Are you sure you want to delete this member? This action cannot be undone."
    });
  };

  const hasChanges = Object.values(updates).some((u) => u.balanceDeduct !== "" || u.savingsIncrease !== "" || u.daysCount !== "");

  return (
    <div className="space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    {showTitle && <h1 className="text-xl font-semibold text-slate-100">Members</h1>}
                    <p className="mt-1 text-sm text-slate-400">
                        Manage members and perform bulk updates.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {canCreate && (
                        <button
                            onClick={() => handleOpenModal()}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
                        >
                            <IconPlus className="h-4 w-4" /> Add Member
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-6">
                <div className="md:col-span-3">
                    <label className="text-sm font-medium text-slate-300">Search</label>
                    <div className="relative mt-1">
                        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Name, phone, or group..."
                            className="w-full rounded-md border border-slate-700 bg-slate-800 pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                </div>
                {!fixedGroupId && (
                  <div className="md:col-span-2">
                      <label className="text-sm font-medium text-slate-300">Group</label>
                      <select
                          value={groupId}
                          onChange={(e) => setGroupId(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                          <option value="">Select Group</option>
                          {initialGroups.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                      </select>
                  </div>
                )}
            </div>
        </div>

        {bulkSuccess && (
            <div className="rounded-md bg-green-900/50 p-4 text-green-200">
                Bulk update successful!
            </div>
        )}
        
        {bulkErrors.length > 0 && (
            <div className="rounded-md bg-red-900/50 p-4 text-red-200">
                <p className="font-bold">Errors occurred during bulk update:</p>
                <ul className="list-disc pl-5 text-sm">
                    {bulkErrors.map((e, i) => (
                        <li key={i}>{e.message}</li>
                    ))}
                </ul>
            </div>
        )}

        <div className="mb-4 flex items-center justify-between min-h-[40px]">
             <div className="flex-1">
                <PaginationControls
                    currentPage={page}
                    totalItems={total}
                    pageSize={limit}
                    onPageChange={handlePageChange}
                    onPageSizeChange={(l) => {
                        setLimit(l);
                        setPage(1);
                    }}
                    pageSizeOptions={[50, 100, 200, 500, 1000]}
                />
             </div>
            
            {hasChanges && (
                <button
                    onClick={handleBulkSave}
                    disabled={isBulkSaving}
                    className="ml-4 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                    {isBulkSaving ? "Saving..." : "Save Changes"}
                </button>
            )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-200">
                        <tr>
                            <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-slate-900" onClick={handleSortToggle}>
                                <div className="flex items-center gap-1">
                                    Last Name
                                    {sort === "asc" ? <IconChevronUp className="h-3 w-3" /> : <IconChevronDown className="h-3 w-3" />}
                                </div>
                            </th>
                            <th className="px-4 py-3 font-semibold">First Name</th>
                            {!fixedGroupId && <th className="px-4 py-3 font-semibold">Group</th>}
                            <th className="px-4 py-3 font-semibold text-right">Balance</th>
                            <th className="px-4 py-3 font-semibold text-right">Savings</th>
                            <th className="px-4 py-3 font-semibold text-center">Days</th>
                            {canBulkUpdate && (
                                <>
                                    <th className="px-4 py-3 font-semibold w-24">Deduct</th>
                                    <th className="px-4 py-3 font-semibold w-24">Save</th>
                                    <th className="px-4 py-3 font-semibold w-20">Days</th>
                                </>
                            )}
                            <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {isLoading ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                                    Loading members...
                                </td>
                            </tr>
                        ) : members.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                                    No members found.
                                </td>
                            </tr>
                        ) : (
                            members.map((member) => (
                                <tr key={member.id} className="hover:bg-slate-800/50">
                                    <td className="px-4 py-3 font-medium text-slate-200">{member.lastName}</td>
                                    <td className="px-4 py-3 text-slate-300">{member.firstName}</td>
                                    {!fixedGroupId && <td className="px-4 py-3 text-slate-300">{member.group?.name || "-"}</td>}
                                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                                        {Number(member.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                                        {Number(member.savings).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3 text-center text-slate-300">{member.daysCount}</td>
                                    
                                    {canBulkUpdate && (
                                        <>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder="0.00"
                                                    className="w-full min-w-[80px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-slate-200 focus:border-red-500 focus:outline-none"
                                                    value={updates[member.id]?.balanceDeduct || ""}
                                                    onChange={(e) => handleBulkChange(member.id, "balanceDeduct", e.target.value)}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder="0.00"
                                                    className="w-full min-w-[80px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                                                    value={updates[member.id]?.savingsIncrease || ""}
                                                    onChange={(e) => handleBulkChange(member.id, "savingsIncrease", e.target.value)}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder={String(member.daysCount + 1)}
                                                    className="w-full min-w-[60px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-center text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                                                    value={updates[member.id]?.daysCount || ""}
                                                    onChange={(e) => handleBulkChange(member.id, "daysCount", e.target.value)}
                                                />
                                            </td>
                                        </>
                                    )}

                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => handleViewMember(member.id)}
                                                className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-blue-400"
                                                title="View Details"
                                            >
                                                <IconEye className="h-4 w-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleOpenModal(member)}
                                                className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-emerald-400"
                                                title="Edit"
                                            >
                                                <IconPencil className="h-4 w-4" />
                                            </button>
                                            {canDelete && (
                                                <button 
                                                    onClick={() => handleDelete(member.id)}
                                                    className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-red-400"
                                                    title="Delete"
                                                >
                                                    <IconTrash className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* View Modal */}
        {isViewModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="w-full max-w-7xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-100">Member Details</h2>
                        <button onClick={() => setIsViewModalOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
                            <IconX className="h-5 w-5" />
                        </button>
                    </div>

                    {viewLoading ? (
                        <div className="py-12 text-center text-slate-400">Loading details...</div>
                    ) : viewMember ? (
                        <div className="space-y-8">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                                    <h3 className="mb-4 text-sm font-medium text-slate-400 uppercase tracking-wider">Personal Info</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-xs text-slate-500">Full Name</div>
                                            <div className="text-lg font-medium text-slate-200">{viewMember.lastName}, {viewMember.firstName}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-xs text-slate-500">Group</div>
                                                <div className="text-slate-300">{viewMember.group?.name || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500">Days in System</div>
                                                <div className="text-slate-300">{viewMember.daysCount}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-xs text-slate-500">Age</div>
                                                <div className="text-slate-300">{viewMember.age || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500">Phone</div>
                                                <div className="text-slate-300">{viewMember.phoneNumber || "-"}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500">Address</div>
                                            <div className="text-slate-300">{viewMember.address || "-"}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                                        <h3 className="mb-4 text-sm font-medium text-slate-400 uppercase tracking-wider">Financials</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="rounded-lg bg-indigo-950/20 p-3 border border-indigo-900/30">
                                                <div className="text-xs text-indigo-400">Balance</div>
                                                <div className="text-xl font-bold text-indigo-200">
                                                    {Number(viewMember.balance).toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                                                </div>
                                            </div>
                                            <div className="rounded-lg bg-emerald-950/20 p-3 border border-emerald-900/30">
                                                <div className="text-xs text-emerald-400">Savings</div>
                                                <div className="text-xl font-bold text-emerald-200">
                                                    {Number(viewMember.savings).toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Manual Adjustment Form */}
                                    {userRole === Role.SUPER_ADMIN && (
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                                        <h3 className="mb-4 text-sm font-medium text-slate-400 uppercase tracking-wider">New Adjustment</h3>
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <select 
                                                    className="rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                                                    value={adjustmentForm.type || ""}
                                                    onChange={e => setAdjustmentForm({...adjustmentForm, type: e.target.value as any, action: null})}
                                                >
                                                    <option value="">Select Type</option>
                                                    <option value="balance">Balance</option>
                                                    <option value="savings">Savings</option>
                                                </select>
                                                <select 
                                                    className="rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                                                    value={adjustmentForm.action || ""}
                                                    onChange={e => setAdjustmentForm({...adjustmentForm, action: e.target.value as any})}
                                                    disabled={!adjustmentForm.type}
                                                >
                                                    <option value="">Select Action</option>
                                                    {adjustmentForm.type === 'balance' ? (
                                                        <>
                                                            <option value="DEDUCT">Deduct (Payment)</option>
                                                            <option value="INCREASE">Increase (Loan)</option>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <option value="INCREASE">Deposit</option>
                                                            <option value="WITHDRAW">Withdraw</option>
                                                        </>
                                                    )}
                                                </select>
                                            </div>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="number" 
                                                    placeholder="Amount"
                                                    className="flex-1 rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                                                    value={adjustmentForm.amount}
                                                    onChange={e => setAdjustmentForm({...adjustmentForm, amount: e.target.value})}
                                                />
                                                <button 
                                                    onClick={handleSaveAdjustment}
                                                    disabled={adjustmentLoading || !adjustmentForm.type || !adjustmentForm.action || !adjustmentForm.amount}
                                                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    {adjustmentLoading ? "Saving..." : "Save"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </div>

                            {/* History Tables */}
                            <div className="grid gap-6 md:grid-cols-2">
                                <div>
                                    <h3 className="mb-3 text-sm font-medium text-slate-300">Balance History</h3>
                                    <div className="rounded-lg border border-slate-800 overflow-hidden">
                                        <table className="w-full text-sm text-left text-slate-400">
                                            <thead className="bg-slate-900 text-slate-300">
                                                <tr>
                                                    <th className="px-3 py-2">Date</th>
                                                    <th className="px-3 py-2">Type</th>
                                                    <th className="px-3 py-2 text-right">Amount</th>
                                                    <th className="px-3 py-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {balanceLoading ? (
                                                    <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
                                                ) : balanceAdjustments.length === 0 ? (
                                                    <tr><td colSpan={4} className="p-4 text-center">No history</td></tr>
                                                ) : (
                                                    balanceAdjustments.map(adj => (
                                                        <tr key={adj.id}>
                                                            <td className="px-3 py-2">{new Date(adj.createdAt).toLocaleDateString()}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`text-xs px-2 py-0.5 rounded ${adj.type === 'DEDUCT' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                                                                    {adj.type}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">{adj.amount.toLocaleString()}</td>
                                                            <td className="px-3 py-2 text-right">
                                                                {canDelete && (
                                                                    <button onClick={() => handleRevertBalanceAdjustment(adj.id)} className="text-xs font-medium text-slate-500 hover:text-red-400 hover:underline" title="Revert Transaction">
                                                                        REVERT
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                        <PaginationControls
                                            currentPage={balancePage}
                                            totalItems={balanceTotal}
                                            pageSize={balanceLimit}
                                            onPageChange={(p) => fetchBalanceAdjustments(viewMember.id, p)}
                                            className="p-2 bg-slate-900"
                                            pageSizeOptions={[5, 10, 20]}
                                            onPageSizeChange={(s) => {
                                                setBalanceLimit(s);
                                                fetchBalanceAdjustments(viewMember.id, 1, s);
                                            }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="mb-3 text-sm font-medium text-slate-300">Savings History</h3>
                                    <div className="rounded-lg border border-slate-800 overflow-hidden">
                                        <table className="w-full text-sm text-left text-slate-400">
                                            <thead className="bg-slate-900 text-slate-300">
                                                <tr>
                                                    <th className="px-3 py-2">Date</th>
                                                    <th className="px-3 py-2">Type</th>
                                                    <th className="px-3 py-2 text-right">Amount</th>
                                                    <th className="px-3 py-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {savingsLoading ? (
                                                    <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
                                                ) : savingsAdjustments.length === 0 ? (
                                                    <tr><td colSpan={4} className="p-4 text-center">No history</td></tr>
                                                ) : (
                                                    savingsAdjustments.map(adj => (
                                                        <tr key={adj.id}>
                                                            <td className="px-3 py-2">{new Date(adj.createdAt).toLocaleDateString()}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`text-xs px-2 py-0.5 rounded ${adj.type === 'INCREASE' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                                                                    {adj.type}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">{adj.amount.toLocaleString()}</td>
                                                            <td className="px-3 py-2 text-right">
                                                                {canDelete && (
                                                                    <button onClick={() => handleRevertSavingsAdjustment(adj.id)} className="text-xs font-medium text-slate-500 hover:text-red-400 hover:underline" title="Revert Transaction">
                                                                        REVERT
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                        <PaginationControls
                                            currentPage={savingsPage}
                                            totalItems={savingsTotal}
                                            pageSize={savingsLimit}
                                            onPageChange={(p) => fetchSavingsAdjustments(viewMember.id, p)}
                                            className="p-2 bg-slate-900"
                                            pageSizeOptions={[5, 10, 20]}
                                            onPageSizeChange={(s) => {
                                                setSavingsLimit(s);
                                                fetchSavingsAdjustments(viewMember.id, 1, s);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-red-400">Failed to load member details.</div>
                    )}
                </div>
            </div>
        )}

        {/* Add/Edit Modal */}
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-100">
                            {editingMember ? "Edit Member" : "Add New Member"}
                        </h2>
                        <button
                            onClick={handleCloseModal}
                            className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        >
                            <IconX className="h-5 w-5" />
                        </button>
                    </div>

                    {modalError && (
                        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                            {modalError}
                        </div>
                    )}

                    <form onSubmit={handleFormSubmit} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    First Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    Last Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    Group <span className="text-red-400">*</span>
                                </label>
                                <select
                                    required
                                    value={formData.groupId}
                                    onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                >
                                    <option value="">Select Group</option>
                                    {initialGroups.map((g) => (
                                        <option key={g.id} value={g.id}>
                                            {g.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    Age (optional)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.age}
                                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    Phone Number (optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.phoneNumber}
                                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    Address (optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    Balance <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={formData.balance}
                                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                                    disabled={!!editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0)}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                {editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0) && (
                                    <p className="mt-1 text-xs text-amber-500">Cannot be edited due to member already has balance and savings adjustment records</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    Savings
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.savings}
                                    onChange={(e) => setFormData({ ...formData, savings: e.target.value })}
                                    disabled={!!editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0)}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                {editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0) && (
                                    <p className="mt-1 text-xs text-amber-500">Cannot be edited due to member already has balance and savings adjustment records</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-300">
                                    Days in System
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.daysCount}
                                    onChange={(e) => setFormData({ ...formData, daysCount: e.target.value })}
                                    disabled={!!editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0)}
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                {editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0) && (
                                    <p className="mt-1 text-xs text-amber-500">Cannot be edited due to member already has balance and savings adjustment records</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3 pt-2 border-t border-slate-800">
                            <button
                                type="button"
                                onClick={handleCloseModal}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                disabled={modalLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={modalLoading}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                            >
                                {modalLoading ? "Saving..." : (editingMember ? "Save Changes" : "Add Member")}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* Confirmation Modal */}
        {confirmation.isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-100">{confirmation.title}</h2>
                        <button
                            onClick={() => setConfirmation({ ...confirmation, isOpen: false })}
                            className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        >
                            <IconX className="h-5 w-5" />
                        </button>
                    </div>

                    <p className="text-sm text-slate-300">
                        {confirmation.message}
                    </p>

                    <div className="mt-6 flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setConfirmation({ ...confirmation, isOpen: false })}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                            disabled={isConfirming}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmAction}
                            disabled={isConfirming}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
                        >
                            {isConfirming ? "Confirming..." : "Confirm"}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
