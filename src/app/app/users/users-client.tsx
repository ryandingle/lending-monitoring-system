"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconPlus, IconX, IconPencil, IconTrash } from "../_components/icons";
import { Role } from "@prisma/client";

type User = {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

export function UsersClient({ initialUsers, currentUserId }: { initialUsers: User[], currentUserId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingPasswordUser, setResettingPasswordUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    name: "",
    role: "ENCODER" as Role,
    password: "",
  });

  const [passwordResetValue, setPasswordResetValue] = useState("");

  const fetchUsers = async (query: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/users?q=${query}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Failed to fetch users", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const openCreateModal = () => {
    setFormData({
      username: "",
      email: "",
      name: "",
      role: "ENCODER",
      password: "",
    });
    setModalError(null);
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create user");
      }

      const newUser = await res.json();
      setUsers([newUser, ...users]);
      setIsCreateModalOpen(false);
      setFormData({
        username: "",
        email: "",
        name: "",
        role: "ENCODER",
        password: "",
      });
    } catch (error: any) {
      setModalError(error.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email || "",
      name: user.name,
      role: user.role,
      password: "",
    });
    setModalError(null);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setModalLoading(true);
    setModalError(null);

    try {
      const payload: any = {
        username: formData.username,
        email: formData.email,
        name: formData.name,
        role: formData.role,
      };

      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update user");
      }

      const updatedUser = await res.json();
      setUsers(users.map(u => u.id === editingUser.id ? updatedUser : u));
      setEditingUser(null);
    } catch (error: any) {
      setModalError(error.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    const action = user.isActive ? "deactivate" : "activate";
    if (!confirm(`Are you sure you want to ${action} user "${user.name}"?`)) return;

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      const updatedUser = await res.json();
      setUsers(users.map(u => u.id === user.id ? updatedUser : u));
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordUser) return;
    
    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/users/${resettingPasswordUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordResetValue }),
      });

      if (!res.ok) throw new Error("Failed to reset password");

      alert("Password reset successfully");
      setResettingPasswordUser(null);
      setPasswordResetValue("");
    } catch (error: any) {
      setModalError(error.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteUser = (user: User) => {
    setDeletingUser(user);
    setModalError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/users/${deletingUser.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete user");
      }

      setUsers(users.filter(u => u.id !== deletingUser.id));
      setDeletingUser(null);
    } catch (error: any) {
      setModalError(error.message);
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Users</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage system users, roles, and access.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name/user…"
                className="w-64 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <IconPlus className="h-5 w-5" />
              Add User
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium text-slate-100">{u.name}</td>
                  <td className="py-2 pr-4 text-slate-300">{u.username}</td>
                  <td className="py-2 pr-4 text-slate-300">{u.email ?? "-"}</td>
                  <td className="py-2 pr-4 text-slate-300">
                    <span className="text-xs font-medium text-slate-300">{u.role}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={u.id === currentUserId}
                      className={`rounded-full border px-2 py-1 text-xs font-medium ${
                        u.isActive
                          ? "border-emerald-900/40 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/60"
                          : "border-red-900/40 bg-red-950/40 text-red-200 hover:bg-red-900/60"
                      } ${u.id === currentUserId ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {u.isActive ? "ACTIVE" : "INACTIVE"}
                    </button>
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {new Date(u.createdAt).toISOString().split('T')[0]}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditModal(u)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-blue-400"
                        title="Edit User"
                      >
                        <IconPencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setResettingPasswordUser(u)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        title="Reset Password"
                      >
                        <span className="text-xs font-bold">PW</span>
                      </button>
                       <button
                        onClick={() => handleDeleteUser(u)}
                        disabled={u.id === currentUserId}
                        className={`rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400 ${u.id === currentUserId ? "opacity-50 cursor-not-allowed" : ""}`}
                        title="Delete User"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td className="py-4 text-center text-slate-400" colSpan={7}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Add New User</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            
            {modalError && (
              <div className="mt-4 rounded-lg bg-red-950/50 p-3 text-sm text-red-200 border border-red-900/50">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-200">Username</label>
                <input
                  required
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Email (Optional)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as Role})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                >
                  <option value="ENCODER">ENCODER</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {modalLoading ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-200">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            
            {modalError && (
              <div className="mt-4 rounded-lg bg-red-950/50 p-3 text-sm text-red-200 border border-red-900/50">
                {modalError}
              </div>
            )}

            <form onSubmit={handleUpdateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-200">Username</label>
                <input
                  required
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Email (Optional)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as Role})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                >
                  <option value="ENCODER">ENCODER</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {modalLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resettingPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Reset Password</h2>
              <button onClick={() => setResettingPasswordUser(null)} className="text-slate-400 hover:text-slate-200">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            
            <p className="mt-2 text-sm text-slate-400">
              Resetting password for <strong>{resettingPasswordUser.name}</strong>.
            </p>

            {modalError && (
              <div className="mt-4 rounded-lg bg-red-950/50 p-3 text-sm text-red-200 border border-red-900/50">
                {modalError}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-200">New Password</label>
                <input
                  type="password"
                  required
                  value={passwordResetValue}
                  onChange={e => setPasswordResetValue(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                  placeholder="Enter new password"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setResettingPasswordUser(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {modalLoading ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Delete User</h2>
              <button onClick={() => setDeletingUser(null)} className="text-slate-400 hover:text-slate-200">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mt-4">
              <div className="mb-4 flex justify-center">
                 <div className="rounded-full bg-red-900/20 p-3">
                    <IconTrash className="h-8 w-8 text-red-500" />
                 </div>
              </div>
              <p className="text-center text-slate-300">
                Are you sure you want to delete user <strong>{deletingUser.name}</strong>?
              </p>
              <p className="mt-2 text-center text-sm text-slate-400">
                This action cannot be undone.
              </p>
            </div>

            {modalError && (
              <div className="mt-4 rounded-lg bg-red-950/50 p-3 text-sm text-red-200 border border-red-900/50">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-6">
              <button
                onClick={() => setDeletingUser(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={modalLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {modalLoading ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
