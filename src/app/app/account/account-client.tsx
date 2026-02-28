"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  username: string;
  name: string;
  email: string | null;
}

interface AccountClientProps {
  user: User;
}

export default function AccountClient({ user }: AccountClientProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: user.name,
    currentPassword: "",
    newPassword: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update account");
      }

      setStatus("success");
      setFormData((prev) => ({ ...prev, currentPassword: "", newPassword: "" }));
      router.refresh();
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setStatus("idle");
      }, 3000);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Update your profile and password.
        </p>

        {status === "success" && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Account updated successfully.
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage || "Could not update account (check inputs/password)."}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-500 font-bold uppercase tracking-wider">Username</label>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {user.username}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-500 font-bold uppercase tracking-wider">Email</label>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {user.email ?? "-"}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Name</label>
            <input
              name="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Current password</label>
              <input
                name="currentPassword"
                type="password"
                value={formData.currentPassword}
                onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Required to change password"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">New password</label>
              <input
                name="newPassword"
                type="password"
                value={formData.newPassword}
                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Leave blank to keep current"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
