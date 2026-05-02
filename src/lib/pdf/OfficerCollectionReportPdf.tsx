import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image as PdfImage,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 4,
    paddingLeft: 50,
    paddingRight: -20,
    fontSize: 7,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 14,
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
  logoPlaceholder: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  companyName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  titleBlock: {
    marginTop: 2,
  },
  title: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  subtitle: {
    fontSize: 9,
    marginTop: 2,
  },
  tableContainer: {
    width: "100%",
    alignItems: "center",
  },
  table: {
    width: "92%",
    borderWidth: 1,
    borderColor: "#000",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    minHeight: 14,
    alignItems: "center",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    backgroundColor: "#f0f0f0",
    minHeight: 16,
    alignItems: "center",
  },
  cell: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRightWidth: 1,
    borderRightColor: "#000",
    fontSize: 8,
  },
  cellTextRight: {
    textAlign: "right",
  },
  cellTextCenter: {
    textAlign: "center",
  },
  footerRow: {
    flexDirection: "row",
    marginTop: 4,
    justifyContent: "flex-end",
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
});

export interface OfficerGroupRow {
  groupName: string;
  loanCollection: number;
  savings: number;
  processingFee: number;
  loanInsurance: number;
  passbookFee: number;
  totalCollection: number;
  fullRepaymentCount: number;
  fullRepaymentAmount: number;
  offsetCount: number;
  offsetAmount: number;
}

export interface OfficerReportData {
  officerId: string;
  officerName: string;
  dateLabel: string;
  groups: OfficerGroupRow[];
  totals: {
    loanCollection: number;
    savings: number;
    processingFee: number;
    loanInsurance: number;
    passbookFee: number;
    totalCollection: number;
    fullRepaymentCount: number;
    fullRepaymentAmount: number;
    offsetCount: number;
    offsetAmount: number;
  };
  companyName?: string;
  logoUrl?: any;
}

