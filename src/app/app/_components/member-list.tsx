"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconSearch, IconPencil, IconTrash, IconChevronUp, IconChevronDown, IconPlus, IconX, IconEye } from "./icons";
import { PaginationControls } from "./pagination-controls";
import { Role } from "@prisma/client";
import { formatDateManila } from "@/lib/date";

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
  todayPayment?: number;
  todaySavings?: number;
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
    notes: number;
  };
  latestCycle?: {
    cycleNumber: number;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
  cycles?: {
    id?: string;
    cycleNumber: number;
    startDate?: string | null;
    endDate?: string | null;
  }[];
  latestActiveReleaseAmount?: number | null;
  activeReleases?: {
    id: string;
    amount: number;
    releaseDate: string;
    createdAt: string;
  }[];
  processingFees?: {
    id: string;
    amount: number;
    createdAt: string;
    encodedBy: { name: string };
  }[];
  passbookFees?: {
    id: string;
    amount: number;
    createdAt: string;
    encodedBy: { name: string };
  }[];
  membershipFees?: {
    id: string;
    amount: number;
    createdAt: string;
    encodedBy: { name: string };
  }[];
  notes?: {
    id: string;
    content: string;
    createdAt: string;
  }[];
  latestNote?: string | null;
  latestNoteCreatedAt?: string | null;
  latestBalancePaymentCreatedAt?: string | null;
  shouldPrefillLatestNote?: boolean;
  latestTodayProcessingFee?: number | null;
  latestTodayPassbookFee?: number | null;
  latestTodayMembershipFee?: number | null;
  status?: string;
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
  initialDays?: number;
  initialStatus?: string;
}

