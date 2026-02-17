import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role, BalanceUpdateType, SavingsUpdateType } from "@prisma/client";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";
import { getManilaDateRange, getMonday, formatDateYMD, getWeekdaysInRange } from "@/lib/date";
import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import { MemberReportPdf } from "@/lib/pdf/MemberReportPdf";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function safeFilePart(s: string) {
  return s.replaceAll(/[^a-zA-Z0-9-_]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/(^-|-$)/g, "");
}

function parseDateRange(req: Request): { from: string | null; to: string | null } {
  try {
    const url = new URL(req.url, "http://localhost"); // Provide base in case req.url is relative
    const from = url.searchParams.get("from")?.trim();
    const to = url.searchParams.get("to")?.trim();
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { from: null, to: null };
    }
    return { from, to };
  } catch {
    return { from: null, to: null };
  }
}

// Reimplementation of GET to match Group Export Design
export async function GET(
  req: Request,
  ctx: { params: Promise<{ memberId: string }> },
) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const { memberId } = await ctx.params;
  const { from: dateFromStr, to: dateToStr } = parseDateRange(req);

  if (!dateFromStr || !dateToStr) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  // Snap start date to Monday (like Group Export)
  // Logic: new Date("YYYY-MM-DD") in Node is UTC midnight. getMonday handles it correctly in UTC.
  const startDateObj = getMonday(new Date(dateFromStr));
  const dateFromGroupStyle = formatDateYMD(startDateObj);

  // Use manila boundaries for queries
  const range = getManilaDateRange(dateFromGroupStyle, dateToStr);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      group: { select: { id: true, name: true } },
      activeReleases: {
        orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { amount: true },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch adjustments separate from finding member to keep logic clean?
  const [balanceAdjustments, savingsAdjustments] = await Promise.all([
    // All DEDUCT adjustments for "Loan Balance" calculation
    prisma.balanceAdjustment.findMany({
      where: {
        memberId: member.id,
        type: BalanceUpdateType.DEDUCT,
      },
      select: { amount: true, createdAt: true },
    }),
    // Savings INCREASES within range
    prisma.savingsAdjustment.findMany({
      where: {
        memberId: member.id,
        type: SavingsUpdateType.INCREASE,
        createdAt: {
          gte: range.from,
          lte: range.to,
        }
      },
      select: { amount: true, createdAt: true },
    })
  ]);

  // Helper
  function toNumber(d: unknown) {
    if (d == null) return 0;
    if (typeof d === "number") return d;
    if (typeof d === "string") return Number(d) || 0;
    try {
      return Number((d as any).toString()) || 0;
    } catch {
      return 0;
    }
  }

  // Determine report columns (days)
  // NOTE: getWeekdaysInRange strictly returns Mon-Fri only, excluding weekends as required.
  const dayColumns = getWeekdaysInRange(dateFromGroupStyle, dateToStr);

  // --- PREPARE DATA FOR PDF ---
  
  // Member Info
  const memberCreatedDate = new Date(member.createdAt);
  const reportDateStr = `${new Date(dateFromGroupStyle).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} to ${new Date(dateToStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}`;
  
  const memberInfo = {
    name: `${member.firstName} ${member.lastName}`,
    groupName: member.group?.name || "No Group",
    memberSince: `${formatDateYMD(memberCreatedDate)} (${member.daysCount} ${member.daysCount === 1 ? "day" : "days"})`,
    reportDate: reportDateStr,
  };

  // Loan/Savings Balance Calculation (aligned with group report)
  const currentBal = toNumber(member.balance);
  const savingsBalance = toNumber(member.savings);
  const totalPaymentsAllTime = balanceAdjustments.reduce((sum, adj) => sum + toNumber(adj.amount), 0);
  const loanBalance = currentBal;
  const latestActiveReleaseAmount =
    member.activeReleases[0] != null ? toNumber(member.activeReleases[0].amount) : 0;

  // Daily Data
  const paymentsMap: Record<string, number> = {};
  const savingsMap: Record<string, number> = {};
  let totalPaymentsPeriod = 0;
  let totalSavingsPeriod = 0;

  dayColumns.forEach(dateStr => {
    const payments = balanceAdjustments.filter(adj => formatDateYMD(new Date(adj.createdAt)) === dateStr);
    const savings = savingsAdjustments.filter(adj => formatDateYMD(new Date(adj.createdAt)) === dateStr);

    const paymentSum = payments.reduce((s, a) => s + toNumber(a.amount), 0);
    const savingsSum = savings.reduce((s, a) => s + toNumber(a.amount), 0);

    if (paymentSum > 0) paymentsMap[dateStr] = paymentSum;
    if (savingsSum > 0) savingsMap[dateStr] = savingsSum;

    totalPaymentsPeriod += paymentSum;
    totalSavingsPeriod += savingsSum;
  });

  const reportData = {
    memberInfo,
    dayColumns,
    loanBalance,
    savingsBalance,
    activeReleaseAmount: latestActiveReleaseAmount,
    payments: paymentsMap,
    savings: savingsMap,
    totalPayments: totalPaymentsPeriod,
    totalSavings: totalSavingsPeriod,
    companyName: "Triple E Microfinance",
    logoUrl: await (async () => {
      try {
        const logoPath = path.join(process.cwd(), "public", "logo.jpg");
        const buf = await fs.promises.readFile(logoPath);
        return buf;
      } catch {
        return undefined;
      }
    })(),
  };

  // --- GENERATE PDF ---
  const stream = await renderToStream(React.createElement(MemberReportPdf, { data: reportData }) as any);

  // Audit Log
  const auditCtx = await tryGetAuditRequestContext();
  await createAuditLogStandalone({
    actorUserId: actor.id,
    action: "EXPORT_MEMBER_REPORT_PDF",
    entityType: "MEMBER",
    entityId: member.id,
    metadata: {
      from: dateFromStr,
      to: dateToStr,
      ip: auditCtx?.ip,
      userAgent: auditCtx?.userAgent,
    }
  });

  const filename = `Report-${safeFilePart(member.firstName)}-${safeFilePart(member.lastName)}-${dateFromStr}.pdf`;

  // Need to convert Node stream to Web stream response
  // renderToStream returns a NodeJS.ReadableStream
  // NextResponse expects a BodyInit which can be a ReadableStream, Buffer, etc.
  // We can collect the stream into a buffer for simplicity and reliability with Next.js App Router
  
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const pdfBuffer = Buffer.concat(chunks);

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
