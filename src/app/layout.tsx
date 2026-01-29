import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lending Monitoring System",
  description: "Groups, members, and daily savings accrual",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}

