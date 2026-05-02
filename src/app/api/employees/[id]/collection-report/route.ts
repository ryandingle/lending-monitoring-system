import React from "react";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { BalanceUpdateType, Role, SavingsUpdateType } from "@prisma/client";
import { getManilaDateRange } from "@/lib/date";
import { renderToStream } from "@react-pdf/renderer";
import {
  OfficerCollectionReportPdf,
  OfficerGroupRow,
  OfficerReportData,
} from "@/lib/pdf/OfficerCollectionReportPdf";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function safeFilePart(s: string) {
  return s
    .replaceAll(/[^a-zA-Z0-9-_]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
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

function normalizeMemberNote(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
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

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const { id } = await ctx.params;
  const { from: dateFrom, to: dateTo } = parseDateRange(req);
  const url = new URL(req.url);
  const format = url.searchParams.get("format")?.toLowerCase();
  const isPreview = url.searchParams.get("preview") === "true";

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  const range = getManilaDateRange(dateFrom, dateTo);

  const employee = await (prisma as any).employee.findUnique({
    where: { id },
    include: {
      groupsAsCollectionOfficer: {
        orderBy: { name: "asc" },
        include: {
          members: {
            where: { status: "ACTIVE" },
            include: {
              balanceAdjustments: {
                where: {
                  type: BalanceUpdateType.DEDUCT,
                  createdAt: {
                    gte: range.from,
                    lte: range.to,
                  },
                },
                select: {
                  amount: true,
                  balanceAfter: true,
                },
              },
              savingsAdjustments: {
                where: {
                  createdAt: {
                    gte: range.from,
                    lte: range.to,
                  },
                  OR: [
                    { type: SavingsUpdateType.INCREASE },
                    { type: SavingsUpdateType.WITHDRAW },
                  ],
                },
                select: {
                  amount: true,
                  type: true,
                },
              },
              notes: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  content: true,
                },
              },
              processingFees: {
                where: {
                  createdAt: {
                    gte: range.from,
                    lte: range.to,
                  },
                },
                select: {
                  amount: true,
                },
              },
              loanInsurances: {
                where: {
                  createdAt: {
                    gte: range.from,
                    lte: range.to,
                  },
                },
                select: {
                  amount: true,
                },
              },
              passbookFees: {
                where: {
                  createdAt: {
                    gte: range.from,
                    lte: range.to,
                  },
                },
                select: {
                  amount: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const groupRows: OfficerGroupRow[] = [];
  const totals = {
    loanCollection: 0,
    savings: 0,
    processingFee: 0,
    loanInsurance: 0,
    passbookFee: 0,
    totalCollection: 0,
    fullRepaymentCount: 0,
    fullRepaymentAmount: 0,
    offsetCount: 0,
    offsetAmount: 0,
  };

  for (const group of employee.groupsAsCollectionOfficer as any[]) {
    let loanCollection = 0;
    let savings = 0;
    let processingFee = 0;
    let loanInsurance = 0;
    let passbookFee = 0;
    let fullRepaymentCount = 0;
    let fullRepaymentAmount = 0;
    let offsetCount = 0;
    let offsetAmount = 0;

    for (const member of group.members) {
      const latestNote = normalizeMemberNote(member.notes[0]?.content);
      let memberFullRepaymentAmount = 0;
      let hasFullRepayment = false;
      let memberOffsetAmount = 0;

      for (const adj of member.balanceAdjustments) {
        const amount = toNumber(adj.amount);
        loanCollection += amount;
        if (toNumber(adj.balanceAfter) === 0 && amount > 0) {
          hasFullRepayment = true;
          memberFullRepaymentAmount += amount;
        }
      }

      for (const sav of member.savingsAdjustments) {
        const amount = toNumber(sav.amount);
        if (sav.type === SavingsUpdateType.INCREASE) {
          savings += amount;
        }
        if (sav.type === SavingsUpdateType.WITHDRAW) {
          memberOffsetAmount += amount;
        }
      }

      for (const fee of member.processingFees) {
        processingFee += toNumber(fee.amount);
      }

      for (const insurance of member.loanInsurances) {
        loanInsurance += toNumber(insurance.amount);
      }

      for (const fee of member.passbookFees) {
        passbookFee += toNumber(fee.amount);
      }

      if (latestNote === "FULL" && hasFullRepayment) {
        fullRepaymentCount += 1;
        fullRepaymentAmount += memberFullRepaymentAmount;
      }

      if (latestNote === "OFFSET" && memberOffsetAmount > 0) {
        offsetCount += 1;
        offsetAmount += memberOffsetAmount;
      }
    }

    const totalCollection = loanCollection + savings + processingFee + loanInsurance + passbookFee;

    groupRows.push({
      groupName: group.name,
      loanCollection,
      savings,
      processingFee,
      loanInsurance,
      passbookFee,
      totalCollection,
      fullRepaymentCount,
      fullRepaymentAmount,
      offsetCount,
      offsetAmount,
    });

    totals.loanCollection += loanCollection;
    totals.savings += savings;
    totals.processingFee += processingFee;
    totals.loanInsurance += loanInsurance;
    totals.passbookFee += passbookFee;
    totals.totalCollection += totalCollection;
    totals.fullRepaymentCount += fullRepaymentCount;
    totals.fullRepaymentAmount += fullRepaymentAmount;
    totals.offsetCount += offsetCount;
    totals.offsetAmount += offsetAmount;
  }

  let logoBinary: Buffer | null = null;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.jpg");
    logoBinary = await fs.promises.readFile(logoPath);
  } catch {
    logoBinary = null;
  }

  const fromDateObj = new Date(dateFrom);
  const toDateObj = new Date(dateTo);
  const dateLabel =
    dateFrom === dateTo
      ? toDateObj.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "2-digit",
        })
      : `${fromDateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
        })} - ${toDateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
        })}`;

  const reportData: OfficerReportData = {
    officerId: id,
    officerName: `${employee.firstName} ${employee.lastName}`,
    dateLabel,
    groups: groupRows,
    totals,
    companyName: "Triple E Microfinance",
    logoUrl: format === "json" ? undefined : (logoBinary ?? undefined),
  };

  if (format === "json") {
    return NextResponse.json(reportData);
  }

  const stream = await renderToStream(
    React.createElement(OfficerCollectionReportPdf, { data: reportData }) as any,
  );

  const chunks: Buffer[] = [];
  // @ts-ignore
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const pdfBuffer = Buffer.concat(chunks);

  const filename = `collection-officer-report-${safeFilePart(
    employee.lastName,
  )}-${safeFilePart(employee.firstName)}-${dateTo}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
