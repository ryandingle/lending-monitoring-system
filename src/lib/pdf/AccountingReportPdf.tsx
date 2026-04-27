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
    paddingTop: 32,
    paddingBottom: 4,
    paddingLeft: 50,
    paddingRight: -20,
    fontSize: 7,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 10,
    textAlign: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 2,
  },
  logo: {
    width: 32,
    height: 32,
    objectFit: "contain",
  },
  companyName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  title: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  subtitle: {
    marginTop: 1,
    fontSize: 7,
  },
  contentWidth: {
    width: "92%",
    alignSelf: "center",
  },
  summaryBox: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#0f172a",
    borderRadius: 6,
    overflow: "hidden",
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: "#e2e8f0",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  summaryTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  legendChip: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: "#d97706",
    backgroundColor: "#fef08a",
    borderRadius: 999,
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: "#92400e",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#ffffff",
  },
  summaryItem: {
    width: "33.3333%",
    borderRightWidth: 1,
    borderRightColor: "#cbd5e1",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  summaryItemLabel: {
    fontSize: 6,
    color: "#475569",
    marginBottom: 2,
  },
  summaryItemValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  sectionsRow: {
    flexDirection: "row",
    gap: 6,
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
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: "#e2e8f0",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  sectionDescription: {
    fontSize: 5,
    color: "#334155",
    marginTop: 1,
  },
  row: {
    flexDirection: "row",
    minHeight: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  rowLabel: {
    width: "64%",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRightWidth: 1,
    borderRightColor: "#cbd5e1",
  },
  rowValue: {
    width: "36%",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: "right",
  },
  rowValueManual: {
    width: "36%",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: "right",
    backgroundColor: "#fef08a",
    color: "#92400e",
    fontFamily: "Helvetica-Bold",
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
  },
  totalLabel: {
    width: "64%",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: "#94a3b8",
    fontFamily: "Helvetica-Bold",
  },
  totalValue: {
    width: "36%",
    paddingHorizontal: 6,
    paddingVertical: 4,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    width: "92%",
    alignSelf: "center",
    marginTop: 4,
    gap: 4,
  },
  signatoriesTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#334155",
  },
  signatoriesRow: {
    flexDirection: "row",
    gap: 8,
  },
  signatoryBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 28,
  },
  signatoryLine: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
    marginBottom: 4,
  },
  signatoryLabel: {
    fontSize: 6,
    color: "#475569",
    textAlign: "center",
  },
  generatedText: {
    textAlign: "right",
    fontSize: 6,
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
  rows: Array<{ key: string; label: string; value: number; manual?: boolean }>,
  totalLabel: string,
  totalValue: number,
) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
      </View>
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={row.manual ? styles.rowValueManual : styles.rowValue}>
            {formatMoney(row.value)}
          </Text>
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
    {
      key: "openingBalance",
      label: "Opening Balance",
      value: data.view.openingBalance,
      manual: data.manualData.openingBalanceOverride != null,
    },
    { key: "loanCollection", label: "Loan Col. (Current)", value: data.computedTotals.loanCollection },
    { key: "savings", label: "Savings", value: data.computedTotals.savings },
    { key: "passbook", label: "Passbook", value: data.computedTotals.passbook },
    { key: "membershipFee", label: "Mem Fee", value: data.computedTotals.membershipFee },
    { key: "cashAdvance", label: "CASH ADVANCE", value: data.manualData.receipts.cashAdvance, manual: true },
    { key: "loanInsurance", label: "Loan Insurance", value: data.computedTotals.loanInsurance },
    { key: "ftIn", label: "FT(IN)", value: data.manualData.receipts.ftIn, manual: true },
    { key: "bankWithdrawal1", label: "Bank wdl.-DFOB1", value: data.manualData.receipts.bankWithdrawal1, manual: true },
    { key: "bankWithdrawal2", label: "Bank wdl.-DFOB2", value: data.manualData.receipts.bankWithdrawal2, manual: true },
  ];

  const paymentRows = [
    { key: "loanRelease", label: "Loan Release", value: data.computedTotals.loanRelease },
    { key: "managementExpense", label: "Mgmt. Exp.", value: data.view.dailyExpensesTotal },
    { key: "otherPay", label: "Other Pay", value: data.manualData.payments.otherPay, manual: true },
    { key: "ftOut", label: "FT(OUT)", value: data.manualData.payments.ftOut, manual: true },
    ...PAYMENT_MANUAL_FIELDS.filter((field) => field.key.startsWith("bankDeposit")).map((field) => ({
      key: field.key,
      label: field.label,
      value: data.manualData.payments[field.key],
      manual: true,
    })),
    ...PAYMENT_MANUAL_FIELDS.filter((field) => field.key.startsWith("bankTransaction")).map((field) => ({
      key: field.key,
      label: field.label,
      value: data.manualData.payments[field.key],
      manual: true,
    })),
    { key: "bankDepositTotal", label: "Bank Deposit Total", value: data.view.bankDepositTotal },
    { key: "closingBalance", label: "Closing Balance", value: data.view.closingBalance },
  ];

  const expenseRows = DAILY_EXPENSE_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    value: data.manualData.dailyExpenses[field.key],
    manual: true,
  }));

  const computedSummaryRows = [
    { key: "loanCollection", label: "Loan Collection Current", value: data.computedTotals.loanCollection },
    { key: "savings", label: "Savings", value: data.computedTotals.savings },
    { key: "passbook", label: "Passbook", value: data.computedTotals.passbook },
    { key: "membershipFee", label: "Mem Fee", value: data.computedTotals.membershipFee },
    { key: "totalCollection", label: "Total Collection", value: data.computedTotals.totalCollection },
    { key: "fullRepaymentAmount", label: "Full Repayment", value: data.computedTotals.fullRepaymentAmount },
  ];

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

        <View style={[styles.contentWidth, styles.summaryBox]} wrap={false}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Computed Totals Summary</Text>
            <Text style={styles.legendChip}>Yellow values = manual inputs</Text>
          </View>
          <View style={styles.summaryGrid}>
            {computedSummaryRows.map((row) => (
              <View key={row.key} style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>{row.label}</Text>
                <Text style={styles.summaryItemValue}>{formatMoney(row.value)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.contentWidth} wrap={false}>
          <View style={styles.sectionsRow}>
          {renderSection(
            "Receipts",
            "",
            receiptsRows,
            "Total Receipts",
            data.view.receiptsTotal,
          )}
          {renderSection(
            "Payments",
            "",
            paymentRows,
            "Total Payments",
            data.view.totalPayments,
          )}
          {renderSection(
            "Daily Expenses",
            "",
            expenseRows,
            "Total Daily Expenses",
            data.view.dailyExpensesTotal,
          )}
          </View>
        </View>

        <View style={styles.footer} wrap={false}>
          <Text style={styles.signatoriesTitle}>Signatories</Text>
          <View style={styles.signatoriesRow}>
            <View style={styles.signatoryBox}>
              <View style={styles.signatoryLine} />
              <Text style={styles.signatoryLabel}>AO Signature 1</Text>
            </View>
            <View style={styles.signatoryBox}>
              <View style={styles.signatoryLine} />
              <Text style={styles.signatoryLabel}>AO Signature 2</Text>
            </View>
            <View style={styles.signatoryBox}>
              <View style={styles.signatoryLine} />
              <Text style={styles.signatoryLabel}>AO Signature 3</Text>
            </View>
            <View style={styles.signatoryBox}>
              <View style={styles.signatoryLine} />
              <Text style={styles.signatoryLabel}>Branch Manager Signature</Text>
            </View>
          </View>
          <Text style={styles.generatedText}>Generated Triple E Monitoring System</Text>
        </View>
      </Page>
    </Document>
  );
}
