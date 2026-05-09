import { BalanceUpdateType, MemberStatus, Prisma, SavingsUpdateType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getManilaDateRange } from "@/lib/date";

export const RECEIPTS_MANUAL_FIELDS = [
  { key: "cashAdvance", label: "Cash Advance" },
  { key: "ftIn", label: "FT(IN)" },
  { key: "bankWithdrawal1", label: "Bank wdl.-DFOB1" },
  { key: "bankWithdrawal2", label: "Bank wdl.-DFOB2" },
] as const;

export const PAYMENT_MANUAL_FIELDS = [
  { key: "loanRelease", label: "Loan Release" },
  { key: "otherPay", label: "Other Pay" },
  { key: "ftOut", label: "FT(OUT)" },
  { key: "bankDeposit1", label: "Bank depo-DFOB1" },
  { key: "bankDeposit2", label: "Bank depo-DFOB2" },
  { key: "bankDeposit3", label: "Bank depo-DFOB3" },
  { key: "bankDeposit4", label: "Bank depo-DFOB4" },
  { key: "bankDeposit5", label: "Bank depo-DFOB5" },
  { key: "bankTransactionDepo", label: "Bank Transaction - Depo" },
  { key: "bankTransactionWithdraw", label: "Bank Transaction - Withdraw" },
  { key: "bankTransactionBalance", label: "Bank Transaction - Balance" },
  { key: "bankTransactionTotalAmount", label: "Bank Transaction - Total Amount" },
] as const;

export const DAILY_EXPENSE_FIELDS = [
  { key: "representation", label: "Representation" },
  { key: "fuel", label: "Fuel" },
  { key: "travelExpenses", label: "Travel Expenses" },
  { key: "ownersWithdrawal", label: "Owners Withdrawal" },
  { key: "professionalFee", label: "Professional Fee" },
  { key: "salariesAndWages", label: "Salaries and Wages" },
  { key: "staffBenefits", label: "Staff Benefits" },
  { key: "allowance", label: "Allowance" },
  { key: "cashAdvance", label: "Cash Advance" },
  { key: "furnitureAndFixtures", label: "Furniture and Fixtures" },
  { key: "officeRent", label: "Office Rent" },
  { key: "utilitiesExpenses", label: "Utilities Expenses" },
  { key: "officeSupplies", label: "Office Supplies" },
  { key: "cashDividend", label: "Cash Dividend" },
  { key: "miscellaneous", label: "Miscellaneous" },
  { key: "sssPagibigPh", label: "SSS/Pagibig/PH" },
  { key: "officeEquipment", label: "Office Equipment" },
  { key: "staffLoan", label: "Staff Loan" },
  { key: "offset", label: "Offset" },
] as const;

export type AccountingManualSection = Record<string, number>;

export type AccountingManualData = {
  openingBalanceOverride: number | null;
  loanReleaseOverride: number | null;
  encoderOverrideAllowed: boolean;
  receipts: AccountingManualSection;
  payments: AccountingManualSection;
  dailyExpenses: AccountingManualSection;
};

export type AccountingComputedTotals = {
  cashOnHand: number;
  loanCollection: number;
  loanRelease: number;
  loanInsurance: number;
  processingFee: number;
  passbook: number;
  membershipFee: number;
  savings: number;
  totalCollection: number;
  fullRepaymentCount: number;
  fullRepaymentAmount: number;
};

export type AccountingView = {
  openingBalance: number;
  receiptsTotal: number;
  managementExpense: number;
  dailyExpensesTotal: number;
  bankDepositTotal: number;
  paymentBaseTotal: number;
  closingBalance: number;
  totalPayments: number;
};

export type AccountingReportData = {
  accountingDate: string;
  manualData: AccountingManualData;
  computedTotals: AccountingComputedTotals;
  view: AccountingView;
  lastUpdatedAt: string | null;
};

