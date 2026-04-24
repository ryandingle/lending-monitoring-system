"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconPlus, IconX, IconPencil, IconTrash } from "../_components/icons";
import { Role } from "@prisma/client";
import { showAppToast } from "../_components/app-toast";

type AppRole = Role | "COLLECTOR";

type User = {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: AppRole;
  employeeId?: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  isActive: boolean;
  createdAt: string;
};

type CollectionOfficerOption = {
  id: string;
  firstName: string;
  lastName: string;
};

export function UsersClient({
  initialUsers,
  currentUserId,
  collectionOfficerOptions,
}: {
  initialUsers: User[];
  currentUserId: string;
  collectionOfficerOptions: CollectionOfficerOption[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingPasswordUser, setResettingPasswordUser] = useState<User | null>(null);
  const [statusChangeUser, setStatusChangeUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    name: "",
    role: "ENCODER" as AppRole,
    employeeId: "",
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
      employeeId: "",
      password: "",
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);

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
        employeeId: "",
        password: "",
      });
      showAppToast("success", "User created successfully.");
    } catch (error: any) {
      showAppToast("error", error.message || "Failed to create user");
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
      employeeId: user.employeeId || "",
      password: "",
    });
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setModalLoading(true);

    try {
      const payload: any = {
        username: formData.username,
        email: formData.email,
        name: formData.name,
        role: formData.role,
        employeeId: formData.role === "COLLECTOR" ? formData.employeeId || null : null,
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
      showAppToast("success", "User updated successfully.");
    } catch (error: any) {
      showAppToast("error", error.message || "Failed to update user");
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    setStatusChangeUser(user);
  };

  const handleConfirmToggleActive = async () => {
    if (!statusChangeUser) return;
    setModalLoading(true);
    try {
      const res = await fetch(`/api/users/${statusChangeUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !statusChangeUser.isActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      const updatedUser = await res.json();
      setUsers(users.map(u => u.id === statusChangeUser.id ? updatedUser : u));
      showAppToast("success", `User ${statusChangeUser.isActive ? "deactivated" : "activated"} successfully.`);
      setStatusChangeUser(null);
    } catch (error: any) {
      showAppToast("error", error.message || "Failed to update status");
    } finally {
      setModalLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordUser) return;
    
    setModalLoading(true);

    try {
      const res = await fetch(`/api/users/${resettingPasswordUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordResetValue }),
      });

      if (!res.ok) throw new Error("Failed to reset password");

      showAppToast("success", "Password reset successfully.");
      setResettingPasswordUser(null);
      setPasswordResetValue("");
    } catch (error: any) {
      showAppToast("error", error.message || "Failed to reset password");
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteUser = (user: User) => {
    setDeletingUser(user);
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setModalLoading(true);

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
      showAppToast("success", "User deleted successfully.");
    } catch (error: any) {
      showAppToast("error", error.message || "Failed to delete user");
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Users</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage system users, roles, and access.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name/user…"
                className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Linked Officer</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-900">{u.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{u.username}</td>
                  <td className="py-2 pr-4 text-slate-600">{u.email ?? "-"}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    <span className="text-xs font-medium text-slate-600">{u.role}</span>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {u.employee
                      ? `${u.employee.lastName}, ${u.employee.firstName}`
                      : "-"}
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={u.id === currentUserId}
                      className={`rounded-full border px-2 py-1 text-xs font-medium ${
                        u.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      } ${u.id === currentUserId ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {u.isActive ? "ACTIVE" : "INACTIVE"}
                    </button>
                  </td>
                  <td className="py-2 pr-4 text-slate-500">
                    {new Date(u.createdAt).toISOString().split('T')[0]}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditModal(u)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                        title="Edit User"
                      >
                        <IconPencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setResettingPasswordUser(u)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Reset Password"
                      >
                        <span className="text-xs font-bold">PW</span>
                      </button>
                       <button
                        onClick={() => handleDeleteUser(u)}
                        disabled={u.id === currentUserId}
                        className={`rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 ${u.id === currentUserId ? "opacity-50 cursor-not-allowed" : ""}`}
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
                  <td className="py-4 text-center text-slate-500" colSpan={8}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Add New User</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Username</label>
                <input
                  required
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Email (Optional)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as AppRole, employeeId: e.target.value === "COLLECTOR" ? formData.employeeId : ""})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ENCODER">ENCODER</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="VIEWER">VIEWER</option>
                  <option value="COLLECTOR">COLLECTOR</option>
                </select>
              </div>
              {formData.role === "COLLECTOR" && (
                <div>
                  <label className="text-sm font-medium text-slate-700">Collection Officer</label>
                  <select
                    required
                    value={formData.employeeId}
                    onChange={e => setFormData({...formData, employeeId: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Select officer</option>
                    {collectionOfficerOptions.map((officer) => (
                      <option key={officer.id} value={officer.id}>
                        {officer.lastName}, {officer.firstName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Username</label>
                <input
                  required
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Email (Optional)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as AppRole, employeeId: e.target.value === "COLLECTOR" ? formData.employeeId : ""})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ENCODER">ENCODER</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="VIEWER">VIEWER</option>
                  <option value="COLLECTOR">COLLECTOR</option>
                </select>
              </div>
              {formData.role === "COLLECTOR" && (
                <div>
                  <label className="text-sm font-medium text-slate-700">Collection Officer</label>
                  <select
                    required
                    value={formData.employeeId}
                    onChange={e => setFormData({...formData, employeeId: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Select officer</option>
                    {collectionOfficerOptions.map((officer) => (
                      <option key={officer.id} value={officer.id}>
                        {officer.lastName}, {officer.firstName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Reset Password</h2>
              <button onClick={() => setResettingPasswordUser(null)} className="text-slate-400 hover:text-slate-600">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mt-2 mb-4 text-sm text-slate-600">
              Reset password for <strong>{resettingPasswordUser.name}</strong> ({resettingPasswordUser.username}).
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">New Password</label>
                <input
                  type="password"
                  required
                  value={passwordResetValue}
                  onChange={e => setPasswordResetValue(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Enter new password"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setResettingPasswordUser(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {modalLoading ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Change Confirmation Modal */}
      {statusChangeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {statusChangeUser.isActive ? "Deactivate User" : "Activate User"}
              </h2>
              <button onClick={() => setStatusChangeUser(null)} className="text-slate-400 hover:text-slate-600">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Are you sure you want to {statusChangeUser.isActive ? "deactivate" : "activate"} user{" "}
              <strong>{statusChangeUser.name}</strong>?
            </p>

            <div className="flex justify-end gap-3 pt-6">
              <button
                type="button"
                onClick={() => setStatusChangeUser(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                disabled={modalLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleActive}
                disabled={modalLoading}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {modalLoading
                  ? "Saving..."
                  : statusChangeUser.isActive
                  ? "Deactivate User"
                  : "Activate User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Delete User</h2>
              <button onClick={() => setDeletingUser(null)} className="text-slate-400 hover:text-slate-600">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Are you sure you want to delete user <strong>{deletingUser.name}</strong>? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-3 pt-6">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
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
