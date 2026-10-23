import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role, BalanceUpdateType, SavingsUpdateType } from "@prisma/client";
import { tryGetAuditRequestContext } from "@/lib/audit";
import { getManilaDateRange, getMonday, formatDateYMD, getWeekdaysInRange } from "@/lib/date";
import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import { MemberReportPdf } from "@/lib/pdf/MemberReportPdf";
import { APP_CONTROL_KEYS, resolveAppControl } from "@/lib/app-controls";
import { consumeReportAction, ReportActionLockedError } from "@/lib/report-actions";
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

async function checkReportViewDownloadAllowed(actor: { id: string; role: string }): Promise<boolean> {
  if (actor.role === Role.SUPER_ADMIN) return true;
  const control = await resolveAppControl(APP_CONTROL_KEYS.REPORT_VIEW_DOWNLOAD_ENABLED);
  return control.enabled && !control.isExpired;
}

// Reimplementation of GET to match Group Export Design
export async function GET(
  req: Request,
  ctx: { params: Promise<{ memberId: string }> },
) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);
  const allowed = await checkReportViewDownloadAllowed(actor);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { memberId } = await ctx.params;
  const { from: dateFromStr, to: dateToStr } = parseDateRange(req);
  const url = new URL(req.url, "http://localhost");
  const format = url.searchParams.get("format")?.toLowerCase();
  const isPreview = url.searchParams.get("preview") === "true";
  const shouldConsumeDownload = !isPreview && format !== "json";

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
        where: {
          releaseDate: {
            lte: range.to,
          },
        },
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
    prisma.balanceAdjustment.findMany({
      where: {
        memberId: member.id,
      },
      select: { amount: true, createdAt: true, type: true },
    }),
    prisma.savingsAdjustment.findMany({
      where: {
        memberId: member.id,
      },
      select: { amount: true, createdAt: true, type: true },
    }),
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

  const currentBal = toNumber(member.balance);
  const currentSavings = toNumber(member.savings);
  const balanceAdjustmentsAfterRange = balanceAdjustments.filter((adjustment) => adjustment.createdAt > range.to);
  const savingsAdjustmentsAfterRange = savingsAdjustments.filter((adjustment) => adjustment.createdAt > range.to);

  const loanBalance = balanceAdjustmentsAfterRange.reduce((value, adjustment) => {
    const amount = toNumber(adjustment.amount);
    const signedAmount =
      adjustment.type === BalanceUpdateType.INCREASE ? amount : -amount;
    return value - signedAmount;
  }, currentBal);

  const savingsBalance = savingsAdjustmentsAfterRange.reduce((value, adjustment) => {
    const amount = toNumber(adjustment.amount);
    const signedAmount =
      adjustment.type === SavingsUpdateType.INCREASE ? amount : -amount;
    return value - signedAmount;
  }, currentSavings);

  const latestActiveReleaseAmount =
    member.activeReleases[0] != null ? toNumber(member.activeReleases[0].amount) : 0;

  const inSelectedRange = (createdAt: Date) => createdAt >= range.from && createdAt <= range.to;
  const paymentAdjustmentsInRange = balanceAdjustments.filter(
    (adjustment) =>
      adjustment.type === BalanceUpdateType.DEDUCT && inSelectedRange(adjustment.createdAt),
  );
  const savingsAdjustmentsInRange = savingsAdjustments.filter(
    (adjustment) =>
      adjustment.type === SavingsUpdateType.INCREASE && inSelectedRange(adjustment.createdAt),
  );

  const paymentsMap: Record<string, number> = {};
  const savingsMap: Record<string, number> = {};
  let totalPaymentsPeriod = 0;
  let totalSavingsPeriod = 0;

  dayColumns.forEach(dateStr => {
    const payments = paymentAdjustmentsInRange.filter(
      (adjustment) => formatDateYMD(new Date(adjustment.createdAt)) === dateStr,
    );
    const savings = savingsAdjustmentsInRange.filter(
      (adjustment) => formatDateYMD(new Date(adjustment.createdAt)) === dateStr,
    );

    const paymentSum = payments.reduce((s, a) => s + toNumber(a.amount), 0);
    const savingsSum = savings.reduce((s, a) => s + toNumber(a.amount), 0);

    if (paymentSum > 0) paymentsMap[dateStr] = paymentSum;
    if (savingsSum > 0) savingsMap[dateStr] = savingsSum;

    totalPaymentsPeriod += paymentSum;
    totalSavingsPeriod += savingsSum;
  });

  const totalBalance = loanBalance - totalPaymentsPeriod;

  const reportData = {
    memberInfo,
    dayColumns,
    loanBalance,
    savingsBalance,
    activeReleaseAmount: latestActiveReleaseAmount,
    payments: paymentsMap,
    savings: savingsMap,
    totalBalance,
    totalPayments: totalPaymentsPeriod,
    totalSavings: totalSavingsPeriod,
    companyName: "Triple E Microfinance",
    logoUrl: format === "json" ? undefined : await (async () => {
      try {
        const logoPath = path.join(process.cwd(), "public", "logo.jpg");
        const buf = await fs.promises.readFile(logoPath);
        return buf;
      } catch {
        return undefined;
      }
    })(),
  };

  if (format === "json") {
    return NextResponse.json(reportData);
  }

  if (shouldConsumeDownload) {
    try {
      const request = await tryGetAuditRequestContext();
      await consumeReportAction({
        actorUserId: actor.id,
        reportType: "MEMBER",
        reportAreaId: member.id,
        reportAreaName: `${member.lastName}, ${member.firstName}`,
        reportLabel: "Member Report",
        from: dateFromGroupStyle,
        to: dateToStr,
        request,
      });
    } catch (error) {
      if (error instanceof ReportActionLockedError) {
        return NextResponse.json(
          {
            error: "Download already used for this report today.",
            code: error.message,
            lock: {
              reportAreaName: error.lock.reportAreaName,
              createdAt: error.lock.createdAt.toISOString(),
              actedByName: error.lock.actedByName,
            },
          },
          { status: 409 },
        );
      }

      throw error;
    }
  }

  // --- GENERATE PDF ---
  const stream = await renderToStream(React.createElement(MemberReportPdf, { data: reportData }) as any);

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
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