const OPENING_BALANCE_OVERRIDE_KEY = "__openingBalanceOverride";
const LOAN_RELEASE_OVERRIDE_KEY = "__loanReleaseOverride";
const ENCODER_OVERRIDE_ALLOWED_KEY = "__encoderOverrideAllowed";
export const CLOSING_BALANCE_KEY = "__closingBalance";

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function toOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function extractClosingBalance(payments: unknown): number | null {
  if (!payments || typeof payments !== "object") return null;
  return toOptionalNumber((payments as Record<string, unknown>)[CLOSING_BALANCE_KEY]);
}

function createEmptySection(keys: readonly { key: string }[]) {
  return Object.fromEntries(keys.map(({ key }) => [key, 0])) as AccountingManualSection;
}

export function getDefaultAccountingManualData(): AccountingManualData {
  return {
    openingBalanceOverride: null,
    loanReleaseOverride: null,
    encoderOverrideAllowed: false,
    receipts: createEmptySection(RECEIPTS_MANUAL_FIELDS),
    payments: createEmptySection(PAYMENT_MANUAL_FIELDS),
    dailyExpenses: createEmptySection(DAILY_EXPENSE_FIELDS),
  };
}

export function sanitizeAccountingManualData(
  input: Partial<AccountingManualData> | null | undefined,
): AccountingManualData {
  const normalize = (
    source: Record<string, unknown> | null | undefined,
    keys: readonly { key: string }[],
  ) =>
    Object.fromEntries(
      keys.map(({ key }) => [key, roundWhole(source?.[key])]),
    ) as AccountingManualSection;

  return {
    openingBalanceOverride: toOptionalNumber(
      input?.openingBalanceOverride ??
        (input?.receipts as Record<string, unknown> | undefined)?.[OPENING_BALANCE_OVERRIDE_KEY],
    ),
    loanReleaseOverride: toOptionalNumber(
      input?.loanReleaseOverride ??
        (input?.payments as Record<string, unknown> | undefined)?.[LOAN_RELEASE_OVERRIDE_KEY],
    ),
    encoderOverrideAllowed:
      input?.encoderOverrideAllowed === true ||
      (input?.receipts as Record<string, unknown> | undefined)?.[ENCODER_OVERRIDE_ALLOWED_KEY] === true,
    receipts: normalize(input?.receipts as Record<string, unknown> | undefined, RECEIPTS_MANUAL_FIELDS),
    payments: normalize(input?.payments as Record<string, unknown> | undefined, PAYMENT_MANUAL_FIELDS),
    dailyExpenses: normalize(
      input?.dailyExpenses as Record<string, unknown> | undefined,
      DAILY_EXPENSE_FIELDS,
    ),
  };
}

export function serializeAccountingManualData(manualData: AccountingManualData) {
  const receipts =
    {
      ...manualData.receipts,
      ...(manualData.openingBalanceOverride == null
        ? {}
        : { [OPENING_BALANCE_OVERRIDE_KEY]: manualData.openingBalanceOverride }),
    };
  const payments =
    {
      ...manualData.payments,
      ...(manualData.loanReleaseOverride == null
        ? {}
        : { [LOAN_RELEASE_OVERRIDE_KEY]: manualData.loanReleaseOverride }),
    };

  return {
    receipts,
    payments,
    dailyExpenses: { ...manualData.dailyExpenses },
  };
}

function sumSection(section: AccountingManualSection, keys: readonly { key: string }[]) {
  return keys.reduce((sum, field) => sum + toNumber(section[field.key]), 0);
}

