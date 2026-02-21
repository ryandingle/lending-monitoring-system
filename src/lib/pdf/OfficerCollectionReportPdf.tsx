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
  totalCollection: number;
  fullRepaymentCount: number;
  fullRepaymentAmount: number;
}

export interface OfficerReportData {
  officerName: string;
  dateLabel: string;
  groups: OfficerGroupRow[];
  totals: {
    loanCollection: number;
    savings: number;
    totalCollection: number;
    fullRepaymentCount: number;
    fullRepaymentAmount: number;
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
            <View style={[styles.cell, { width: "6%" }]}>
              <Text style={styles.bold}>No.</Text>
            </View>
            <View style={[styles.cell, { width: "28%" }]}>
              <Text style={styles.bold}>Group Name</Text>
            </View>
            <View style={[styles.cell, { width: "16%" }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Loan Collection (Current)</Text>
            </View>
            <View style={[styles.cell, { width: "16%" }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Savings</Text>
            </View>
            <View style={[styles.cell, { width: "16%" }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Total Collection</Text>
            </View>
            <View style={[styles.cell, { width: "8%" }]}>
              <Text style={[styles.bold, styles.cellTextCenter]}>Full Repay No.</Text>
            </View>
            <View style={[styles.cell, { width: "10%", borderRightWidth: 0 }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>Full Repay Amount</Text>
            </View>
          </View>

          {data.groups.map((row, index) => (
            <View key={row.groupName + index} style={styles.tableRow}>
              <View style={[styles.cell, { width: "6%" }]}>
                <Text style={styles.cellTextCenter}>{index + 1}</Text>
              </View>
              <View style={[styles.cell, { width: "28%" }]}>
                <Text>{row.groupName}</Text>
              </View>
              <View style={[styles.cell, { width: "16%" }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.loanCollection)}</Text>
              </View>
              <View style={[styles.cell, { width: "16%" }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.savings)}</Text>
              </View>
              <View style={[styles.cell, { width: "16%" }]}>
                <Text style={styles.cellTextRight}>{formatMoney(row.totalCollection)}</Text>
              </View>
              <View style={[styles.cell, { width: "8%" }]}>
                <Text style={styles.cellTextCenter}>
                  {row.fullRepaymentCount ? String(row.fullRepaymentCount) : ""}
                </Text>
              </View>
              <View style={[styles.cell, { width: "10%", borderRightWidth: 0 }]}>
                <Text style={styles.cellTextRight}>
                  {formatMoney(row.fullRepaymentAmount)}
                </Text>
              </View>
            </View>
          ))}

          <View style={styles.tableRow}>
            <View style={[styles.cell, { width: "34%" }]}>
              <Text style={styles.bold}>Total</Text>
            </View>
            <View style={[styles.cell, { width: "16%" }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.loanCollection)}
              </Text>
            </View>
            <View style={[styles.cell, { width: "16%" }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.savings)}
              </Text>
            </View>
            <View style={[styles.cell, { width: "16%" }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.totalCollection)}
              </Text>
            </View>
            <View style={[styles.cell, { width: "8%" }]}>
              <Text style={[styles.bold, styles.cellTextCenter]}>
                {data.totals.fullRepaymentCount
                  ? String(data.totals.fullRepaymentCount)
                  : ""}
              </Text>
            </View>
            <View style={[styles.cell, { width: "10%", borderRightWidth: 0 }]}>
              <Text style={[styles.bold, styles.cellTextRight]}>
                {formatMoney(data.totals.fullRepaymentAmount)}
              </Text>
            </View>
          </View>
          <View style={styles.footerRow}>
            <Text style={{ fontSize: 8 }}>Generated by Lending Monitoring System</Text>
          </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};
