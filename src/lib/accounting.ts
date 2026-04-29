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
  receipts: AccountingManualSection;
  payments: AccountingManualSection;
  dailyExpenses: AccountingManualSection;
};

export type AccountingComputedTotals = {
  cashOnHand: number;
  loanCollection: number;
  loanRelease: number;
  loanInsurance: number;
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

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function toOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function createEmptySection(keys: readonly { key: string }[]) {
  return Object.fromEntries(keys.map(({ key }) => [key, 0])) as AccountingManualSection;
}

export function getDefaultAccountingManualData(): AccountingManualData {
  return {
    openingBalanceOverride: null,
    loanReleaseOverride: null,
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
      keys.map(({ key }) => [key, toNumber(source?.[key])]),
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
    manualData.openingBalanceOverride == null
      ? { ...manualData.receipts }
      : {
          ...manualData.receipts,
          [OPENING_BALANCE_OVERRIDE_KEY]: manualData.openingBalanceOverride,
        };
  const payments =
    manualData.loanReleaseOverride == null
      ? { ...manualData.payments }
      : {
          ...manualData.payments,
          [LOAN_RELEASE_OVERRIDE_KEY]: manualData.loanReleaseOverride,
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

export function buildAccountingView(
  manual: AccountingManualData,
  computed: AccountingComputedTotals,
  openingBalance = computed.cashOnHand,
): AccountingView {
  const bankDepositTotal = PAYMENT_MANUAL_FIELDS.filter((field) =>
    field.key.startsWith("bankDeposit"),
  ).reduce((sum, field) => sum + toNumber(manual.payments[field.key]), 0);

  const dailyExpensesTotal = sumSection(manual.dailyExpenses, DAILY_EXPENSE_FIELDS);
  const manualReceiptInflows =
    toNumber(manual.receipts.cashAdvance) +
    toNumber(manual.receipts.ftIn) +
    toNumber(manual.receipts.bankWithdrawal1) +
    toNumber(manual.receipts.bankWithdrawal2);
  const receiptsTotal =
    openingBalance +
    computed.loanCollection +
    computed.savings +
    computed.passbook +
    computed.membershipFee +
    computed.loanInsurance +
    manualReceiptInflows;

  const paymentBaseTotal =
    computed.loanRelease +
    dailyExpensesTotal +
    toNumber(manual.payments.otherPay) +
    toNumber(manual.payments.ftOut) +
    bankDepositTotal;

  const closingBalance = receiptsTotal - paymentBaseTotal;
  const totalPayments = paymentBaseTotal + closingBalance;

  return {
    openingBalance,
    receiptsTotal,
    dailyExpensesTotal,
    bankDepositTotal,
    paymentBaseTotal,
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
      updatedAt: true,
    },
  });

  const manualData = record
    ? sanitizeAccountingManualData({
        receipts: record.receipts,
        payments: record.payments,
        dailyExpenses: record.dailyExpenses,
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

async function getPreviousAccountingDate(accountingDate: string): Promise<string | null> {
  const previousRecord = await (prisma as any).accountingDay.findFirst({
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
    },
  });

  return previousRecord?.accountingDate
    ? new Date(previousRecord.accountingDate).toISOString().slice(0, 10)
    : null;
}

export async function getAccountingComputedTotals(accountingDate: string): Promise<AccountingComputedTotals> {
  const range = getManilaDateRange(accountingDate, accountingDate);

  const [
    loanCollectionAgg,
    loanReleaseAgg,
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
        releaseDate: { gte: range.from, lte: range.to },
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
  const loanInsurance = 0;
  const passbook = Number(passbookAgg._sum.amount ?? 0);
  const membershipFee = Number(membershipFeeAgg._sum.amount ?? 0);
  const savings = Number(savingsAgg._sum.amount ?? 0);
  const totalCollection =
    loanCollection + loanInsurance + passbook + membershipFee + savings;
  const cashOnHand = totalCollection - Number(fullRepaymentAmountAgg._sum.amount ?? 0);

  return {
    cashOnHand,
    loanCollection,
    loanRelease,
    loanInsurance,
    passbook,
    membershipFee,
    savings,
    totalCollection,
    fullRepaymentCount,
    fullRepaymentAmount: Number(fullRepaymentAmountAgg._sum.amount ?? 0),
  };
}

async function getAccountingReportDataInternal(
  accountingDate: string,
  cache: Map<string, Promise<AccountingReportData>>,
): Promise<AccountingReportData> {
  const cached = cache.get(accountingDate);
  if (cached) return cached;

  const reportPromise = (async () => {
    const [{ manualData, lastUpdatedAt }, computedTotals, previousAccountingDate] = await Promise.all([
      getAccountingManualDataForDate(accountingDate),
      getAccountingComputedTotals(accountingDate),
      getPreviousAccountingDate(accountingDate),
    ]);

    const openingBalance = previousAccountingDate
      ? (await getAccountingReportDataInternal(previousAccountingDate, cache)).view.closingBalance
      : computedTotals.cashOnHand;
    const resolvedOpeningBalance = manualData.openingBalanceOverride ?? openingBalance;
    const resolvedComputedTotals = {
      ...computedTotals,
      loanRelease: manualData.loanReleaseOverride ?? computedTotals.loanRelease,
    };

    return {
      accountingDate,
      manualData,
      computedTotals: resolvedComputedTotals,
      view: buildAccountingView(manualData, resolvedComputedTotals, resolvedOpeningBalance),
      lastUpdatedAt,
    };
  })();

  cache.set(accountingDate, reportPromise);
  return reportPromise;
}

export async function getAccountingReportData(accountingDate: string): Promise<AccountingReportData> {
  return getAccountingReportDataInternal(accountingDate, new Map());
}
