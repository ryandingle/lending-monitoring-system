"use client";

import { useEffect, useMemo, useState } from "react";
import { IconEye, IconFileText, IconX } from "../_components/icons";
import { Role } from "@prisma/client";
import {
  buildAccountingView,
  DAILY_EXPENSE_FIELDS,
  PAYMENT_MANUAL_FIELDS,
  type AccountingComputedTotals,
  type AccountingManualData,
} from "@/lib/accounting";
import { showAppToast } from "../_components/app-toast";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not yet saved";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function NumberInput({
  value,
  onChange,
  readOnly = false,
}: {
  value: number;
  onChange?: (next: number) => void;
  readOnly?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      readOnly={readOnly}
      value={value === 0 ? "" : value}
      onChange={(e) => onChange?.(Number(e.target.value) || 0)}
      className={
        readOnly
          ? "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-medium text-slate-700"
          : "w-full rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-right text-sm font-medium text-slate-900 focus:border-amber-500 focus:outline-none"
      }
    />
  );
}

function SectionCard({
  title,
  description,
  rows,
  totalLabel,
  totalValue,
}: {
  title: string;
  description: string;
  rows: Array<{
    key: string;
    label: string;
    value: number;
    editable?: boolean;
    onChange?: (next: number) => void;
  }>;
  totalLabel: string;
  totalValue: number;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="space-y-3 p-5">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_180px] items-center gap-3">
            <div className="text-sm font-medium text-slate-700">{row.label}</div>
            <NumberInput value={row.value} onChange={row.onChange} readOnly={!row.editable} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_180px] items-center gap-3 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-4">
        <div className="text-sm font-semibold uppercase tracking-wide text-slate-700">{totalLabel}</div>
        <div className="text-right text-base font-semibold text-slate-900">{formatMoney(totalValue)}</div>
      </div>
    </section>
  );
}

