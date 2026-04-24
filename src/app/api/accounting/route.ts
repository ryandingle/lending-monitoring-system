import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import {
  sanitizeAccountingManualData,
  type AccountingManualData,
} from "@/lib/accounting";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";

const SaveAccountingSchema = z.object({
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receipts: z.record(z.string(), z.union([z.number(), z.string()])),
  payments: z.record(z.string(), z.union([z.number(), z.string()])),
  dailyExpenses: z.record(z.string(), z.union([z.number(), z.string()])),
});

function toDateOnly(date: string) {
  return new Date(`${date}T00:00:00.000+08:00`);
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

  const manualData = sanitizeAccountingManualData(parsed.data as AccountingManualData);
  const accountingDate = parsed.data.accountingDate;
  const request = await tryGetAuditRequestContext();

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const result = await (tx as any).accountingDay.upsert({
        where: { accountingDate: toDateOnly(accountingDate) },
        update: {
          receipts: manualData.receipts,
          payments: manualData.payments,
          dailyExpenses: manualData.dailyExpenses,
          updatedById: user.id,
        },
        create: {
          accountingDate: toDateOnly(accountingDate),
          receipts: manualData.receipts,
          payments: manualData.payments,
          dailyExpenses: manualData.dailyExpenses,
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
        receipts: saved.receipts,
        payments: saved.payments,
        dailyExpenses: saved.dailyExpenses,
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
