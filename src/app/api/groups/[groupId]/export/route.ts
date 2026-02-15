import React from "react";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { BalanceUpdateType, Role, SavingsUpdateType } from "@prisma/client";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";
import { getMonday, formatDateYMD, getManilaDateRange, getWeekdaysInRange } from "@/lib/date";
import { renderToStream } from "@react-pdf/renderer";
import { CollectionReportPdf } from "@/lib/pdf/CollectionReportPdf";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function safeFilePart(s: string) {
  return s.replaceAll(/[^a-zA-Z0-9-_]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/(^-|-$)/g, "");
}

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

function parseDateRange(req: Request): { from: string | null; to: string | null } {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from")?.trim() ?? null;
    const to = url.searchParams.get("to")?.trim() ?? null;
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { from: null, to: null };
    }
    return { from, to };
  } catch {
    return { from: null, to: null };
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const { groupId } = await ctx.params;
  const { from: dateFromRaw, to: dateTo } = parseDateRange(req);

  if (!dateFromRaw || !dateTo) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  // Snap start date to Monday
  const startDateObj = getMonday(new Date(dateFromRaw));
  const dateFrom = formatDateYMD(startDateObj);

  // Determine report columns (days)
  const dayColumns = getWeekdaysInRange(dateFrom, dateTo);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          balanceAdjustments: {
            where: { type: BalanceUpdateType.DEDUCT },
            select: { amount: true, createdAt: true },
          },
          savingsAdjustments: {
            where: {
              type: SavingsUpdateType.INCREASE,
              createdAt: {
                gte: getManilaDateRange(dateFrom, dateTo).from,
                lte: getManilaDateRange(dateFrom, dateTo).to,
              }
            },
            select: { amount: true, createdAt: true },
          },
        },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // --- PREPARE DATA FOR PDF ---
  const totals = {
    loanBalance: 0,
    dailyPayments: {} as Record<string, number>,
    dailySavings: {} as Record<string, number>,
    totalPayments: 0,
    totalSavings: 0,
  };

  const membersData = group.members.map((m) => {
    const currentBal = toNumber(m.balance);
    const totalPaymentsAllTime = m.balanceAdjustments.reduce((sum, adj) => sum + toNumber(adj.amount), 0);
    const loanBalance = currentBal + totalPaymentsAllTime;
    
    totals.loanBalance += loanBalance;

    let memberTotalPayments = 0;
    let memberTotalSavings = 0;
    const paymentsMap: Record<string, number> = {};
    const savingsMap: Record<string, number> = {};

    dayColumns.forEach(dateStr => {
      const payments = m.balanceAdjustments.filter(adj => formatDateYMD(new Date(adj.createdAt)) === dateStr);
      const savings = m.savingsAdjustments.filter(adj => formatDateYMD(new Date(adj.createdAt)) === dateStr);

      const paymentSum = payments.reduce((s, a) => s + toNumber(a.amount), 0);
      const savingsSum = savings.reduce((s, a) => s + toNumber(a.amount), 0);

      if (paymentSum > 0) {
        paymentsMap[dateStr] = paymentSum;
        totals.dailyPayments[dateStr] = (totals.dailyPayments[dateStr] || 0) + paymentSum;
        memberTotalPayments += paymentSum;
      }
      
      if (savingsSum > 0) {
        savingsMap[dateStr] = savingsSum;
        totals.dailySavings[dateStr] = (totals.dailySavings[dateStr] || 0) + savingsSum;
        memberTotalSavings += savingsSum;
      }
    });

    totals.totalPayments += memberTotalPayments;
    totals.totalSavings += memberTotalSavings;

    return {
      name: `${m.lastName}, ${m.firstName}`,
      loanBalance,
      payments: paymentsMap,
      savings: savingsMap,
      totalPayments: memberTotalPayments,
      totalSavings: memberTotalSavings,
    };
  });

  let logoBinary: Buffer | null = null;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.jpg");
    logoBinary = await fs.promises.readFile(logoPath);
  } catch {
    logoBinary = null;
  }

  const reportData = {
    groupName: group.name,
    dateRange: `${new Date(dateFrom).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} - ${new Date(dateTo).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}`,
    dayColumns,
    members: membersData,
    totals,
    companyName: "Triple E Microfinance",
    logoUrl: logoBinary ?? undefined,
  };

  // --- RENDER PDF ---
  const stream = await renderToStream(React.createElement(CollectionReportPdf, { data: reportData }) as any);
  
  // Convert Node stream to Buffer
  const chunks: Buffer[] = [];
  // @ts-ignore - stream is async iterable
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const pdfBuffer = Buffer.concat(chunks);

  // Audit
  try {
    const request = await tryGetAuditRequestContext();
    await createAuditLogStandalone({
      actorUserId: actor.id,
      action: "GROUP_EXPORT",
      entityType: "Group",
      entityId: groupId,
      metadata: { format: "pdf", memberCount: group.members.length },
      request,
    });
  } catch {
    // ignore audit failures for export
  }

  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `collection-report-${safeFilePart(group.name)}-${datePart}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