function roundWhole(value: unknown) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function buildAccountingView(
  manual: AccountingManualData,
  computed: AccountingComputedTotals,
  openingBalance = computed.cashOnHand,
): AccountingView {
  const bankDepositTotal = PAYMENT_MANUAL_FIELDS.filter((field) =>
    field.key.startsWith("bankDeposit"),
  ).reduce((sum, field) => sum + toNumber(manual.payments[field.key]), 0);

  const dailyExpensesTotal = roundWhole(sumSection(manual.dailyExpenses, DAILY_EXPENSE_FIELDS));
  const managementExpense = dailyExpensesTotal;
  const manualReceiptInflows =
    roundWhole(manual.receipts.cashAdvance) +
    roundWhole(manual.receipts.ftIn) +
    roundWhole(manual.receipts.bankWithdrawal1) +
    roundWhole(manual.receipts.bankWithdrawal2);
  const receiptsTotal =
    roundWhole(openingBalance) +
    roundWhole(computed.loanCollection) +
    roundWhole(computed.savings) +
    roundWhole(computed.processingFee) +
    roundWhole(computed.passbook) +
    roundWhole(computed.membershipFee) +
    roundWhole(computed.loanInsurance) +
    manualReceiptInflows;

  const paymentBaseTotal =
    roundWhole(computed.loanRelease) +
    managementExpense +
    roundWhole(manual.payments.otherPay) +
    roundWhole(manual.payments.ftOut) +
    roundWhole(bankDepositTotal);

  const closingBalance = roundWhole(receiptsTotal - paymentBaseTotal);
  const totalPayments = roundWhole(paymentBaseTotal + closingBalance);

  return {
    openingBalance: roundWhole(openingBalance),
    receiptsTotal: roundWhole(receiptsTotal),
    managementExpense,
    dailyExpensesTotal,
    bankDepositTotal: roundWhole(bankDepositTotal),
    paymentBaseTotal: roundWhole(paymentBaseTotal),
    closingBalance,
    totalPayments,
  };
}

export async function getAccountingManualDataForDate(accountingDate: string): Promise<{
  manualData: AccountingManualData;
  lastUpdatedAt: string | null;
}> {
  const record = await (prisma as any).accountingDay.findUnique({
    where: {
      accountingDate: toAccountingDate(accountingDate),
    },
    select: {
      receipts: true,
      payments: true,
      dailyExpenses: true,
      encoderOverrideAllowed: true,
      updatedAt: true,
    },
  });

  const manualData = record
    ? sanitizeAccountingManualData({
        receipts: record.receipts,
        payments: record.payments,
        dailyExpenses: record.dailyExpenses,
        encoderOverrideAllowed: record.encoderOverrideAllowed,
      })
    : getDefaultAccountingManualData();

  return {
    manualData,
    lastUpdatedAt: record?.updatedAt?.toISOString() ?? null,
  };
}

function toAccountingDate(accountingDate: string) {
  return new Date(`${accountingDate}T00:00:00.000+08:00`);
}

type AccountingDaySnapshot = {
  accountingDate: string;
  receipts: unknown;
  payments: unknown;
  dailyExpenses: unknown;
  encoderOverrideAllowed: boolean;
  closingBalance: number | null;
  updatedAt: string | null;
};

function dateToYmd(value: Date) {
  return new Date(value).toISOString().slice(0, 10);
}

async function getAccountingDaySnapshot(accountingDate: string): Promise<AccountingDaySnapshot | null> {
  const record = await (prisma as any).accountingDay.findUnique({
    where: { accountingDate: toAccountingDate(accountingDate) },
    select: {
      accountingDate: true,
      receipts: true,
      payments: true,
      dailyExpenses: true,
      encoderOverrideAllowed: true,
      updatedAt: true,
    },
  });

  if (!record) return null;

  return {
    accountingDate: dateToYmd(record.accountingDate),
    receipts: record.receipts,
    payments: record.payments,
    dailyExpenses: record.dailyExpenses,
    encoderOverrideAllowed: record.encoderOverrideAllowed ?? false,
    closingBalance: extractClosingBalance(record.payments),
    updatedAt: record.updatedAt?.toISOString?.() ?? null,
  };
}

async function getPreviousSavedAccountingDay(accountingDate: string): Promise<AccountingDaySnapshot | null> {
  const record = await (prisma as any).accountingDay.findFirst({
    where: {
      accountingDate: {
        lt: toAccountingDate(accountingDate),
      },
    },
    orderBy: {
      accountingDate: "desc",
    },
    select: {
      accountingDate: true,
      receipts: true,
      payments: true,
      dailyExpenses: true,
      encoderOverrideAllowed: true,
      updatedAt: true,
    },
  });

  if (!record) return null;

  return {
    accountingDate: dateToYmd(record.accountingDate),
    receipts: record.receipts,
    payments: record.payments,
    dailyExpenses: record.dailyExpenses,
    encoderOverrideAllowed: record.encoderOverrideAllowed ?? false,
    closingBalance: extractClosingBalance(record.payments),
    updatedAt: record.updatedAt?.toISOString?.() ?? null,
  };
}

