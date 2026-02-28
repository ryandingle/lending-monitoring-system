"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconSearch, IconPencil, IconTrash, IconChevronUp, IconChevronDown, IconPlus, IconX, IconEye } from "../_components/icons";

type Group = {
  id: string;
  name: string;
  description: string | null;
  collectionOfficerId: string | null;
  collectionOfficer: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  _count: {
    members: number;
  };
};

type CollectionOfficer = {
  id: string;
  firstName: string;
  lastName: string;
};

interface GroupsClientProps {
  initialGroups: Group[];
  initialTotal: number;
  initialCollectionOfficers: CollectionOfficer[];
  canCreate: boolean;
  canDelete: boolean;
}

function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
  className = "",
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="text-xs text-slate-500">
        Page {currentPage} of {totalPages}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1 || isLoading}
          className={`rounded px-2 py-1 text-xs font-medium ${
            currentPage > 1 && !isLoading
              ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              : "pointer-events-none bg-slate-50 text-slate-400"
          }`}
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages || isLoading}
          className={`rounded px-2 py-1 text-xs font-medium ${
            currentPage < totalPages && !isLoading
              ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              : "pointer-events-none bg-slate-50 text-slate-400"
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function GroupsClient({
  initialGroups,
  initialTotal,
  initialCollectionOfficers,
  canCreate,
  canDelete,
}: GroupsClientProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  
  // Confirmation Modal State
  const [confirmation, setConfirmation] = useState<{
      isOpen: boolean;
      id: string | null;
      title: string;
      message: string;
  }>({ isOpen: false, id: null, title: "", message: "" });
  const [isConfirming, setIsConfirming] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    collectionOfficerId: "",
  });

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  // Fetch Groups
  useEffect(() => {
    // Skip initial fetch if data matches initial props
    if (page === 1 && search === "" && groups === initialGroups) return;

    const fetchGroups = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/groups?page=${page}&limit=${limit}&q=${encodeURIComponent(search)}`
        );
        if (!res.ok) throw new Error("Failed to fetch groups");
        const data = await res.json();
        setGroups(data.items);
        setTotal(data.total);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchGroups();
    }, 300);

    return () => clearTimeout(timer);
  }, [page, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset page on search
  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleOpenModal = (group?: Group) => {
    if (group) {
      setEditingGroup(group);
      setFormData({
        name: group.name,
        description: group.description || "",
        collectionOfficerId: group.collectionOfficerId || "",
      });
    } else {
      setEditingGroup(null);
      setFormData({
        name: "",
        description: "",
        collectionOfficerId: "",
      });
    }
    setModalError("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError("");

    try {
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : "/api/groups";
      const method = editingGroup ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save group");
      }

      // Refresh list
      const refreshRes = await fetch(
        `/api/groups?page=${page}&limit=${limit}&q=${encodeURIComponent(search)}`
      );
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setGroups(data.items);
        setTotal(data.total);
      }
      
      handleCloseModal();
      router.refresh(); // Refresh server components if any depend on this data
    } catch (error: any) {
      setModalError(error.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmation({
        isOpen: true,
        id,
        title: "Delete Group",
        message: "Are you sure you want to delete this group? This action cannot be undone."
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmation.id) return;
    setIsConfirming(true);

    try {
      const res = await fetch(`/api/groups/${confirmation.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete group");

      // Refresh list
      const refreshRes = await fetch(
        `/api/groups?page=${page}&limit=${limit}&q=${encodeURIComponent(search)}`
      );
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setGroups(data.items);
        setTotal(data.total);
      }
      router.refresh();
      setConfirmation({ ...confirmation, isOpen: false });
    } catch (error) {
      console.error(error);
      alert("Failed to delete group");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Groups</h1>
            <p className="mt-1 text-sm text-slate-500">
              Create and manage lending groups.
            </p>
          </div>
          <div className="flex gap-3">
             <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <IconSearch className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="Search groups..."
                  className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            {canCreate && (
              <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <IconPlus className="h-4 w-4" />
                Create Group
              </button>
            )}
          </div>
        </div>

        <PaginationControls
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          isLoading={isLoading}
          className="mb-4"
        />

        <div className="overflow-x-auto relative min-h-[200px]">
          {isLoading && (
            <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center text-slate-500 text-sm">
              Loading...
            </div>
          )}
          
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 pr-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Description</th>
                <th className="py-3 px-4 font-medium">Officer</th>
                <th className="py-3 px-4 font-medium text-right">Members</th>
                <th className="py-3 pl-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {groups.map((group) => (
                <tr key={group.id} className="group hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium text-slate-900">
                    <Link href={`/app/groups/${group.id}`} className="hover:text-indigo-600 hover:underline">
                      {group.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate">
                    {group.description || "-"}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {group.collectionOfficer
                      ? `${group.collectionOfficer.lastName}, ${group.collectionOfficer.firstName}`
                      : <span className="text-slate-400 italic">Unassigned</span>}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600">
                    {group._count.members}
                  </td>
                  <td className="py-3 pl-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/app/groups/${group.id}`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                        title="View Details"
                      >
                        <IconEye className="h-4 w-4" />
                      </Link>
                      {canCreate && (
                        <button
                          onClick={() => handleOpenModal(group)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                          title="Edit"
                        >
                          <IconPencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(group.id)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                          title="Delete"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No groups found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          isLoading={isLoading}
          className="mt-4 border-t border-slate-200 pt-4"
        />
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingGroup ? "Edit Group" : "Create New Group"}
              </h2>
              <button
                onClick={handleCloseModal}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Group Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                  placeholder="e.g. North District A"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Assigned Officer
                </label>
                <select
                  value={formData.collectionOfficerId}
                  onChange={(e) => setFormData({ ...formData, collectionOfficerId: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                >
                  <option value="">Select an officer...</option>
                  {initialCollectionOfficers.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.lastName}, {officer.firstName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
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
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                >
                  {modalLoading ? "Saving..." : (editingGroup ? "Save Changes" : "Create Group")}
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
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
                onClick={handleConfirmDelete}
                disabled={isConfirming}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
              >
                {isConfirming ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
