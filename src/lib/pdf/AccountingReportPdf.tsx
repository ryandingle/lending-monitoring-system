import React from "react";
import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  DAILY_EXPENSE_FIELDS,
  PAYMENT_MANUAL_FIELDS,
  type AccountingReportData,
} from "@/lib/accounting";

export type AccountingPdfData = AccountingReportData & {
  companyName?: string;
  logoUrl?: any;
};

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 14,
    alignItems: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  logo: {
    width: 28,
    height: 28,
    objectFit: "contain",
  },
  companyName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 8,
  },
  cardsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    padding: 8,
    backgroundColor: "#f8fafc",
  },
  statLabel: {
    fontSize: 7,
    color: "#475569",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  sectionsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  section: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#0f172a",
    borderRadius: 6,
    overflow: "hidden",
  },
  sectionHeader: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#e2e8f0",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  sectionDescription: {
    fontSize: 7,
    color: "#334155",
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    minHeight: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  rowLabel: {
    width: "64%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRightWidth: 1,
    borderRightColor: "#cbd5e1",
  },
  rowValue: {
    width: "36%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
  },
  totalLabel: {
    width: "64%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: "#94a3b8",
    fontFamily: "Helvetica-Bold",
  },
  totalValue: {
    width: "36%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    marginTop: 12,
    textAlign: "right",
    fontSize: 7,
    color: "#475569",
  },
});

function formatMoney(value: number) {
  if (!value) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderSection(
  title: string,
  description: string,
  rows: Array<{ key: string; label: string; value: number }>,
  totalLabel: string,
  totalValue: number,
) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionDescription}>{description}</Text>
      </View>
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowValue}>{formatMoney(row.value)}</Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <Text style={styles.totalValue}>{formatMoney(totalValue)}</Text>
      </View>
    </View>
  );
}

export function AccountingReportPdf({ data }: { data: AccountingPdfData }) {
  const receiptsRows = [
    { key: "openingBalance", label: "Opening Balance", value: data.view.openingBalance },
    { key: "loanCollection", label: "Loan Col. (Current)", value: data.computedTotals.loanCollection },
    { key: "savings", label: "Savings", value: data.computedTotals.savings },
    { key: "passbook", label: "Passbook", value: data.computedTotals.passbook },
    { key: "membershipFee", label: "Mem Fee", value: data.computedTotals.membershipFee },
    { key: "cashAdvance", label: "CASH ADVANCE", value: data.manualData.receipts.cashAdvance },
    { key: "loanInsurance", label: "Loan Insurance", value: data.computedTotals.loanInsurance },
    { key: "ftIn", label: "FT(IN)", value: data.manualData.receipts.ftIn },
    { key: "bankWithdrawal1", label: "Bank wdl.-DFOB1", value: data.manualData.receipts.bankWithdrawal1 },
    { key: "bankWithdrawal2", label: "Bank wdl.-DFOB2", value: data.manualData.receipts.bankWithdrawal2 },
  ];

  const paymentRows = [
    { key: "loanRelease", label: "Loan Release", value: data.manualData.payments.loanRelease },
    { key: "managementExpense", label: "Mgmt. Exp.", value: data.view.dailyExpensesTotal },
    { key: "otherPay", label: "Other Pay", value: data.manualData.payments.otherPay },
    { key: "ftOut", label: "FT(OUT)", value: data.manualData.payments.ftOut },
    ...PAYMENT_MANUAL_FIELDS.filter((field) => field.key.startsWith("bankDeposit")).map((field) => ({
      key: field.key,
      label: field.label,
      value: data.manualData.payments[field.key],
    })),
    ...PAYMENT_MANUAL_FIELDS.filter((field) => field.key.startsWith("bankTransaction")).map((field) => ({
      key: field.key,
      label: field.label,
      value: data.manualData.payments[field.key],
    })),
    { key: "bankDepositTotal", label: "Bank Deposit Total", value: data.view.bankDepositTotal },
    { key: "closingBalance", label: "Closing Balance", value: data.view.closingBalance },
  ];

  const expenseRows = DAILY_EXPENSE_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    value: data.manualData.dailyExpenses[field.key],
  }));

  return (
    <Document>
      <Page size="LEGAL" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            {data.logoUrl ? <PdfImage src={data.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{data.companyName ?? "Triple E Microfinance"}</Text>
          </View>
          <Text style={styles.title}>Accounting Daily Summary</Text>
          <Text style={styles.subtitle}>Date: {data.accountingDate}</Text>
        </View>

        <View style={styles.cardsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Collection</Text>
            <Text style={styles.statValue}>{formatMoney(data.computedTotals.totalCollection)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Full Repayment Count</Text>
            <Text style={styles.statValue}>{String(data.computedTotals.fullRepaymentCount || 0)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Full Repayment Amount</Text>
            <Text style={styles.statValue}>{formatMoney(data.computedTotals.fullRepaymentAmount)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Last Saved</Text>
            <Text style={styles.statValue}>{data.lastUpdatedAt ? data.lastUpdatedAt.slice(0, 16).replace("T", " ") : "Not yet saved"}</Text>
          </View>
        </View>

        <View style={styles.sectionsRow}>
          {renderSection(
            "Receipts",
            "Manual entries plus selected date collection totals",
            receiptsRows,
            "Total Receipts",
            data.view.receiptsTotal,
          )}
          {renderSection(
            "Payments",
            "Mgmt. Exp. follows the Daily Expenses total",
            paymentRows,
            "Total Payments",
            data.view.totalPayments,
          )}
          {renderSection(
            "Daily Expenses",
            "Saved manual values for the selected date",
            expenseRows,
            "Total Daily Expenses",
            data.view.dailyExpensesTotal,
          )}
        </View>

        <Text style={styles.footer}>Generated Triple E Monitoring System</Text>
      </Page>
    </Document>
  );
}