async function getStoredOrComputedClosingBalance(accountingDate: string): Promise<number | null> {
  const target = await getAccountingDaySnapshot(accountingDate);
  if (!target) return null;
  if (target.closingBalance != null) return target.closingBalance;

  const toCompute: AccountingDaySnapshot[] = [target];
  let baseClosingBalance: number | null = null;

  while (true) {
    const cursor = toCompute[toCompute.length - 1];
    const prev = await getPreviousSavedAccountingDay(cursor.accountingDate);
    if (!prev) {
      baseClosingBalance = null;
      break;
    }
    if (prev.closingBalance != null) {
      baseClosingBalance = prev.closingBalance;
      break;
    }
    toCompute.push(prev);
  }

  let previousClosing = baseClosingBalance;
  for (let i = toCompute.length - 1; i >= 0; i -= 1) {
    const snapshot = toCompute[i];
    const computedTotals = await getAccountingComputedTotals(snapshot.accountingDate);
    const manualData = sanitizeAccountingManualData({
      receipts: snapshot.receipts as any,
      payments: snapshot.payments as any,
      dailyExpenses: snapshot.dailyExpenses as any,
      encoderOverrideAllowed: snapshot.encoderOverrideAllowed,
    });
    const openingBalance =
      manualData.openingBalanceOverride ?? (previousClosing ?? computedTotals.cashOnHand);
    const resolvedComputedTotals = {
      ...computedTotals,
      loanRelease: manualData.loanReleaseOverride ?? computedTotals.loanRelease,
    };
    const view = buildAccountingView(manualData, resolvedComputedTotals, openingBalance);
    previousClosing = view.closingBalance;
  }

  return previousClosing;
}

export async function getBaseOpeningBalance(
  accountingDate: string,
  computedTotals: AccountingComputedTotals,
): Promise<number> {
  const previousSavedDay = await getPreviousSavedAccountingDay(accountingDate);
  if (!previousSavedDay) return computedTotals.cashOnHand;

  const previousClosing =
    previousSavedDay.closingBalance ??
    (await getStoredOrComputedClosingBalance(previousSavedDay.accountingDate));

  return previousClosing ?? computedTotals.cashOnHand;
}