export function MemberList({
  initialMembers,
  initialTotal,
  initialGroups,
  userRole,
  initialGroupId,
  fixedGroupId,
  showTitle = true,
  initialDays,
  initialStatus,
}: MemberListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState(fixedGroupId || initialGroupId || "");
  const [daysFilter, setDaysFilter] = useState(initialDays?.toString() || "0");
  const [statusFilter, setStatusFilter] = useState(initialStatus || "ACTIVE");
  const [newMemberFilter, setNewMemberFilter] = useState(false);
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(false);
  
  // Bulk Edit State
  const [updates, setUpdates] = useState<Record<string, { balanceDeduct: string; savingsIncrease: string; processingFee: string; passbookFee: string; membershipFee: string; daysCount: string; activeReleaseAmount: string; notes: string }>>({});
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const DRAFT_KEY = "member_list_bulk_draft";

  // Load draft on mount
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Check for new format with date validation
        if (parsed.date && parsed.updates) {
          const today = formatDateManila(new Date());
          if (parsed.date === today) {
            setUpdates(parsed.updates);
          } else {
            // Draft is stale (different day), ignore it
            console.log("Draft is stale, ignoring.");
          }
        } else {
          // Legacy format - treat as stale to fix the reported bug
          // (User reported yesterday's data appearing today)
          console.log("Legacy draft format detected, ignoring to prevent stale data.");
        }
      } catch (e) {
        console.error("Failed to parse draft", e);
      }
    }
    setIsDraftLoaded(true);
  }, []);

  // Save draft on change
  useEffect(() => {
    if (isDraftLoaded) {
      if (Object.keys(updates).length === 0) {
        localStorage.removeItem(DRAFT_KEY);
      } else {
        const draft = {
          date: formatDateManila(new Date()),
          updates: updates
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      }
    }
  }, [updates, isDraftLoaded]);

  const [bulkErrors, setBulkErrors] = useState<{ memberId: string; message: string; type: string }[]>([]);
  const [bulkWarnings, setBulkWarnings] = useState<{ memberId: string; message: string }[]>([]);
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
    type: 'balance' | 'savings' | 'activeRelease' | null;
    action: 'INCREASE' | 'DEDUCT' | 'WITHDRAW' | null;
    amount: string;
  }>({ type: null, action: null, amount: "" });
  const [adjustmentLoading, setAdjustmentLoading] = useState(false);
  const [activeReleaseAmount, setActiveReleaseAmount] = useState("");

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

  const [notesList, setNotesList] = useState<any[]>([]);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesPage, setNotesPage] = useState(1);
  const [notesLimit, setNotesLimit] = useState(5);
  const [notesLoading, setNotesLoading] = useState(false);

  const paymentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const totals = members.reduce(
    (acc, m) => {
      acc.balance += Number(m.balance ?? 0);
      acc.savings += Number(m.savings ?? 0);

      const activeInput = updates[m.id]?.activeReleaseAmount;
      const activeValue =
        activeInput !== undefined && activeInput !== ""
          ? parseFloat(activeInput) || 0
          : m.latestActiveReleaseAmount != null
          ? Number(m.latestActiveReleaseAmount)
          : 0;
      acc.activeRelease += activeValue;

      const paymentInput = updates[m.id]?.balanceDeduct;
      const paymentValue =
        paymentInput !== undefined && paymentInput !== ""
          ? parseFloat(paymentInput) || 0
          : m.todayPayment ?? 0;
      acc.payment += paymentValue;

      const savingsInput = updates[m.id]?.savingsIncrease;
      const savingsValue =
        savingsInput !== undefined && savingsInput !== ""
          ? parseFloat(savingsInput) || 0
          : m.todaySavings ?? 0;
      acc.paymentSavings += savingsValue;

      const pfInput = updates[m.id]?.processingFee;
      const pfValue =
        pfInput !== undefined && pfInput !== ""
          ? parseFloat(pfInput) || 0
          : m.latestTodayProcessingFee ?? 0;
      acc.pf += pfValue;

      const pbInput = updates[m.id]?.passbookFee;
      const pbValue =
        pbInput !== undefined && pbInput !== ""
          ? parseFloat(pbInput) || 0
          : m.latestTodayPassbookFee ?? 0;
      acc.pb += pbValue;

      const mfInput = updates[m.id]?.membershipFee;
      const mfValue =
        mfInput !== undefined && mfInput !== ""
          ? parseFloat(mfInput) || 0
          : m.latestTodayMembershipFee ?? 0;
      acc.mf += mfValue;

      return acc;
    },
    { balance: 0, activeRelease: 0, savings: 0, payment: 0, paymentSavings: 0, pf: 0, pb: 0, mf: 0 },
  );

  // Confirmation Modal State
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    type: 'DELETE_MEMBER' | 'REVERT_BALANCE' | 'REVERT_SAVINGS' | 'DELETE_NOTE' | null;
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
    cycles: [] as { id?: string; cycleNumber: string; startDate: string; endDate: string }[],
    activeReleaseAmount: "",
    status: "ACTIVE",
  });

  const canCreate = userRole === Role.SUPER_ADMIN || userRole === Role.ENCODER;
  const canDelete = userRole === Role.SUPER_ADMIN;
  const canBulkUpdate = userRole === Role.SUPER_ADMIN || userRole === Role.ENCODER;
  const canManageActiveRelease = userRole === Role.SUPER_ADMIN || userRole === Role.ENCODER;

  const fetchMembers = async (p = page, q = search, g = groupId, s = sort, l = limit, d = daysFilter, stat = statusFilter, nm = newMemberFilter) => {
    // If fixedGroupId is set, always use it
    const effectiveGroupId = fixedGroupId || g;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(l));
      if (q) params.set("q", q);
      if (effectiveGroupId) params.set("groupId", effectiveGroupId);
      if (s) params.set("sort", s);
      if (d && d !== "0") params.set("days", d);
      if (stat && stat !== "ALL") params.set("status", stat);
      if (nm) params.set("newMember", "true");

      const res = await fetch(`/api/members?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch members");
      const data = await res.json();
      setMembers(data.items);
      setTotal(data.total);
      
      // Clear updates when data refreshes
      // setUpdates({}); // Removed to allow draft persistence across navigations
      setBulkErrors([]);
      setBulkWarnings([]);
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
        fetchMembers(1, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const isMounted = useRef(false);
  useEffect(() => {
    if (isMounted.current && !fixedGroupId) {
        setPage(1);
        fetchMembers(1, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
    } else {
        isMounted.current = true;
    }
  }, [groupId]);

  useEffect(() => {
    if (isMounted.current) {
        setPage(1);
        fetchMembers(1, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
    }
  }, [daysFilter]);

  useEffect(() => {
    if (isMounted.current) {
        setPage(1);
        fetchMembers(1, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (isMounted.current) {
        setPage(1);
        fetchMembers(1, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
    }
  }, [newMemberFilter]);

  useEffect(() => {
      // If fixedGroupId changes (unlikely) or on mount
      if (fixedGroupId) {
          setGroupId(fixedGroupId);
          // fetchMembers called by search effect mostly, but ensuring correct group
      }
  }, [fixedGroupId]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchMembers(newPage, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
  };

  const handleSortToggle = () => {
    const newSort = sort === "asc" ? "desc" : "asc";
    setSort(newSort);
    fetchMembers(1, search, groupId, newSort, limit, daysFilter, statusFilter, newMemberFilter);
  };

  // Bulk Update Handlers
  const handleBulkChange = (memberId: string, field: "balanceDeduct" | "savingsIncrease" | "processingFee" | "passbookFee" | "membershipFee" | "daysCount" | "activeReleaseAmount" | "notes", value: string) => {
    if (field === "daysCount") {
        if (value !== "" && !/^\d*$/.test(value)) return;
    } else if (field === "notes") {
        // No restrictions
    } else {
        if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    }

    setUpdates((prev) => ({
      ...prev,
      [memberId]: {
          ...(prev[memberId] || { balanceDeduct: "", savingsIncrease: "", processingFee: "", passbookFee: "", membershipFee: "", daysCount: "", activeReleaseAmount: "", notes: "" }),
        [field]: value,
      },
    }));
  };

  const handleBulkInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, memberId: string) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();

    const index = members.findIndex((m) => m.id === memberId);
    if (index === -1) return;

    const nextIndex = e.key === "ArrowDown" ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= members.length) return;

    const nextMemberId = members[nextIndex].id;
    const nextInput = paymentInputRefs.current[nextMemberId];
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  const handleBulkSave = async () => {
    if (Object.keys(updates).length === 0 || isBulkSaving) return;
    setIsBulkSaving(true);
    setBulkErrors([]);
    setBulkWarnings([]);
    setBulkSuccess(false);

    try {
      const payload = Object.entries(updates)
        .map(([memberId, data]) => ({
          memberId,
          ...data,
        }))
        .filter(
          (u) =>
            u.balanceDeduct ||
            u.savingsIncrease ||
            u.processingFee ||
            u.passbookFee ||
            u.membershipFee ||
            u.daysCount ||
            u.activeReleaseAmount ||
            u.notes,
        );

      if (payload.length === 0) {
        setBulkSuccess(false);
        return;
      }

      const res = await fetch("/api/members/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: payload }),
      });

      let result: any = null;
      try {
        result = await res.json();
      } catch (e) {
        throw new Error("Failed to parse server response for bulk update");
      }

      if (!res.ok) throw new Error(result.error || "Failed to update");

      if (result.success) {
          setBulkSuccess(true);
          setUpdates({});
          localStorage.removeItem(DRAFT_KEY);
          setBulkWarnings(result.warnings || []);
          fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter); // Refresh data
        } else {
          setBulkErrors(result.errors || []);
          setBulkWarnings(result.warnings || []);
          // Refresh data to show partial updates if any
          fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
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

  const fetchNotes = async (memberId: string, page = 1, limit = notesLimit) => {
    setNotesLoading(true);
    try {
        const res = await fetch(`/api/members/${memberId}/notes?page=${page}&limit=${limit}`);
        if (!res.ok) throw new Error("Failed to fetch notes");
        const data = await res.json();
        setNotesList(data.items);
        setNotesTotal(data.total);
        setNotesPage(data.page);
    } catch (error) {
        console.error(error);
    } finally {
        setNotesLoading(false);
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
        fetchNotes(id, 1);
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
            fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
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
            fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
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
            fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
        } else if (confirmation.type === 'DELETE_NOTE') {
            const res = await fetch(`/api/members/notes/${confirmation.id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to delete note");
            }
            if (viewMember) {
                fetchNotes(viewMember.id, notesPage);
                // Also update the note count in the main list
                fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
            }
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

  const handleDeleteNote = (noteId: string) => {
    setConfirmation({
        isOpen: true,
        type: 'DELETE_NOTE',
        id: noteId,
        title: "Delete Note",
        message: "Are you sure you want to permanently delete this note?"
    });
  };

  const handleSaveAdjustment = async () => {
    if (!viewMember) return;
    if (adjustmentForm.type === 'activeRelease') {
        if (!activeReleaseAmount) return;
        setAdjustmentLoading(true);
        try {
            const res = await fetch('/api/active-releases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    memberId: viewMember.id,
                    amount: Number(activeReleaseAmount),
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to create active release");
            }

            const created = await res.json();

            setViewMember(prev => {
                if (!prev) return null;
                const existing = prev.activeReleases || [];
                const updatedReleases = [
                    {
                        id: created.id,
                        amount: created.amount,
                        releaseDate: created.releaseDate,
                        createdAt: created.createdAt,
                    },
                    ...existing,
                ];
                return {
                    ...prev,
                    activeReleases: updatedReleases,
                    latestActiveReleaseAmount: created.amount,
                };
            });

            setActiveReleaseAmount("");
            fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter);
        } catch (error: any) {
            alert(error.message || "Failed to create active release");
        } finally {
            setAdjustmentLoading(false);
        }
        return;
    }

    if (!adjustmentForm.type || !adjustmentForm.action || !adjustmentForm.amount) return;
    
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
        
        fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter); // Refresh main list in background
        setAdjustmentForm({ type: null, action: null, amount: "" });
    } catch (error: any) {
        alert(error.message);
    } finally {
        setAdjustmentLoading(false);
    }
  };

  // CRUD Handlers
  const handleOpenModal = async (member?: Member) => {
    setEditingMember(member || null);

    let initialCycles: { id?: string; cycleNumber: string; startDate: string; endDate: string }[] = [];
    
    // If we have a member, try to use their cycles, fallback to latestCycle
    if (member) {
        // If the member object already has cycles (from View modal or specialized fetch), use them
        if (member.cycles && member.cycles.length > 0) {
            initialCycles = member.cycles.map(c => ({
                id: c.id,
                cycleNumber: c.cycleNumber.toString(),
                startDate: c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : "",
                endDate: c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : ""
            }));
        } 
        // Fallback to latestCycle if available
        else if (member.latestCycle) {
            initialCycles = [{
                cycleNumber: member.latestCycle.cycleNumber.toString(),
                startDate: member.latestCycle.startDate ? new Date(member.latestCycle.startDate).toISOString().split('T')[0] : "",
                endDate: member.latestCycle.endDate ? new Date(member.latestCycle.endDate).toISOString().split('T')[0] : ""
            }];
        }
    }

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
        cycles: initialCycles,
        activeReleaseAmount: member?.latestActiveReleaseAmount?.toString() || "",
        status: member?.status || "ACTIVE",
    });
    setModalError(null);
    setIsModalOpen(true);

    // If editing, fetch full details to ensure we have all cycles
    if (member) {
        try {
            const res = await fetch(`/api/members/${member.id}`);
            if (res.ok) {
                const fullMember = await res.json();
                if (fullMember.cycles && fullMember.cycles.length > 0) {
                    const fetchedCycles = fullMember.cycles.map((c: any) => ({
                        id: c.id,
                        cycleNumber: c.cycleNumber.toString(),
                        startDate: c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : "",
                        endDate: c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : ""
                    })).sort((a: any, b: any) => {
                        // Sort by start date ascending
                        if (a.startDate && b.startDate) {
                            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
                        }
                        // Fallback to cycle number ascending
                        return parseInt(a.cycleNumber) - parseInt(b.cycleNumber);
                    });
                    
                    setFormData(prev => ({
                        ...prev,
                        cycles: fetchedCycles
                    }));
                }
            }
        } catch (error) {
            console.error("Failed to fetch full member details for editing", error);
        }
    }
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
                groupId: formData.groupId,
                age: formData.age ? Number(formData.age) : undefined,
                balance: Number(formData.balance),
                savings: Number(formData.savings),
                daysCount: Number(formData.daysCount),
                status: formData.status,
                cycles: formData.cycles.map(c => ({
                    id: c.id,
                    cycleNumber: Number(c.cycleNumber),
                    startDate: c.startDate,
                    endDate: c.endDate
                })).filter(c => c.cycleNumber),
                activeReleaseAmount: formData.activeReleaseAmount
                    ? Number(formData.activeReleaseAmount)
                    : undefined,
            }),
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to save member");
        }

        handleCloseModal();
        fetchMembers(page, search, groupId, sort, limit, daysFilter, statusFilter, newMemberFilter); // Refresh list
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
        title: "Deactivate Member",
        message: "Are you sure you want to deactivate this member? This will mark them as INACTIVE instead of permanently deleting them."
    });
  };

  const hasChanges = Object.values(updates).some(
    (u) =>
      u.balanceDeduct !== "" ||
      u.savingsIncrease !== "" ||
      u.processingFee !== "" ||
      u.passbookFee !== "" ||
      u.membershipFee !== "" ||
      u.daysCount !== "" ||
      u.activeReleaseAmount !== "" ||
      u.notes !== "",
  );

  const tableColSpan = 9 + (fixedGroupId ? 0 : 1) + (canBulkUpdate ? 6 : 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    {showTitle && <h1 className="text-xl font-semibold text-slate-900">Members</h1>}
                    <p className="mt-1 text-sm text-slate-500">
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
                <div className="md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Search</label>
                    <div className="relative mt-1">
                        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Name, phone, or group..."
                            className="w-full rounded-md border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                </div>
                {!fixedGroupId && (
                  <div className="md:col-span-1">
                      <label className="text-sm font-medium text-slate-700">Group</label>
                      <select
                          value={groupId}
                          onChange={(e) => setGroupId(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                          <option value="">All Groups</option>
                          {initialGroups.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                      </select>
                  </div>
                )}
                <div className="md:col-span-1">
                    <label className="text-sm font-medium text-slate-600">Days</label>
                    <select
                        value={daysFilter}
                        onChange={(e) => setDaysFilter(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                        <option value="0">All Days</option>
                        <option value="40">40+ Days</option>
                    </select>
                </div>
                <div className="md:col-span-1">
                    <label className="text-sm font-medium text-slate-600">Status</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="ALL">All</option>
                    </select>
                </div>
                <div className="md:col-span-1">
                    <label className="text-sm font-medium text-slate-600">New Member</label>
                    <select
                        value={newMemberFilter ? "TRUE" : "FALSE"}
                        onChange={(e) => setNewMemberFilter(e.target.value === "TRUE")}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                        <option value="FALSE">No</option>
                        <option value="TRUE">Yes</option>
                    </select>
                </div>
            </div>
        </div>

        {bulkSuccess && (
            <div className="rounded-md bg-green-50 p-4 text-green-700">
                Bulk update successful!
            </div>
        )}

        {bulkWarnings.length > 0 && (
            <div className="rounded-md bg-yellow-50 p-4 text-yellow-700">
                <p className="font-bold">Warnings:</p>
                <ul className="list-disc pl-5 text-sm">
                    {bulkWarnings.map((w, i) => (
                        <li key={i}>{w.message}</li>
                    ))}
                </ul>
            </div>
        )}
        
        {bulkErrors.length > 0 && (
            <div className="rounded-md bg-red-50 p-4 text-red-700">
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
                        fetchMembers(1, search, groupId, sort, l, daysFilter, statusFilter, newMemberFilter);
                    }}
                    pageSizeOptions={[50, 100, 200, 500, 1000]}
                />
             </div>
            
            {hasChanges && (
                <div className="flex items-center gap-2 ml-4">
                    <button
                        onClick={() => {
                            if (confirm("Are you sure you want to discard all pending changes?")) {
                                setUpdates({});
                                localStorage.removeItem(DRAFT_KEY);
                            }
                        }}
                        disabled={isBulkSaving}
                        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                    >
                        Discard Draft
                    </button>
                    <button
                        onClick={handleBulkSave}
                        disabled={isBulkSaving}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                        {isBulkSaving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-emerald-300 bg-emerald-200" />
                <span>Updated today</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-blue-300 bg-blue-200" />
                <span>New member</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-red-300 bg-red-200" />
                <span>Zero balance</span>
            </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="min-h-0 overflow-auto">
                <table className="w-full text-left text-sm text-slate-500">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700 border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3 font-semibold text-center w-12">No.</th>
                            <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-slate-100" onClick={handleSortToggle}>
                                <div className="flex items-center gap-1">
                                    Member
                                    {sort === "asc" ? <IconChevronUp className="h-3 w-3" /> : <IconChevronDown className="h-3 w-3" />}
                                </div>
                            </th>
                            {!fixedGroupId && <th className="px-4 py-3 font-semibold">Group</th>}
                            <th className="px-4 py-3 font-semibold text-right">Balance Amount</th>
                            <th className="px-4 py-3 font-semibold text-right">Active Release</th>
                            <th className="px-4 py-3 font-semibold text-right">Savings Amount</th>
                            <th className="px-4 py-3 font-semibold text-left w-40">Notes</th>
                            <th className="px-4 py-3 font-semibold text-center"># of Days</th>
                            <th className="px-4 py-3 font-semibold text-center">Cycle</th>
                            {canBulkUpdate && (
                                <>
                                    <th className="px-4 py-3 font-semibold w-24">Payment</th>
                                    <th className="px-4 py-3 font-semibold w-24">Savings</th>
                                    <th className="px-4 py-3 font-semibold w-20">Days</th>
                                    <th className="px-4 py-3 font-semibold w-20">PF</th>
                                    <th className="px-4 py-3 font-semibold w-20">PB</th>
                                    <th className="px-4 py-3 font-semibold w-24">Mem Fee</th>
                                </>
                            )}
                            <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {isLoading ? (
                            <tr>
                                <td colSpan={tableColSpan} className="px-4 py-8 text-center text-slate-500">
                                    Loading members...
                                </td>
                            </tr>
                        ) : members.length === 0 ? (
                            <tr>
                                <td colSpan={tableColSpan} className="px-4 py-8 text-center text-slate-500">
                                    No members found.
                                </td>
                            </tr>
                        ) : (
                            <>
                            {members.map((member, index) => {
                                const hasTodayUpdate =
                                  (member.todayPayment ?? 0) > 0 ||
                                  (member.todaySavings ?? 0) > 0;
                                const hasZeroBalance = Number(member.balance) === 0;
                                const isNewMember = 
                                  Number(member.balance) > 0 && 
                                  member.latestActiveReleaseAmount != null &&
                                  Number(member.balance) === Number(member.latestActiveReleaseAmount);

                                const rowClass = hasZeroBalance
                                  ? "bg-red-50 hover:bg-red-100"
                                  : hasTodayUpdate
                                    ? "bg-emerald-50 hover:bg-emerald-100"
                                    : isNewMember
                                      ? "bg-blue-50 hover:bg-blue-100"
                                      : "hover:bg-slate-50";

                                return (
                                <tr key={member.id} className={rowClass}>
                                    <td className="px-4 py-3 text-center text-slate-400 font-mono text-xs">
                                        {(page - 1) * limit + index + 1}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        <div className="flex items-center gap-2">
                                            {member.lastName}, {member.firstName}
                                            {member._count && member._count.notes > 0 && (
                                                <span 
                                                    title={`${member._count.notes} notes available`}
                                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600"
                                                >
                                                    {member._count.notes}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    {!fixedGroupId && <td className="px-4 py-3 text-slate-600">{member.group?.name || "-"}</td>}
                                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                                        {Number(member.balance).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                                        {canBulkUpdate ? (
                                            <input
                                                type="text"
                                                placeholder={member.latestActiveReleaseAmount != null ? String(member.latestActiveReleaseAmount) : "0"}
                                                className="w-full min-w-[90px] rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                                                value={updates[member.id]?.activeReleaseAmount ?? (member.latestActiveReleaseAmount != null ? String(member.latestActiveReleaseAmount) : "")}
                                                onChange={(e) => handleBulkChange(member.id, "activeReleaseAmount", e.target.value)}
                                            />
                                        ) : (
                                            <span className="font-mono text-slate-600">
                                                {member.latestActiveReleaseAmount != null
                                                    ? Number(member.latestActiveReleaseAmount).toLocaleString('en-US', { minimumFractionDigits: 0 })
                                                    : "-"}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                                        {Number(member.savings).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="px-4 py-3">
                                        {canBulkUpdate ? (
                                            <input
                                                type="text"
                                                placeholder="Notes..."
                                                className="w-full min-w-[120px] rounded border border-slate-200 bg-white px-2 py-1 text-left text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                                                value={updates[member.id]?.notes ?? (member.shouldPrefillLatestNote ? (member.latestNote || "") : "")}
                                                onChange={(e) => handleBulkChange(member.id, "notes", e.target.value)}
                                            />
                                        ) : (
                                            <span className="text-slate-400 text-xs">{member.latestNote || "-"}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center text-slate-600">{member.daysCount}</td>
                                    <td className="px-4 py-3 text-center text-slate-600">
                                        {member.latestCycle ? `#${member.latestCycle.cycleNumber}` : "-"}
                                    </td>
                                    
                                    {canBulkUpdate && (
                                        <>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder={
                                                        member.todayPayment && member.todayPayment > 0
                                                            ? String(member.todayPayment)
                                                            : "0"
                                                    }
                                                    className="w-full min-w-[80px] rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-900 focus:border-red-500 focus:outline-none"
                                                    value={updates[member.id]?.balanceDeduct ?? ""}
                                                    onChange={(e) => handleBulkChange(member.id, "balanceDeduct", e.target.value)}
                                                    ref={(el) => {
                                                        paymentInputRefs.current[member.id] = el;
                                                    }}
                                                    onKeyDown={(e) => handleBulkInputKeyDown(e, member.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder={
                                                        member.todaySavings && member.todaySavings > 0
                                                            ? String(member.todaySavings)
                                                            : "0"
                                                    }
                                                    className="w-full min-w-[80px] rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
                                                    value={updates[member.id]?.savingsIncrease ?? ""}
                                                    onChange={(e) => handleBulkChange(member.id, "savingsIncrease", e.target.value)}
                                                    onKeyDown={(e) => handleBulkInputKeyDown(e, member.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder={String(member.daysCount)}
                                                    className="w-full min-w-[60px] rounded border border-slate-200 bg-white px-2 py-1 text-center text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                                                    value={updates[member.id]?.daysCount ?? String(member.daysCount)}
                                                    onChange={(e) => handleBulkChange(member.id, "daysCount", e.target.value)}
                                                    onKeyDown={(e) => handleBulkInputKeyDown(e, member.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder="0"
                                                    className="w-full min-w-[60px] rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
                                                    value={updates[member.id]?.processingFee ?? (member.latestTodayProcessingFee != null ? String(member.latestTodayProcessingFee) : "")}
                                                    onChange={(e) => handleBulkChange(member.id, "processingFee", e.target.value)}
                                                    onKeyDown={(e) => handleBulkInputKeyDown(e, member.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder="0"
                                                    className="w-full min-w-[60px] rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
                                                    value={updates[member.id]?.passbookFee ?? (member.latestTodayPassbookFee != null ? String(member.latestTodayPassbookFee) : "")}
                                                    onChange={(e) => handleBulkChange(member.id, "passbookFee", e.target.value)}
                                                    onKeyDown={(e) => handleBulkInputKeyDown(e, member.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    placeholder="0"
                                                    className="w-full min-w-[60px] rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
                                                    value={updates[member.id]?.membershipFee ?? (member.latestTodayMembershipFee != null ? String(member.latestTodayMembershipFee) : "")}
                                                    onChange={(e) => handleBulkChange(member.id, "membershipFee", e.target.value)}
                                                    onKeyDown={(e) => handleBulkInputKeyDown(e, member.id)}
                                                />
                                            </td>
                                        </>
                                    )}

                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => handleViewMember(member.id)}
                                                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                                                title="View Details"
                                            >
                                                <IconEye className="h-4 w-4" />
                                            </button>
                                            {(userRole === Role.SUPER_ADMIN || userRole === Role.ENCODER) && (
                                              <button 
                                                  onClick={() => handleOpenModal(member)}
                                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-emerald-600"
                                                  title="Edit"
                                              >
                                                  <IconPencil className="h-4 w-4" />
                                              </button>
                                            )}
                                            {canDelete && (
                                                <button 
                                                    onClick={() => handleDelete(member.id)}
                                                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                                                    title="Delete"
                                                >
                                                    <IconTrash className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                            <tr className="bg-slate-100 font-semibold border-t-2 border-slate-200">
                                <td className="px-4 py-3 text-center text-slate-400 font-mono text-xs italic">
                                    {members.length}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-900" colSpan={fixedGroupId ? 1 : 2}>
                                    Totals
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-slate-900">
                                    {totals.balance.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-slate-900">
                                    {totals.activeRelease.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-slate-900">
                                    {totals.savings.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                </td>
                                <td className="px-4 py-3" />
                                <td className="px-4 py-3" />
                                <td className="px-4 py-3" />
                                {canBulkUpdate && (
                                    <>
                                        <td className="px-4 py-3 text-right font-mono text-slate-900">
                                            {totals.payment.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-900">
                                            {totals.paymentSavings.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-4 py-3" />
                                        <td className="px-4 py-3 text-right font-mono text-slate-900">
                                            {totals.pf.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-900">
                                            {totals.pb.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-900">
                                            {totals.mf.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                        </td>
                                    </>
                                )}
                                <td className="px-4 py-3" />
                            </tr>
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Bottom Actions */}
        {hasChanges && (
            <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-2xl backdrop-blur-sm md:static md:mt-4 md:justify-end md:bg-transparent md:p-0 md:shadow-none md:border-0">
                <div className="hidden md:block text-sm text-slate-500 mr-2">
                    You have unsaved changes
                </div>
                <button
                    onClick={() => {
                        if (confirm("Are you sure you want to discard all pending changes?")) {
                            setUpdates({});
                        }
                    }}
                    disabled={isBulkSaving}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                >
                    Discard Draft
                </button>
                <button
                    onClick={handleBulkSave}
                    disabled={isBulkSaving}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 shadow-lg shadow-green-900/20 disabled:opacity-50"
                >
                    {isBulkSaving ? "Saving..." : "Save Changes"}
                </button>
            </div>
        )}

        {/* View Modal */}
        {isViewModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                <div className="w-full max-w-7xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-900">Member Details</h2>
                        <button onClick={() => setIsViewModalOpen(false)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                            <IconX className="h-5 w-5" />
                        </button>
                    </div>

                    {viewLoading ? (
                        <div className="py-12 text-center text-slate-500">Loading details...</div>
                    ) : viewMember ? (
                        <div className="space-y-8">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">Personal Info</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-xs text-slate-500">Full Name</div>
                                            <div className="text-lg font-medium text-slate-900">{viewMember.lastName}, {viewMember.firstName}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-xs text-slate-500">Group</div>
                                                <div className="text-slate-700">{viewMember.group?.name || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500">Days in System</div>
                                                <div className="text-slate-700">{viewMember.daysCount}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-xs text-slate-500">Current Cycle</div>
                                                <div className="text-slate-700">
                                                    {viewMember.latestCycle ? `#${viewMember.latestCycle.cycleNumber}` : "-"}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500">Status</div>
                                                <div className="text-slate-700">
                                                    {viewMember.status ? (
                                                        <span
                                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                                viewMember.status === "INACTIVE"
                                                                    ? "bg-rose-100 text-rose-700"
                                                                    : "bg-emerald-100 text-emerald-700"
                                                            }`}
                                                        >
                                                            {viewMember.status === "INACTIVE" ? "Inactive" : "Active"}
                                                        </span>
                                                    ) : "-"}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-xs text-slate-500">Age</div>
                                                <div className="text-slate-700">{viewMember.age || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500">Phone</div>
                                                <div className="text-slate-700">{viewMember.phoneNumber || "-"}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500">Address</div>
                                            <div className="text-slate-700">{viewMember.address || "-"}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">Cycle History</h3>
                                    {viewMember.cycles && viewMember.cycles.length > 0 ? (
                                        <div className="overflow-hidden rounded-lg border border-slate-200">
                                            <table className="w-full text-left text-sm text-slate-500">
                                                <thead className="bg-slate-50 text-xs uppercase text-slate-700">
                                                    <tr>
                                                        <th className="px-3 py-2 font-medium">Cycle</th>
                                                        <th className="px-3 py-2 font-medium">Start</th>
                                                        <th className="px-3 py-2 font-medium">End</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200 bg-white">
                                                    {viewMember.cycles.map((cycle, index) => (
                                                        <tr key={cycle.id || index}>
                                                            <td className="px-3 py-2 text-slate-900">#{cycle.cycleNumber}</td>
                                                            <td className="px-3 py-2">{cycle.startDate ? formatDateManila(cycle.startDate) : "-"}</td>
                                                            <td className="px-3 py-2">{cycle.endDate ? formatDateManila(cycle.endDate) : "-"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 text-sm text-slate-500">No cycle history available</div>
                                    )}
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">Notes History</h3>
                                    {notesLoading ? (
                                        <div className="py-4 text-center text-sm text-slate-500">Loading notes...</div>
                                    ) : notesList && notesList.length > 0 ? (
                                        <div className="space-y-3">
                                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                                {notesList.map((note) => (
                                                    <div key={note.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[10px] font-bold uppercase text-slate-400">
                                                                {formatDateManila(note.createdAt)}
                                                            </span>
                                                            {(userRole === Role.SUPER_ADMIN || userRole === Role.ENCODER) && (
                                                                <button 
                                                                    onClick={() => handleDeleteNote(note.id)}
                                                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                                                    title="Delete Note"
                                                                >
                                                                    <IconTrash className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <PaginationControls
                                                currentPage={notesPage}
                                                totalItems={notesTotal}
                                                pageSize={notesLimit}
                                                onPageChange={(p) => fetchNotes(viewMember.id, p)}
                                                className="mt-2"
                                                pageSizeOptions={[5, 10, 20]}
                                                onPageSizeChange={(s) => {
                                                    setNotesLimit(s);
                                                    fetchNotes(viewMember.id, 1, s);
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 text-sm text-slate-500 italic">No notes recorded yet.</div>
                                    )}
                                </div>

                                <div className="space-y-6">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">Financials</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="rounded-lg bg-indigo-50 p-3 border border-indigo-100">
                                                <div className="text-xs text-indigo-600">Balance</div>
                                                <div className="text-xl font-bold text-indigo-700">
                                                    {Number(viewMember.balance).toLocaleString('en-US', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 })}
                                                </div>
                                            </div>
                                            <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-100">
                                                <div className="text-xs text-emerald-600">Savings</div>
                                                <div className="text-xl font-bold text-emerald-700">
                                                    {Number(viewMember.savings).toLocaleString('en-US', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">Processing Fee History</h3>
                                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                                            {viewMember.processingFees && viewMember.processingFees.length > 0 ? (
                                                <table className="w-full text-sm text-left text-slate-500">
                                                    <thead className="bg-slate-50 text-slate-700">
                                                        <tr>
                                                            <th className="px-3 py-2 font-medium">Date</th>
                                                            <th className="px-3 py-2 text-right font-medium">Amount</th>
                                                            <th className="px-3 py-2 font-medium">Encoded By</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200 bg-white">
                                                        {viewMember.processingFees.map((pf) => (
                                                            <tr key={pf.id}>
                                                                <td className="px-3 py-2">
                                                                    {formatDateManila(pf.createdAt)}
                                                                </td>
                                                                <td className="px-3 py-2 text-right">
                                                                    {Number(pf.amount).toLocaleString('en-US', {
                                                                        style: 'currency',
                                                                        currency: 'PHP',
                                                                        minimumFractionDigits: 0,
                                                                    })}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    {pf.encodedBy.name}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="p-4 text-center text-sm text-slate-500">
                                                    No processing fee history.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">Passbook Fee History</h3>
                                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                                            {viewMember.passbookFees && viewMember.passbookFees.length > 0 ? (
                                                <table className="w-full text-sm text-left text-slate-500">
                                                    <thead className="bg-slate-50 text-slate-700">
                                                        <tr>
                                                            <th className="px-3 py-2 font-medium">Date</th>
                                                            <th className="px-3 py-2 text-right font-medium">Amount</th>
                                                            <th className="px-3 py-2 font-medium">Encoded By</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200 bg-white">
                                                        {viewMember.passbookFees.map((pf) => (
                                                            <tr key={pf.id}>
                                                                <td className="px-3 py-2">
                                                                    {formatDateManila(pf.createdAt)}
                                                                </td>
                                                                <td className="px-3 py-2 text-right">
                                                                    {Number(pf.amount).toLocaleString('en-US', {
                                                                        style: 'currency',
                                                                        currency: 'PHP',
                                                                        minimumFractionDigits: 0,
                                                                    })}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    {pf.encodedBy.name}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="p-4 text-center text-sm text-slate-500">
                                                    No passbook fee history.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">Membership Fee History</h3>
                                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                                            {viewMember.membershipFees && viewMember.membershipFees.length > 0 ? (
                                                <table className="w-full text-sm text-left text-slate-500">
                                                    <thead className="bg-slate-50 text-slate-700">
                                                        <tr>
                                                            <th className="px-3 py-2 font-medium">Date</th>
                                                            <th className="px-3 py-2 text-right font-medium">Amount</th>
                                                            <th className="px-3 py-2 font-medium">Encoded By</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200 bg-white">
                                                        {viewMember.membershipFees.map((pf) => (
                                                            <tr key={pf.id}>
                                                                <td className="px-3 py-2">
                                                                    {formatDateManila(pf.createdAt)}
                                                                </td>
                                                                <td className="px-3 py-2 text-right">
                                                                    {Number(pf.amount).toLocaleString('en-US', {
                                                                        style: 'currency',
                                                                        currency: 'PHP',
                                                                        minimumFractionDigits: 0,
                                                                    })}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    {pf.encodedBy.name}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="p-4 text-center text-sm text-slate-500">
                                                    No membership fee history.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">Active Release History</h3>
                                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                                            {viewMember.activeReleases && viewMember.activeReleases.length > 0 ? (
                                                <table className="w-full text-sm text-left text-slate-500">
                                                    <thead className="bg-slate-50 text-slate-700">
                                                        <tr>
                                                            <th className="px-3 py-2">Release Date</th>
                                                            <th className="px-3 py-2 text-right">Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200">
                                                        {viewMember.activeReleases.map((r) => (
                                                            <tr key={r.id}>
                                                                <td className="px-3 py-2">
                                                                    {formatDateManila(r.releaseDate)}
                                                                </td>
                                                                <td className="px-3 py-2 text-right">
                                                                    {Number(r.amount).toLocaleString('en-US', {
                                                                        style: 'currency',
                                                                        currency: 'PHP',
                                                                        minimumFractionDigits: 0,
                                                                    })}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="p-4 text-center text-sm text-slate-500">
                                                    No active release history.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {(userRole === Role.SUPER_ADMIN || userRole === Role.ENCODER) && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <h3 className="mb-4 text-sm font-medium text-slate-500 uppercase tracking-wider">New Adjustment</h3>
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <select 
                                                    className="rounded bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                                    value={adjustmentForm.type || ""}
                                                    onChange={e => setAdjustmentForm({...adjustmentForm, type: e.target.value as any, action: null})}
                                                >
                                                    <option value="">Select Type</option>
                                                    <option value="balance">Balance</option>
                                                    <option value="savings">Savings</option>
                                                    {canManageActiveRelease ? <option value="activeRelease">Active Release</option> : null}
                                                </select>
                                                <select 
                                                    className="rounded bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                                    value={adjustmentForm.action || ""}
                                                    onChange={e => setAdjustmentForm({...adjustmentForm, action: e.target.value as any})}
                                                    disabled={!adjustmentForm.type || adjustmentForm.type === 'activeRelease'}
                                                >
                                                    <option value="">Select Action</option>
                                                    {adjustmentForm.type === 'balance' ? (
                                                        <>
                                                            <option value="DEDUCT">Deduct (Payment)</option>
                                                            <option value="INCREASE">Increase (Loan)</option>
                                                        </>
                                                    ) : adjustmentForm.type === 'savings' ? (
                                                        <>
                                                            <option value="INCREASE">Deposit</option>
                                                            <option value="WITHDRAW">Withdraw</option>
                                                        </>
                                                    ) : null}
                                                </select>
                                            </div>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="number" 
                                                    placeholder={adjustmentForm.type === 'activeRelease' ? "Active release amount" : "Amount"}
                                                    className="flex-1 rounded bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                                    value={adjustmentForm.type === 'activeRelease' ? activeReleaseAmount : adjustmentForm.amount}
                                                    onChange={e => {
                                                        if (adjustmentForm.type === 'activeRelease') {
                                                            setActiveReleaseAmount(e.target.value);
                                                        } else {
                                                            setAdjustmentForm({...adjustmentForm, amount: e.target.value});
                                                        }
                                                    }}
                                                />
                                                <button 
                                                    onClick={handleSaveAdjustment}
                                                    disabled={
                                                        adjustmentLoading ||
                                                        !adjustmentForm.type ||
                                                        (adjustmentForm.type === 'activeRelease'
                                                            ? !activeReleaseAmount
                                                            : !adjustmentForm.action || !adjustmentForm.amount)
                                                    }
                                                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    {adjustmentLoading ? "Saving..." : "Save"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* History Tables */}
                            <div className="grid gap-6 md:grid-cols-2">
                                <div>
                                    <h3 className="mb-3 text-sm font-medium text-slate-700">Balance History</h3>
                                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                                        <table className="w-full text-sm text-left text-slate-500">
                                            <thead className="bg-slate-50 text-slate-700">
                                                <tr>
                                                    <th className="px-3 py-2">Date</th>
                                                    <th className="px-3 py-2">Type</th>
                                                    <th className="px-3 py-2 text-right">Amount</th>
                                                    <th className="px-3 py-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {balanceLoading ? (
                                                    <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
                                                ) : balanceAdjustments.length === 0 ? (
                                                    <tr><td colSpan={4} className="p-4 text-center">No history</td></tr>
                                                ) : (
                                                    balanceAdjustments.map(adj => (
                                                        <tr key={adj.id}>
                                                            <td className="px-3 py-2">{formatDateManila(adj.createdAt)}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`text-xs px-2 py-0.5 rounded ${adj.type === 'DEDUCT' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {adj.type}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">{adj.amount.toLocaleString()}</td>
                                                            <td className="px-3 py-2 text-right">
                                                                {canDelete && (
                                                                    <button onClick={() => handleRevertBalanceAdjustment(adj.id)} className="text-xs font-medium text-slate-500 hover:text-red-600 hover:underline" title="Revert Transaction">
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
                                            className="p-2 bg-slate-50"
                                            pageSizeOptions={[5, 10, 20]}
                                            onPageSizeChange={(s) => {
                                                setBalanceLimit(s);
                                                fetchBalanceAdjustments(viewMember.id, 1, s);
                                            }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="mb-3 text-sm font-medium text-slate-500">Savings History</h3>
                                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                                        <table className="w-full text-sm text-left text-slate-500">
                                            <thead className="bg-slate-50 text-slate-700">
                                                <tr>
                                                    <th className="px-3 py-2">Date</th>
                                                    <th className="px-3 py-2">Type</th>
                                                    <th className="px-3 py-2 text-right">Amount</th>
                                                    <th className="px-3 py-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {savingsLoading ? (
                                                    <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
                                                ) : savingsAdjustments.length === 0 ? (
                                                    <tr><td colSpan={4} className="p-4 text-center">No history</td></tr>
                                                ) : (
                                                    savingsAdjustments.map(adj => (
                                                        <tr key={adj.id}>
                                                            <td className="px-3 py-2">{formatDateManila(adj.createdAt)}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`text-xs px-2 py-0.5 rounded ${adj.type === 'INCREASE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {adj.type}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">{adj.amount.toLocaleString()}</td>
                                                            <td className="px-3 py-2 text-right">
                                                                {canDelete && (
                                                                    <button onClick={() => handleRevertSavingsAdjustment(adj.id)} className="text-xs font-medium text-slate-500 hover:text-red-600 hover:underline" title="Revert Transaction">
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
                                            className="p-2 bg-white"
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-900">
                            {editingMember ? "Edit Member" : "Add New Member"}
                        </h2>
                        <button
                            onClick={handleCloseModal}
                            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        >
                            <IconX className="h-5 w-5" />
                        </button>
                    </div>

                    {modalError && (
                        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                            {modalError}
                        </div>
                    )}

                    <form onSubmit={handleFormSubmit} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Last Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value.toUpperCase() })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    First Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value.toUpperCase() })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Group <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={formData.groupId}
                                    onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
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
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Age (optional)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.age}
                                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Phone Number (optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.phoneNumber}
                                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Address (optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Balance <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={formData.balance}
                                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                                    disabled={!!editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0)}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                {editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0) && (
                                    <p className="mt-1 text-xs text-amber-600">Cannot be edited due to member already has balance and savings adjustment records</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Savings
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.savings}
                                    onChange={(e) => setFormData({ ...formData, savings: e.target.value })}
                                    disabled={!!editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0)}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                {editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0) && (
                                    <p className="mt-1 text-xs text-amber-600">Cannot be edited due to member already has balance and savings adjustment records</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Active Release (optional)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.activeReleaseAmount}
                                    onChange={(e) => setFormData({ ...formData, activeReleaseAmount: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Status <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                >
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Days in System
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.daysCount}
                                    onChange={(e) => setFormData({ ...formData, daysCount: e.target.value })}
                                    disabled={!!editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0)}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                {editingMember?._count && (editingMember._count.balanceAdjustments > 0 || editingMember._count.savingsAdjustments > 0) && (
                                    <p className="mt-1 text-xs text-amber-600">Cannot be edited due to member already has balance and savings adjustment records</p>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-slate-200 pt-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-medium text-slate-900">Cycle Information</h3>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const maxCycle = formData.cycles.length > 0 
                                            ? Math.max(...formData.cycles.map(c => parseInt(c.cycleNumber || "0"))) 
                                            : (editingMember ? parseInt(editingMember.latestCycle?.cycleNumber?.toString() || "0") : 0);
                                        
                                        setFormData({
                                            ...formData,
                                            cycles: [
                                                ...formData.cycles, 
                                                { 
                                                    cycleNumber: (maxCycle + 1).toString(), 
                                                    startDate: new Date().toISOString().split('T')[0],
                                                    endDate: ""
                                                }
                                            ]
                                        });
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                    <IconPlus className="h-3 w-3" /> Add Cycle
                                </button>
                            </div>
                            <div className="space-y-4">
                                {formData.cycles.map((cycle, index) => (
                                    <div key={index} className="grid gap-4 md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_minmax(0,1fr)] relative group items-start">
                                        <div className="max-w-[120px]">
                                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                                Cycle Number
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={cycle.cycleNumber}
                                                onChange={(e) => {
                                                    const newCycles = [...formData.cycles];
                                                    newCycles[index].cycleNumber = e.target.value;
                                                    setFormData({ ...formData, cycles: newCycles });
                                                }}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                            />
                                        </div>
                                        <div className="min-w-[140px]">
                                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                                Start Date
                                            </label>
                                            <input
                                                type="date"
                                                value={cycle.startDate}
                                                onChange={(e) => {
                                                    const newCycles = [...formData.cycles];
                                                    newCycles[index].startDate = e.target.value;
                                                    setFormData({ ...formData, cycles: newCycles });
                                                }}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                            />
                                        </div>
                                        <div className="relative min-w-[140px] pr-6">
                                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                                End Date
                                            </label>
                                            <input
                                                type="date"
                                                value={cycle.endDate}
                                                onChange={(e) => {
                                                    const newCycles = [...formData.cycles];
                                                    newCycles[index].endDate = e.target.value;
                                                    setFormData({ ...formData, cycles: newCycles });
                                                }}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                                            />
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    const newCycles = formData.cycles.filter((_, i) => i !== index);
                                                    setFormData({ ...formData, cycles: newCycles });
                                                }} 
                                                className="absolute right-0 top-8 text-slate-500 hover:text-red-600"
                                                title="Remove cycle"
                                            >
                                                <IconTrash className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>


                        <div className="mt-6 flex justify-end gap-3 pt-2 border-t border-slate-200">
                            <button
                                type="button"
                                onClick={handleCloseModal}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                disabled={modalLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={modalLoading}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-900">{confirmation.title}</h2>
                        <button
                            onClick={() => setConfirmation({ ...confirmation, isOpen: false })}
                            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        >
                            <IconX className="h-5 w-5" />
                        </button>
                    </div>

                    <p className="text-sm text-slate-600">
                        {confirmation.message}
                    </p>

                    <div className="mt-6 flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setConfirmation({ ...confirmation, isOpen: false })}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
