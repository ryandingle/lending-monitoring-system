"use client";

export function LogoutButton() {
  return (
    <form action="/app/logout" method="post">
      <button className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/60">
        Logout
      </button>
    </form>
  );
}

