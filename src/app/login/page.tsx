import { prisma } from "@/lib/db";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { Role } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { LoginButton } from "./login-button";
import { LoginToast } from "./login-toast";

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

async function loginAction(formData: FormData) {
  "use server";

  const parsed = LoginSchema.safeParse({
    username: String(formData.get("username") || "").trim(),
    password: String(formData.get("password") || ""),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username.toLowerCase() },
  });

  if (!user) redirect("/login?error=invalid");
  if (!user.isActive) redirect("/login?error=invalid");

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) redirect("/login?error=invalid");

  await createSession(user.id);
  redirect(
    user.role === Role.ENCODER || user.role === Role.VIEWER ? "/app/groups" : "/app",
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const alreadyAuthed = await getCurrentUser();
  if (alreadyAuthed) redirect("/app");

  const sp = await searchParams;
  const showError = sp.error === "invalid";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <LoginToast />
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left: Sign-in form */}
        <div className="relative flex items-center justify-center px-6 py-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(900px circle at 20% 20%, rgba(37,99,235,0.05), transparent 60%), radial-gradient(800px circle at 80% 60%, rgba(59,130,246,0.05), transparent 55%)",
            }}
          />

          <div className="relative w-full max-w-md">
            <a
              href="/"
              className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900"
            >
              <span className="mr-2">←</span> Back to dashboard
            </a>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Sign In
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Enter your username and password to sign in.
              </p>


              <form action={loginAction} className="mt-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Username
                  </label>
                  <input
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter username"
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <LoginButton />
              </form>
            </div>
          </div>
        </div>

        {/* Right: Brand panel */}
        <div className="relative hidden overflow-hidden border-l border-slate-200 bg-slate-50 lg:block">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-70"
            style={{
              background:
                "linear-gradient(to bottom right, rgba(255,255,255,0.85), rgba(241,245,249,0.92)), radial-gradient(1000px circle at 40% 55%, rgba(37,99,235,0.10), transparent 55%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.2) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              backgroundPosition: "center",
            }}
          />

          <div className="relative flex h-full items-center justify-center p-10">
            <div className="max-w-md text-center">
              <div className="mx-auto flex w-fit items-center gap-3">
                <img src="/logo.jpg" alt="Logo" className="h-14 w-14 rounded-xl object-contain shadow-sm bg-white p-1" />
                <div className="text-left">
                  <div className="text-lg font-semibold text-slate-900">
                    {process.env.NEXT_PUBLIC_APP_NAME || "TRIPLE E microfinance inc."}
                  </div>
                  <div className="text-sm text-slate-500">Admin dashboard</div>
                </div>
              </div>

              <div className="mt-6 text-sm text-slate-500">
                Secure access for managing groups, members, and collections.
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
