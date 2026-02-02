import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/app");

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100">
      {/* background gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "linear-gradient(to bottom right, rgba(15,23,42,0.85), rgba(2,6,23,0.92)), radial-gradient(1000px circle at 40% 55%, rgba(37,99,235,0.20), transparent 55%)",
        }}
      />

      {/* grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          backgroundPosition: "center",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Logo" className="h-14 w-14 rounded-xl object-contain shadow-sm bg-white p-1" />
          <div className="text-left">
            <div className="text-lg font-semibold text-slate-100">{process.env.NEXT_PUBLIC_APP_NAME || "TRIPLE E microfinance inc."}</div>
            <div className="text-sm text-slate-400">Admin dashboard</div>
          </div>
        </div>

        <p className="mt-5 max-w-xl text-sm text-slate-400">
          Secure access for managing groups, members, and collections.
        </p>

        {/* Sign in button centered in the middle */}
        <div className="mt-10">
          <Link
            href="/login"
            className="inline-flex min-w-48 items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}

