import React from "react";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { Role } from "@prisma/client";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";
import { getAccountingReportData } from "@/lib/accounting";
import { requireRole, requireUser } from "@/lib/auth/session";
import { AccountingReportPdf } from "@/lib/pdf/AccountingReportPdf";
import { formatDateYMD, getManilaToday } from "@/lib/date";

export const runtime = "nodejs";

function safeFilePart(s: string) {
  return s
    .replaceAll(/[^a-zA-Z0-9-_]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
}

export async function GET(req: Request) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const url = new URL(req.url);
  const rawDate = url.searchParams.get("date")?.trim() ?? "";
  const isPreview = url.searchParams.get("preview") === "true";
  const today = formatDateYMD(getManilaToday());
  const accountingDate =
    /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate > today
        ? today
        : rawDate
      : today;

  try {
    const reportData = await getAccountingReportData(accountingDate);

    let logoBinary: Buffer | null = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "logo.jpg");
      logoBinary = await fs.promises.readFile(logoPath);
    } catch {
      logoBinary = null;
    }

    const stream = await renderToStream(
      React.createElement(AccountingReportPdf, {
        data: {
          ...reportData,
          companyName: "Triple E Microfinance",
          logoUrl: logoBinary ?? undefined,
        },
      }) as any,
    );

    const chunks: Buffer[] = [];
    // @ts-ignore
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    try {
      const request = await tryGetAuditRequestContext();
      await createAuditLogStandalone({
        actorUserId: actor.id,
        action: "ACCOUNTING_EXPORT",
        entityType: "AccountingDay",
        entityId: accountingDate,
        metadata: { accountingDate, format: "pdf" },
        request,
      });
    } catch {
      // ignore audit failures for export
    }

    const filename = `accounting-${safeFilePart(accountingDate)}.pdf`;
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating accounting export:", error);
    return NextResponse.json(
      { error: "Failed to generate accounting export" },
      { status: 500 },
    );
  }
}