const formatMoney = (value: number) => {
  if (!value) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const OfficerCollectionReportPdf = ({ data }: { data: OfficerReportData }) => {
  const companyName = data.companyName ?? process.env.LMS_COMPANY_NAME ?? "Triple E Microfinance";
  const cof = (data.totals?.totalCollection ?? 0) - (data.totals?.fullRepaymentAmount ?? 0);
  const widths = {
    no: "5%",
    group: "18%",
    loan: "11%",
    savings: "10%",
    fee: "8%",
    total: "11%",
    fullNo: "6%",
    fullAmount: "8%",
    offsetNo: "5%",
    offsetAmount: "10%",
  } as const;
  const totalsLabelWidth = "54%";
  const totalsValueWidth = "46%";

  return (
    <Document>
      <Page size="LEGAL" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            {data.logoUrl ? (
              <PdfImage src={data.logoUrl} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text>LOGO</Text>
              </View>
            )}
            <Text style={styles.companyName}>{companyName}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Daily Collection Sheet</Text>
            <Text style={styles.subtitle}>
              Collection Officer: {data.officerName} | Date: {data.dateLabel}
            </Text>
          </View>
        </View>

        <View style={styles.tableContainer}>
          <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <View style={[styles.cell, { width: widths.no }]}>
              <Text style={styles.bold}>No.</Text>
            </View>
            <View style={[styles.cell, { width: widths.group }]}>
              <Text style={styles.bold}>Group Name</Text>
            </View>
            <View style={[styles.cell, { width: widths.loan }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Loan Collection (Current)</Text>
            </View>
            <View style={[styles.cell, { width: widths.savings }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Savings</Text>
            </View>
            <View style={[styles.cell, { width: widths.fee }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>PF</Text>
            </View>
            <View style={[styles.cell, { width: widths.fee }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>LI</Text>
            </View>
            <View style={[styles.cell, { width: widths.fee }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>PB</Text>
            </View>
            <View style={[styles.cell, { width: widths.total }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Total Collection</Text>
            </View>
            <View style={[styles.cell, { width: widths.fullNo }]}>
              <Text style={[styles.bold, styles.cellTextCenter]}>Full Repay No.</Text>
            </View>
            <View style={[styles.cell, { width: widths.fullAmount }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Full Repay Amount</Text>
            </View>
            <View style={[styles.cell, { width: widths.offsetNo }]}>
              <Text style={[styles.bold, styles.cellTextCenter]}>Offset No.</Text>
            </View>
            <View style={[styles.cell, { width: widths.offsetAmount, borderRightWidth: 0 }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Offset Amount</Text>
            </View>
          </View>

          {data.groups.map((row, index) => (
            <View key={row.groupName + index} style={styles.tableRow}>
              <View style={[styles.cell, { width: widths.no }]}>
                <Text style={styles.cellTextCenter}>{index + 1}</Text>
              </View>
              <View style={[styles.cell, { width: widths.group }]}>
                <Text>{row.groupName}</Text>
              </View>
              <View style={[styles.cell, { width: widths.loan }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.loanCollection)}</Text>
              </View>
              <View style={[styles.cell, { width: widths.savings }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.savings)}</Text>
              </View>
              <View style={[styles.cell, { width: widths.fee }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.processingFee)}</Text>
              </View>
              <View style={[styles.cell, { width: widths.fee }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.loanInsurance)}</Text>
              </View>
              <View style={[styles.cell, { width: widths.fee }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.passbookFee)}</Text>
              </View>
              <View style={[styles.cell, { width: widths.total }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.totalCollection)}</Text>
              </View>
              <View style={[styles.cell, { width: widths.fullNo }]}>
                <Text style={styles.cellTextCenter}>
                  {row.fullRepaymentCount ? String(row.fullRepaymentCount) : ""}
                </Text>
              </View>
              <View style={[styles.cell, { width: widths.fullAmount }]}>
                <Text style={styles.cellTextRight}>
                  {formatMoney(row.fullRepaymentAmount)}
                </Text>
              </View>
              <View style={[styles.cell, { width: widths.offsetNo }]}>
                <Text style={styles.cellTextCenter}>
                  {row.offsetCount ? String(row.offsetCount) : ""}
                </Text>
              </View>
              <View style={[styles.cell, { width: widths.offsetAmount, borderRightWidth: 0 }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.offsetAmount)}</Text>
              </View>
            </View>
          ))}

          <View style={styles.tableRow}>
            <View style={[styles.cell, { width: widths.no + "" }]} />
            <View style={[styles.cell, { width: widths.group }]}>
              <Text style={styles.bold}>Total</Text>
            </View>
            <View style={[styles.cell, { width: widths.loan }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.loanCollection)}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.savings }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.savings)}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.fee }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.processingFee)}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.fee }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.loanInsurance)}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.fee }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.passbookFee)}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.total }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.totalCollection)}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.fullNo }]}>
              <Text style={[styles.bold, styles.cellTextCenter]}>
                {data.totals.fullRepaymentCount
                  ? String(data.totals.fullRepaymentCount)
                  : ""}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.fullAmount }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.fullRepaymentAmount)}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.offsetNo }]}>
              <Text style={[styles.bold, styles.cellTextCenter]}>
                {data.totals.offsetCount ? String(data.totals.offsetCount) : ""}
              </Text>
            </View>
            <View style={[styles.cell, { width: widths.offsetAmount, borderRightWidth: 0 }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.offsetAmount)}
              </Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cell, { width: totalsLabelWidth }]}>
              <Text style={styles.bold}>Cash On Hand</Text>
            </View>
            <View style={[styles.cell, { width: totalsValueWidth , borderRightWidth: 0}]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(cof)}
              </Text>
            </View>
          </View>
          <View style={styles.footerRow}>
            <Text style={{ fontSize: 8 }}>Generated Triple E Monitoring System</Text>
          </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};
