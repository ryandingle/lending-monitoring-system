import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 15,
    fontSize: 7.5, // Reduced from 9
    fontFamily: 'Helvetica',
  },
  infoSection: {
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoLabel: {
    width: 100,
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
  },
  infoValue: {
    flex: 1,
  },
  table: {
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    minHeight: 20,
    alignItems: 'center',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    height: 30,
  },
  tableCell: {
    padding: 1, // Reduced from 2
    borderRightWidth: 1,
    borderRightColor: '#000',
    textAlign: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
  },
});

interface MemberReportData {
  memberInfo: {
    name: string;
    groupName: string;
    memberSince: string;
    reportDate: string;
  };
  dayColumns: string[]; // YYYY-MM-DD
  loanBalance: number;
  payments: Record<string, number>; // date -> amount
  savings: Record<string, number>; // date -> amount
  totalPayments: number;
  totalSavings: number;
}

const formatMoney = (amount: number) => {
  if (amount === 0) return '';
  return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatDateHeader = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

export const MemberReportPdf = ({ data }: { data: MemberReportData }) => {
  const { dayColumns, memberInfo, loanBalance, payments, savings, totalPayments, totalSavings } = data;

  // Calculate column widths
  // Fixed: No (4%), Loan Balance (12%), Bal Fwd (8%), Sav Fwd (8%) -> Total 32%
  // Dynamic: 68% shared among dayColumns * 2
  const numDayCols = dayColumns.length * 2;
  const dynamicWidthPerCol = numDayCols > 0 ? (68 / numDayCols) : 0;

  const colWidths = {
    no: '4%',
    balance: '12%',
    day: `${dynamicWidthPerCol}%`,
    fwd: '8%',
  };

  // Calculate totals for columns
  const totals: Record<string, { payment: number; savings: number }> = {};
  dayColumns.forEach(day => {
    totals[day] = {
      payment: payments[day] || 0,
      savings: savings[day] || 0
    };
  });

  return (
    <Document>
      <Page size="LEGAL" orientation="landscape" style={styles.page}>
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{memberInfo.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Group</Text>
            <Text style={styles.infoValue}>{memberInfo.groupName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoValue}>{memberInfo.memberSince}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Report Date</Text>
            <Text style={styles.infoValue}>{memberInfo.reportDate}</Text>
          </View>
        </View>

        <View style={styles.table}>
          {/* Header Row 1: Date Labels */}
          <View style={[styles.tableHeaderRow, { height: 20 }]}>
            <View style={[styles.tableCell, { width: colWidths.no, borderBottomWidth: 0 }]} />
            <View style={[styles.tableCell, { width: colWidths.balance, borderBottomWidth: 0 }]} />
            
            {dayColumns.map((date) => (
              <View key={date} style={[styles.tableCell, { width: `${dynamicWidthPerCol * 2}%` }]}>
                <Text style={styles.bold}>{formatDateHeader(date)}</Text>
              </View>
            ))}

            <View style={[styles.tableCell, { width: colWidths.fwd, borderBottomWidth: 0 }]} />
            <View style={[styles.tableCell, { width: colWidths.fwd, borderRightWidth: 0, borderBottomWidth: 0 }]} />
          </View>

          {/* Header Row 2: Titles & Sub-headers */}
          <View style={[styles.tableHeaderRow, { height: 25 }]}>
            <View style={[styles.tableCell, { width: colWidths.no }]}>
              <Text style={styles.bold}>NO.</Text>
            </View>
            <View style={[styles.tableCell, { width: colWidths.balance }]}>
              <Text style={styles.bold}>LOAN BAL</Text>
            </View>

            {dayColumns.map((date) => (
              <React.Fragment key={date}>
                <View style={[styles.tableCell, { width: colWidths.day }]}>
                  <Text style={{ fontSize: 7 }}>PAY</Text>
                </View>
                <View style={[styles.tableCell, { width: colWidths.day }]}>
                  <Text style={{ fontSize: 7 }}>SAV</Text>
                </View>
              </React.Fragment>
            ))}

            <View style={[styles.tableCell, { width: colWidths.fwd }]}>
              <Text style={{ fontSize: 8, ...styles.bold }}>Bal Fwd</Text>
            </View>
            <View style={[styles.tableCell, { width: colWidths.fwd, borderRightWidth: 0 }]}>
              <Text style={{ fontSize: 8, ...styles.bold }}>Sav Fwd</Text>
            </View>
          </View>

          {/* Data Row (Single Member) */}
          <View style={styles.tableRow}>
            <View style={[styles.tableCell, { width: colWidths.no }]}>
              <Text>1</Text>
            </View>
            <View style={[styles.tableCell, { width: colWidths.balance, textAlign: 'right', paddingRight: 2 }]}>
              <Text>{formatMoney(loanBalance)}</Text>
            </View>

            {dayColumns.map((date) => (
              <React.Fragment key={date}>
                <View style={[styles.tableCell, { width: colWidths.day, textAlign: 'right', paddingRight: 2 }]}>
                  <Text>{formatMoney(payments[date] || 0)}</Text>
                </View>
                <View style={[styles.tableCell, { width: colWidths.day, textAlign: 'right', paddingRight: 2 }]}>
                  <Text>{formatMoney(savings[date] || 0)}</Text>
                </View>
              </React.Fragment>
            ))}

            <View style={[styles.tableCell, { width: colWidths.fwd, textAlign: 'right', paddingRight: 2 }]}>
              <Text>{formatMoney(totalPayments)}</Text>
            </View>
            <View style={[styles.tableCell, { width: colWidths.fwd, borderRightWidth: 0, textAlign: 'right', paddingRight: 2 }]}>
              <Text>{formatMoney(totalSavings)}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};
