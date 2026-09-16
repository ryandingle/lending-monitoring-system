import Link from "next/link";
import { Suspense } from "react";
import ClientRedirect from "./_client-redirect";

export default function NotFound() {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
          <Suspense fallback={null}>
            <ClientRedirect />
          </Suspense>
          <h1 className="text-2xl font-semibold tracking-tight">
            Loading page&hellip;
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            If you are not redirected within a few seconds,{" "}
            <Link
              href="/"
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              go to the home page
            </Link>
            .
          </p>
        </main>
      </body>
    </html>
  );
}