export function AccountingClient({
  selectedDate,
  maxDate,
  userRole,
  initialManualData,
  computedTotals,
  initialOpeningBalance,
  lastUpdatedAt,
}: {
  selectedDate: string;
  maxDate: string;
  userRole: Role | "COLLECTOR";
  initialManualData: AccountingManualData;
  computedTotals: AccountingComputedTotals;
  initialOpeningBalance: number;
  lastUpdatedAt: string | null;
}) {
  const [currentDate, setCurrentDate] = useState(selectedDate);
  const [manualData, setManualData] = useState(initialManualData);
  const [currentComputedTotals, setCurrentComputedTotals] = useState(computedTotals);
  const [openingBalance, setOpeningBalance] = useState(initialOpeningBalance);
  const [currentLastUpdatedAt, setCurrentLastUpdatedAt] = useState(lastUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [loadingDate, setLoadingDate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isOverrideMode, setIsOverrideMode] = useState(false);

  useEffect(() => {
    setCurrentDate(selectedDate);
    setManualData(initialManualData);
    setCurrentComputedTotals(computedTotals);
    setOpeningBalance(initialOpeningBalance);
    setCurrentLastUpdatedAt(lastUpdatedAt);
    setIsOverrideMode(false);
  }, [selectedDate, initialManualData, computedTotals, initialOpeningBalance, lastUpdatedAt]);

  const isSavedDay = Boolean(currentLastUpdatedAt);
  const isSuperAdmin = userRole === Role.SUPER_ADMIN;
  const canOverride = isSavedDay && isSuperAdmin;
  const canEditManualInputs = !isSavedDay || (isSuperAdmin && isOverrideMode);

  const view = useMemo(
    () => buildAccountingView(manualData, currentComputedTotals, openingBalance),
    [manualData, currentComputedTotals, openingBalance],
  );

  const updateValue = (
    section: keyof AccountingManualData,
    key: string,
    value: number,
  ) => {
    setManualData((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value,
      },
    }));
  };

  const handleDateChange = async (nextDate: string) => {
    if (!nextDate) return;
    const safeDate = nextDate > maxDate ? maxDate : nextDate;
    setLoadingDate(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/accounting?date=${encodeURIComponent(safeDate)}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to load accounting data");
      }

      const reportData = result.reportData as {
        manualData: AccountingManualData;
        computedTotals: AccountingComputedTotals;
        view: { openingBalance: number };
        lastUpdatedAt: string | null;
      };

      setCurrentDate(safeDate);
      setManualData(reportData.manualData);
      setCurrentComputedTotals(reportData.computedTotals);
      setOpeningBalance(reportData.view.openingBalance);
      setCurrentLastUpdatedAt(reportData.lastUpdatedAt);
      setIsOverrideMode(false);

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("date", safeDate);
        window.history.replaceState({}, "", url.toString());
      }
    } catch (err: any) {
      setError(err.message || "Failed to load accounting data");
      showAppToast("error", err.message || "Failed to load accounting data");
    } finally {
      setLoadingDate(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/accounting", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountingDate: currentDate,
          receipts: manualData.receipts,
          payments: manualData.payments,
          dailyExpenses: manualData.dailyExpenses,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save accounting data");
      }

      setCurrentLastUpdatedAt(result.data?.lastUpdatedAt ?? new Date().toISOString());
      setMessage(`Saved accounting data for ${currentDate}.`);
      setIsOverrideMode(false);
      showAppToast("success", `Saved accounting data for ${currentDate}.`);
    } catch (err: any) {
      setError(err.message || "Failed to save accounting data");
      showAppToast("error", err.message || "Failed to save accounting data");
    } finally {
      setSaving(false);
    }
  };

  const basePdfUrl = `/api/accounting/export?date=${encodeURIComponent(currentDate)}`;

  const handlePreview = () => {
    setPreviewUrl(`${basePdfUrl}&preview=true`);
  };

  const closePreview = () => {
    setPreviewUrl(null);
  };

  const receiptsRows = [
    {
      key: "openingBalance",
      label: "Opening Balance",
      value: view.openingBalance,
    },
    { key: "loanCollection", label: "Loan Col. (Current)", value: currentComputedTotals.loanCollection },
    { key: "savings", label: "Savings", value: currentComputedTotals.savings },
    { key: "passbook", label: "Passbook", value: currentComputedTotals.passbook },
    { key: "membershipFee", label: "Mem Fee", value: currentComputedTotals.membershipFee },
    {
      key: "cashAdvance",
      label: "CASH ADVANCE",
      value: manualData.receipts.cashAdvance,
      editable: canEditManualInputs,
      onChange: (next: number) => updateValue("receipts", "cashAdvance", next),
    },
    { key: "loanInsurance", label: "Loan Insurance", value: currentComputedTotals.loanInsurance },
    {
      key: "ftIn",
      label: "FT(IN)",
      value: manualData.receipts.ftIn,
      editable: canEditManualInputs,
      onChange: (next: number) => updateValue("receipts", "ftIn", next),
    },
    {
      key: "bankWithdrawal1",
      label: "Bank wdl.-DFOB1",
      value: manualData.receipts.bankWithdrawal1,
      editable: canEditManualInputs,
      onChange: (next: number) => updateValue("receipts", "bankWithdrawal1", next),
    },
    {
      key: "bankWithdrawal2",
      label: "Bank wdl.-DFOB2",
      value: manualData.receipts.bankWithdrawal2,
      editable: canEditManualInputs,
      onChange: (next: number) => updateValue("receipts", "bankWithdrawal2", next),
    },
  ];

  const paymentsRows = [
    {
      key: "loanRelease",
      label: "Loan Release",
      value: currentComputedTotals.loanRelease,
    },
    { key: "managementExpense", label: "Mgmt. Exp.", value: view.dailyExpensesTotal },
    {
      key: "otherPay",
      label: "Other Pay",
      value: manualData.payments.otherPay,
      editable: canEditManualInputs,
      onChange: (next: number) => updateValue("payments", "otherPay", next),
    },
    {
      key: "ftOut",
      label: "FT(OUT)",
      value: manualData.payments.ftOut,
      editable: canEditManualInputs,
      onChange: (next: number) => updateValue("payments", "ftOut", next),
    },
    ...PAYMENT_MANUAL_FIELDS.filter((field) => field.key.startsWith("bankDeposit")).map((field) => ({
      key: field.key,
      label: field.label,
      value: manualData.payments[field.key],
      editable: canEditManualInputs,
      onChange: (next: number) => updateValue("payments", field.key, next),
    })),
    ...PAYMENT_MANUAL_FIELDS.filter((field) => field.key.startsWith("bankTransaction")).map((field) => ({
      key: field.key,
      label: field.label,
      value: manualData.payments[field.key],
      editable: canEditManualInputs,
      onChange: (next: number) => updateValue("payments", field.key, next),
    })),
    { key: "bankDepositTotal", label: "Bank Deposit Total", value: view.bankDepositTotal },
    { key: "closingBalance", label: "Closing Balance", value: view.closingBalance },
  ];

  const dailyExpenseRows = DAILY_EXPENSE_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    value: manualData.dailyExpenses[field.key],
    editable: canEditManualInputs,
    onChange: (next: number) => updateValue("dailyExpenses", field.key, next),
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Accounting</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manual inputs are saved per day. Gray fields are calculated from the selected
              date&apos;s collector totals.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="text-sm font-medium text-slate-700">Accounting Date</label>
              <input
                type="date"
                value={currentDate}
                onChange={(e) => void handleDateChange(e.target.value)}
                max={maxDate}
                disabled={loadingDate || saving}
                className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={loadingDate}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconEye className="h-4 w-4" />
              Preview Print
            </button>
            <a
              href={basePdfUrl}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <IconFileText className="h-4 w-4" />
              Download PDF
            </a>
            {canOverride ? (
              <button
                type="button"
                onClick={() => {
                  setIsOverrideMode((current) => !current);
                  setMessage(null);
                  setError(null);
                }}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                {isOverrideMode ? "Cancel Override" : "Enable Override"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loadingDate || !canEditManualInputs}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : loadingDate ? "Loading..." : canEditManualInputs ? "Save Daily Inputs" : "Inputs Locked"}
            </button>
          </div>
        </div>
        {isSavedDay ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {isSuperAdmin
              ? isOverrideMode
                ? "Override mode is enabled. You can now adjust the saved manual inputs."
                : "This accounting day is already saved. Manual inputs are locked until a super admin enables override."
              : "This accounting day is already saved. Manual inputs are locked and only a super admin can override them."}
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total Collection
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {formatMoney(currentComputedTotals.totalCollection)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Full Repayment Count
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {currentComputedTotals.fullRepaymentCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Full Repayment Amount
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {formatMoney(currentComputedTotals.fullRepaymentAmount)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Last Saved
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {formatDateTime(currentLastUpdatedAt)}
            </div>
          </div>
        </div>
        {message ? <p className="mt-4 text-sm text-emerald-600">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Receipts"
          description="Combines manual entries and the selected date's collection totals."
          rows={receiptsRows}
          totalLabel="Total Receipts"
          totalValue={view.receiptsTotal}
        />
        <SectionCard
          title="Payments"
          description="Management expense follows the Daily Expenses total."
          rows={paymentsRows}
          totalLabel="Total Payments"
          totalValue={view.totalPayments}
        />
        <SectionCard
          title="Daily Expenses"
          description="Manual daily expenses saved for the selected accounting date."
          rows={dailyExpenseRows}
          totalLabel="Total Daily Expenses"
          totalValue={view.dailyExpensesTotal}
        />
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Accounting Print Preview</h3>
                <p className="text-sm text-slate-500">{selectedDate}</p>
              </div>
              <button
                onClick={closePreview}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <IconX className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-4">
              <iframe
                src={previewUrl}
                className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm"
                title="Accounting Print Preview"
              />
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                onClick={closePreview}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
              <a
                href={basePdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-700"
              >
                <IconFileText className="h-4 w-4" />
                Download PDF
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