export async function getAccountingComputedTotals(accountingDate: string): Promise<AccountingComputedTotals> {
  const range = getManilaDateRange(accountingDate, accountingDate);

  const [
    loanCollectionAgg,
    loanReleaseAgg,
    loanInsuranceAgg,
    processingFeeAgg,
    passbookAgg,
    membershipFeeAgg,
    savingsAgg,
    fullRepaymentCount,
    fullRepaymentAmountAgg,
  ] = await Promise.all([
    prisma.balanceAdjustment.aggregate({
      where: {
        type: BalanceUpdateType.DEDUCT,
        createdAt: { gte: range.from, lte: range.to },
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
      _sum: { amount: true },
    }),
    (prisma as any).activeRelease.aggregate({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
      _sum: { amount: true },
    }),
    (prisma as any).loanInsurance.aggregate({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
      _sum: { amount: true },
    }),
    (prisma as any).processingFee.aggregate({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
      _sum: { amount: true },
    }),
    (prisma as any).passbookFee.aggregate({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
      _sum: { amount: true },
    }),
    (prisma as any).membershipFee.aggregate({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
      _sum: { amount: true },
    }),
    prisma.savingsAdjustment.aggregate({
      where: {
        type: SavingsUpdateType.INCREASE,
        createdAt: { gte: range.from, lte: range.to },
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
      _sum: { amount: true },
    }),
    prisma.balanceAdjustment.count({
      where: {
        type: BalanceUpdateType.DEDUCT,
        createdAt: { gte: range.from, lte: range.to },
        balanceAfter: new Prisma.Decimal(0),
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
    }),
    prisma.balanceAdjustment.aggregate({
      where: {
        type: BalanceUpdateType.DEDUCT,
        createdAt: { gte: range.from, lte: range.to },
        balanceAfter: new Prisma.Decimal(0),
        member: {
          status: MemberStatus.ACTIVE,
        },
      },
      _sum: { amount: true },
    }),
  ]);

  const loanCollection = Number(loanCollectionAgg._sum.amount ?? 0);
  const loanRelease = Number(loanReleaseAgg._sum.amount ?? 0);
  const loanInsurance = Number(loanInsuranceAgg._sum.amount ?? 0);
  const processingFee = Number(processingFeeAgg._sum.amount ?? 0);
  const passbook = Number(passbookAgg._sum.amount ?? 0);
  const membershipFee = Number(membershipFeeAgg._sum.amount ?? 0);
  const savings = Number(savingsAgg._sum.amount ?? 0);
  const totalCollection =
    loanCollection + loanInsurance + processingFee + passbook + membershipFee + savings;
  const fullRepaymentAmount = Number(fullRepaymentAmountAgg._sum.amount ?? 0);
  const cashOnHand = totalCollection - fullRepaymentAmount;

  return {
    cashOnHand: roundWhole(cashOnHand),
    loanCollection: roundWhole(loanCollection),
    loanRelease: roundWhole(loanRelease),
    loanInsurance: roundWhole(loanInsurance),
    processingFee: roundWhole(processingFee),
    passbook: roundWhole(passbook),
    membershipFee: roundWhole(membershipFee),
    savings: roundWhole(savings),
    totalCollection: roundWhole(totalCollection),
    fullRepaymentCount,
    fullRepaymentAmount: roundWhole(fullRepaymentAmount),
  };
}

async function getOffsetAmountForDate(accountingDate: string): Promise<number> {
  const range = getManilaDateRange(accountingDate, accountingDate);

  const rows = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(sa."amount"), 0)::float8 AS "total"
    FROM "savings_adjustments" sa
    WHERE sa."type" = 'WITHDRAW'
      AND sa."createdAt" >= ${range.from}
      AND sa."createdAt" <= ${range.to}
      AND EXISTS (
        SELECT 1
        FROM "member_notes" mn
        WHERE mn."memberId" = sa."memberId"
          AND UPPER(TRIM(mn."content")) = 'OFFSET'
          AND (mn."createdAt" AT TIME ZONE 'Asia/Manila')::date = (sa."createdAt" AT TIME ZONE 'Asia/Manila')::date
      )
  `;

  return Number(rows?.[0]?.total ?? 0);
}

export async function getAccountingReportData(accountingDate: string): Promise<AccountingReportData> {
  const [{ manualData, lastUpdatedAt }, computedTotals, offsetAmount] = await Promise.all([
    getAccountingManualDataForDate(accountingDate),
    getAccountingComputedTotals(accountingDate),
    getOffsetAmountForDate(accountingDate),
  ]);

  const resolvedManualData =
    !lastUpdatedAt && Number(manualData.dailyExpenses.offset || 0) === 0 && offsetAmount > 0
      ? {
          ...manualData,
          dailyExpenses: {
            ...manualData.dailyExpenses,
            offset: offsetAmount,
          },
        }
      : manualData;

  const baseOpeningBalance = await getBaseOpeningBalance(accountingDate, computedTotals);
  const resolvedOpeningBalance = resolvedManualData.openingBalanceOverride ?? baseOpeningBalance;
  const resolvedComputedTotals = {
    ...computedTotals,
    loanRelease: resolvedManualData.loanReleaseOverride ?? computedTotals.loanRelease,
  };

  return {
    accountingDate,
    manualData: resolvedManualData,
    computedTotals: resolvedComputedTotals,
    view: buildAccountingView(resolvedManualData, resolvedComputedTotals, resolvedOpeningBalance),
    lastUpdatedAt,
  };
}
