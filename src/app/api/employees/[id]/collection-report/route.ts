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

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  const range = getManilaDateRange(dateFrom, dateTo);

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      groupsAsCollectionOfficer: {
        orderBy: { name: "asc" },
        include: {
          members: {
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
                  type: SavingsUpdateType.INCREASE,
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
    totalCollection: 0,
    fullRepaymentCount: 0,
    fullRepaymentAmount: 0,
  };

  for (const group of employee.groupsAsCollectionOfficer) {
    let loanCollection = 0;
    let savings = 0;
    let fullRepaymentCount = 0;
    let fullRepaymentAmount = 0;

    for (const member of group.members) {
      for (const adj of member.balanceAdjustments) {
        const amount = toNumber(adj.amount);
        loanCollection += amount;
        if (toNumber(adj.balanceAfter) === 0 && amount > 0) {
          fullRepaymentCount += 1;
          fullRepaymentAmount += amount;
        }
      }

      for (const sav of member.savingsAdjustments) {
        savings += toNumber(sav.amount);
      }
    }

    const totalCollection = loanCollection + savings;

    groupRows.push({
      groupName: group.name,
      loanCollection,
      savings,
      totalCollection,
      fullRepaymentCount,
      fullRepaymentAmount,
    });

    totals.loanCollection += loanCollection;
    totals.savings += savings;
    totals.totalCollection += totalCollection;
    totals.fullRepaymentCount += fullRepaymentCount;
    totals.fullRepaymentAmount += fullRepaymentAmount;
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
    officerName: `${employee.firstName} ${employee.lastName}`,
    dateLabel,
    groups: groupRows,
    totals,
    companyName: "Triple E Microfinance",
    logoUrl: logoBinary ?? undefined,
  };

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
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
