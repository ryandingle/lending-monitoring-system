import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import {
  buildAccountingView,
  CLOSING_BALANCE_KEY,
  getAccountingComputedTotals,
  getBaseOpeningBalance,
  getAccountingReportData,
  serializeAccountingManualData,
  sanitizeAccountingNote,
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

const EncoderOverrideSchema = z.object({
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  encoderOverrideAllowed: z.boolean(),
});

const AccountingNoteSchema = z.object({
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(5000).nullable(),
});

function toDateOnly(date: string) {
  return new Date(`${date}T12:00:00.000+08:00`);
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

  const inputManualData = sanitizeAccountingManualData(parsed.data as Partial<AccountingManualData>);
  const accountingDate = parsed.data.accountingDate;
  const request = await tryGetAuditRequestContext();

  try {
    const existing = await (prisma as any).accountingDay.findUnique({
      where: { accountingDate: toDateOnly(accountingDate) },
      select: {
        id: true,
        receipts: true,
        payments: true,
        dailyExpenses: true,
        note: true,
        encoderOverrideAllowed: true,
      },
    });

    const existingManualData = existing
      ? sanitizeAccountingManualData({
          receipts: existing.receipts,
          payments: existing.payments,
          dailyExpenses: existing.dailyExpenses,
          encoderOverrideAllowed: existing.encoderOverrideAllowed,
        })
      : null;
    const manualData = {
      ...inputManualData,
      encoderOverrideAllowed: existingManualData?.encoderOverrideAllowed ?? false,
    };
    const serializedManualData = serializeAccountingManualData(manualData);

    const computedTotals = await getAccountingComputedTotals(accountingDate);
    const baseOpeningBalance = await getBaseOpeningBalance(accountingDate, computedTotals);
    const resolvedOpeningBalance = manualData.openingBalanceOverride ?? baseOpeningBalance;
    const resolvedComputedTotals = {
      ...computedTotals,
      loanRelease: manualData.loanReleaseOverride ?? computedTotals.loanRelease,
    };
    const view = buildAccountingView(manualData, resolvedComputedTotals, resolvedOpeningBalance);
    const paymentsWithClosingBalance = {
      ...serializedManualData.payments,
      [CLOSING_BALANCE_KEY]: Math.round(view.closingBalance),
    };

    if (existing && user.role !== Role.SUPER_ADMIN && !existingManualData?.encoderOverrideAllowed) {
      return NextResponse.json(
        {
          error:
            "This accounting day is already saved. Only a super admin or an encoder allowed for this date can override it.",
        },
        { status: 403 },
      );
    }

    const saved = await prisma.$transaction(async (tx) => {
      const result = existing
        ? await (tx as any).accountingDay.update({
            where: { accountingDate: toDateOnly(accountingDate) },
            data: {
              receipts: serializedManualData.receipts,
              payments: paymentsWithClosingBalance,
              dailyExpenses: serializedManualData.dailyExpenses,
              note: sanitizeAccountingNote(existing.note),
              encoderOverrideAllowed: manualData.encoderOverrideAllowed,
              updatedById: user.id,
            },
          })
        : await (tx as any).accountingDay.create({
            data: {
              accountingDate: toDateOnly(accountingDate),
              receipts: serializedManualData.receipts,
              payments: paymentsWithClosingBalance,
              dailyExpenses: serializedManualData.dailyExpenses,
              note: null,
              encoderOverrideAllowed: manualData.encoderOverrideAllowed,
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
        payments: paymentsWithClosingBalance,
        note: saved.note ?? null,
        encoderOverrideAllowed: manualData.encoderOverrideAllowed,
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

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if ("encoderOverrideAllowed" in body) {
    const user = await requireUser();
    requireRole(user, [Role.SUPER_ADMIN]);

    const parsed = EncoderOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { accountingDate, encoderOverrideAllowed } = parsed.data;
    const request = await tryGetAuditRequestContext();

    try {
      const existing = await (prisma as any).accountingDay.findUnique({
        where: { accountingDate: toDateOnly(accountingDate) },
        select: {
          id: true,
          receipts: true,
          payments: true,
          dailyExpenses: true,
          note: true,
          encoderOverrideAllowed: true,
          updatedAt: true,
        },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Save the accounting day first before granting encoder override." },
          { status: 404 },
        );
      }

      const manualData = sanitizeAccountingManualData({
        receipts: existing.receipts,
        payments: existing.payments,
        dailyExpenses: existing.dailyExpenses,
        encoderOverrideAllowed,
      });
      const serializedManualData = serializeAccountingManualData(manualData);
      const existingClosingBalance = (existing.payments as any)?.[CLOSING_BALANCE_KEY];
      const nextPayments = {
        ...serializedManualData.payments,
        ...(existingClosingBalance === undefined
          ? {}
          : { [CLOSING_BALANCE_KEY]: existingClosingBalance }),
      };

      const saved = await prisma.$transaction(async (tx) => {
        const result = await (tx as any).accountingDay.update({
          where: { accountingDate: toDateOnly(accountingDate) },
          data: {
            receipts: serializedManualData.receipts,
            payments: nextPayments,
            dailyExpenses: serializedManualData.dailyExpenses,
            note: sanitizeAccountingNote(existing.note),
            encoderOverrideAllowed,
            updatedById: user.id,
          },
        });

        await createAuditLog(tx, {
          actorUserId: user.id,
          action: encoderOverrideAllowed
            ? "ACCOUNTING_ENCODER_OVERRIDE_GRANTED"
            : "ACCOUNTING_ENCODER_OVERRIDE_REVOKED",
          entityType: "AccountingDay",
          entityId: result.id,
          metadata: { accountingDate, encoderOverrideAllowed },
          request,
        });

        return result;
      });

      return NextResponse.json({
        success: true,
        accountingDate,
        encoderOverrideAllowed,
        lastUpdatedAt: saved.updatedAt?.toISOString?.() ?? null,
      });
    } catch (error) {
      console.error("Error updating encoder override permission:", error);
      return NextResponse.json(
        { error: "Failed to update encoder override permission" },
        { status: 500 },
      );
    }
  }

  if ("note" in body) {
    const user = await requireUser();
    requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

    const parsed = AccountingNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { accountingDate, note } = parsed.data;
    const request = await tryGetAuditRequestContext();

    try {
      const existing = await (prisma as any).accountingDay.findUnique({
        where: { accountingDate: toDateOnly(accountingDate) },
        select: {
          id: true,
          updatedAt: true,
        },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Save the accounting day first before adding a note." },
          { status: 404 },
        );
      }

      const sanitizedNote = sanitizeAccountingNote(note);
      const saved = await prisma.$transaction(async (tx) => {
        const result = await (tx as any).accountingDay.update({
          where: { accountingDate: toDateOnly(accountingDate) },
          data: {
            note: sanitizedNote,
            updatedById: user.id,
          },
        });

        await createAuditLog(tx, {
          actorUserId: user.id,
          action: "ACCOUNTING_DAY_NOTE_SAVE",
          entityType: "AccountingDay",
          entityId: result.id,
          metadata: { accountingDate, hasNote: Boolean(sanitizedNote) },
          request,
        });

        return result;
      });

      return NextResponse.json({
        success: true,
        accountingDate,
        note: saved.note ?? null,
        lastUpdatedAt: saved.updatedAt?.toISOString?.() ?? null,
      });
    } catch (error) {
      console.error("Error updating accounting note:", error);
      return NextResponse.json({ error: "Failed to update accounting note" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
