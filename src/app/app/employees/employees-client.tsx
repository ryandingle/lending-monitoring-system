"use client";

import { useState, useEffect } from "react";
import { EmployeePosition, Role } from "@prisma/client";
import { IconSearch, IconPlus, IconX, IconPencil, IconTrash } from "../_components/icons";

const POSITION_LABELS: Record<EmployeePosition, string> = {
  COLLECTION_OFFICER: "Collection officer",
  OFFICE_CLERK: "Office clerk",
  UNIT_MANAGER: "Unit manager",
  OPERATIONS_MANAGER: "Operations manager",
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  position: EmployeePosition;
  createdAt: string;
  groupsAsCollectionOfficer: { id: string; name: string }[];
};

type Group = {
  id: string;
  name: string;
  collectionOfficerId: string | null;
};

export function EmployeesClient({
  initialEmployees,
  initialGroups,
  userRole,
}: {
  initialEmployees: Employee[];
  initialGroups: Group[];
  userRole: Role;
}) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    position: "" as EmployeePosition | "",
    assignedGroupIds: [] as string[],
  });

  const canManage = userRole === Role.SUPER_ADMIN;

  const fetchEmployees = async (query: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/employees?q=${query}`);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (error) {
      console.error("Failed to fetch employees", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setFormData({
      firstName: "",
      lastName: "",
      position: "",
      assignedGroupIds: [],
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position,
      assignedGroupIds: employee.groupsAsCollectionOfficer.map((g) => g.id),
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);

    try {
      const url = editingEmployee
        ? `/api/employees/${editingEmployee.id}`
        : "/api/employees";
      const method = editingEmployee ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save employee");
      }

      const savedEmployee = await res.json();
      
      if (editingEmployee) {
        setEmployees(employees.map(e => e.id === savedEmployee.id ? savedEmployee : e));
      } else {
        setEmployees([savedEmployee, ...employees]);
      }
      
      setIsModalOpen(false);
    } catch (error: any) {
      setModalError(error.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (employee: Employee) => {
    if (!confirm(`Are you sure you want to DELETE employee "${employee.firstName} ${employee.lastName}"?`)) return;

    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete employee");
      }

      setEmployees(employees.filter(e => e.id !== employee.id));
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleGroupToggle = (groupId: string) => {
    setFormData((prev) => {
      const current = prev.assignedGroupIds;
      if (current.includes(groupId)) {
        return { ...prev, assignedGroupIds: current.filter((id) => id !== groupId) };
      } else {
        return { ...prev, assignedGroupIds: [...current, groupId] };
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Employees</h1>
            <p className="mt-1 text-sm text-slate-400">
              List and manage employees (name and position).
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-64 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            {canManage && (
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <IconPlus className="h-5 w-5" />
                Add Employee
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Position</th>
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4">Created</th>
                {canManage && <th className="py-2 pr-0 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium text-slate-100">
                    {e.firstName} {e.lastName}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">
                    {POSITION_LABELS[e.position]}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {e.groupsAsCollectionOfficer.length > 0 ? (
                        e.groupsAsCollectionOfficer.map((g) => (
                          <span
                            key={g.id}
                            className="inline-flex items-center rounded-md bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-300 ring-1 ring-inset ring-blue-700/50"
                          >
                            {g.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="py-2 pr-0">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(e)}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                        >
                          <IconPencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(e)}
                          className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-950/50"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td className="py-4 text-center text-slate-400" colSpan={canManage ? 5 : 4}>
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">
                {editingEmployee ? "Edit Employee" : "Add Employee"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <IconX className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="mt-4 rounded-lg bg-red-950/50 p-3 text-sm text-red-200 border border-red-900/50">
                {modalError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-200">First Name</label>
                <input
                  required
                  value={formData.firstName}
                  onChange={e => setFormData({...formData, firstName: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Last Name</label>
                <input
                  required
                  value={formData.lastName}
                  onChange={e => setFormData({...formData, lastName: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-200">Position</label>
                <select
                  required
                  value={formData.position}
                  onChange={e => setFormData({...formData, position: e.target.value as EmployeePosition})}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                >
                  <option value="" disabled>Select position...</option>
                  {Object.entries(POSITION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-200">Assign Groups</label>
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
                  <div className="space-y-2">
                    {initialGroups.map((group) => (
                      <label key={group.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.assignedGroupIds.includes(group.id)}
                          onChange={() => handleGroupToggle(group.id)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-600/20"
                        />
                        <span className="text-sm text-slate-300">{group.name}</span>
                        {group.collectionOfficerId && 
                         (!editingEmployee || !editingEmployee.groupsAsCollectionOfficer.some(g => g.id === group.id)) ? (
                          <span className="text-xs text-slate-500">(Has officer)</span>
                        ) : null}
                      </label>
                    ))}
                    {initialGroups.length === 0 && (
                      <div className="text-xs text-slate-500">No groups available.</div>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Select groups this employee will manage.
                </p>
              </div>

              <div className="md:col-span-2 flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {modalLoading ? "Saving..." : (editingEmployee ? "Update Employee" : "Add Employee")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
