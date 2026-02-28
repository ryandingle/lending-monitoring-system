"use client";

export function LogoutButton() {
  return (
    <form action="/app/logout" method="post">
      <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
        Logout
      </button>
    </form>
  );
}

