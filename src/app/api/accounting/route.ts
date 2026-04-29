import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import {
  getAccountingReportData,
  serializeAccountingManualData,
  sanitizeAccountingManualData,
  type AccountingManualData,
} from "@/lib/accounting";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";

const SaveAccountingSchema = z.object({
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingBalanceOverride: z.union([z.number(), z.string(), z.null()]).optional(),
  loanReleaseOverride: z.union([z.number(), z.string(), z.null()]).optional(),
  receipts: z.record(z.string(), z.union([z.number(), z.string()])),
  payments: z.record(z.string(), z.union([z.number(), z.string()])),
  dailyExpenses: z.record(z.string(), z.union([z.number(), z.string()])),
});

function toDateOnly(date: string) {
  return new Date(`${date}T00:00:00.000+08:00`);
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const accountingDate = req.nextUrl.searchParams.get("date");
  if (!accountingDate || !/^\d{4}-\d{2}-\d{2}$/.test(accountingDate)) {
    return NextResponse.json(
      { error: "Invalid accounting date" },
      { status: 400 },
    );
  }

  try {
    const reportData = await getAccountingReportData(accountingDate);
    return NextResponse.json({
      success: true,
      reportData,
    });
  } catch (error) {
    console.error("Error loading accounting day:", error);
    return NextResponse.json(
      { error: "Failed to load accounting day" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const body = await req.json();
  const parsed = SaveAccountingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input" },
      { status: 400 },
    );
  }

  const manualData = sanitizeAccountingManualData(parsed.data as Partial<AccountingManualData>);
  const accountingDate = parsed.data.accountingDate;
  const request = await tryGetAuditRequestContext();
  const serializedManualData = serializeAccountingManualData(manualData);

  try {
    const existing = await (prisma as any).accountingDay.findUnique({
      where: { accountingDate: toDateOnly(accountingDate) },
      select: { id: true },
    });

    if (existing && user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "This accounting day is already saved. Only a super admin can override it." },
        { status: 403 },
      );
    }

    const saved = await prisma.$transaction(async (tx) => {
      const result = existing
        ? await (tx as any).accountingDay.update({
            where: { accountingDate: toDateOnly(accountingDate) },
            data: {
              receipts: serializedManualData.receipts,
              payments: serializedManualData.payments,
              dailyExpenses: serializedManualData.dailyExpenses,
              updatedById: user.id,
            },
          })
        : await (tx as any).accountingDay.create({
            data: {
              accountingDate: toDateOnly(accountingDate),
              receipts: serializedManualData.receipts,
              payments: serializedManualData.payments,
              dailyExpenses: serializedManualData.dailyExpenses,
              createdById: user.id,
              updatedById: user.id,
            },
          });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "ACCOUNTING_DAY_SAVE",
        entityType: "AccountingDay",
        entityId: result.id,
        metadata: { accountingDate },
        request,
      });

      return result;
    });

    return NextResponse.json({
      success: true,
      accountingDate,
      data: {
        ...serializedManualData,
        lastUpdatedAt: saved.updatedAt?.toISOString?.() ?? null,
      },
    });
  } catch (error) {
    console.error("Error saving accounting day:", error);
    return NextResponse.json(
      { error: "Failed to save accounting day" },
      { status: 500 },
    );
  }
}
