import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image as PdfImage } from '@react-pdf/renderer';

// Register fonts if needed (using standard fonts for now)
// Font.register({ family: 'Roboto', src: '...' });

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 4,
    paddingLeft: 50,
    paddingRight: -20,
    fontSize: 7,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 14,
    textAlign: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 2,
  },
  logo: {
    width: 32,
    height: 32,
    objectFit: 'contain',
  },
  logoPlaceholder: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  title: {
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 0,
  },
  subTitle: {
    fontSize: 10,
    marginBottom: 2,
  },
  tableContainer: {
    width: '100%',
    alignItems: 'center',
  },
  table: {
    width: '92%',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderLeftWidth: 1,
    borderLeftColor: '#000',
    minHeight: 12,
    alignItems: 'center',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderLeftWidth: 1,
    borderLeftColor: '#000',
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    height: 16,
  },
  tableCell: {
    padding: 0.5,
    borderRightWidth: 1,
    borderRightColor: '#000',
    textAlign: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  textLeft: {
    textAlign: 'left',
  },
  textRight: {
    textAlign: 'right',
  },
  textCenter: {
    textAlign: 'center',
  },
  bold: {
    fontWeight: 'bold', // Helvetica doesn't support fontWeight style directly in some versions, but 'Helvetica-Bold' works if registered. 
    // For standard fonts, we might need to rely on the font family change or just accept it.
    fontFamily: 'Helvetica-Bold',
  },
  footer: {
    marginTop: 4,
    fontSize: 8,
    textAlign: 'right',
    color: 'grey',
  },
});

interface ReportData {
  groupName: string;
  dateRange: string;
  dayColumns: string[]; // YYYY-MM-DD
  members: Array<{
    name: string;
    loanBalance: number;
    payments: Record<string, number>; // date -> amount
    savings: Record<string, number>; // date -> amount
    totalPayments: number;
    totalSavings: number;
  }>;
  totals: {
    loanBalance: number;
    dailyPayments: Record<string, number>;
    dailySavings: Record<string, number>;
    totalPayments: number;
    totalSavings: number;
  };
  companyName?: string;
  logoUrl?: any;
}

// Helper to format currency
const formatMoney = (amount: number) => {
  if (amount === 0) return ''; // Empty for zero to reduce clutter? Or '0.00'? Excel version hid zeros if logic implies.
  return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// Helper to format date header
const formatDateHeader = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

export const CollectionReportPdf = ({ data }: { data: ReportData }) => {
  const { dayColumns, members, totals } = data;
  const companyName = data.companyName ?? (process.env.LMS_COMPANY_NAME || 'TRIPLE E Microfinance Inc.');
  const logoUrl = data.logoUrl ?? (process.env.LMS_COMPANY_LOGO_URL || '');

  const numDayCols = dayColumns.length * 2;
  const fixedParts = [2, 12, 6, 6, 6, 6];
  const fixedTotal = fixedParts.reduce((a, b) => a + b, 0);
  const dynamicWidthPerCol = numDayCols > 0 ? ((100 - fixedTotal) / numDayCols) : 0;

  const colWidths = {
    no: '2%',
    name: '12%',
    balance: '6%',
    currentRelease: '6%',
    day: `${dynamicWidthPerCol}%`,
    fwd: '6%',
  };

  // Chunk members into pages of 30 (entire page is now tuned to fit)
  const ITEMS_PER_PAGE = 30;
  const memberChunks = [];
  for (let i = 0; i < members.length; i += ITEMS_PER_PAGE) {
    memberChunks.push(members.slice(i, i + ITEMS_PER_PAGE));
  }
  if (memberChunks.length === 0) {
     memberChunks.push([]);
  }

  return (
    <Document>
      {memberChunks.map((chunkMembers, pageIndex) => (
        <Page key={pageIndex} size="LEGAL" orientation="landscape" style={styles.page}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              {logoUrl ? (
                <PdfImage src={logoUrl} style={styles.logo} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text>LOGO</Text>
                </View>
              )}
              <Text style={styles.companyName}>{companyName}</Text>
            </View>
            <Text style={styles.title}>
              COLLECTION REPORT | CENTER: {data.groupName} | DATE: {data.dateRange}
            </Text>
          </View>

          <View style={styles.tableContainer}>
            <View style={styles.table}>
            {/* Header Row 1: Date Labels */}
            <View style={[styles.tableHeaderRow, { height: 20, borderTopWidth: 1, borderTopColor: '#000', backgroundColor: '#ffffff' }]}>
              <View style={[styles.tableCell, { width: colWidths.no, borderBottomWidth: 0 }]} />
              <View style={[styles.tableCell, { width: colWidths.name, borderBottomWidth: 0 }]} />
              <View style={[styles.tableCell, { width: colWidths.balance, borderBottomWidth: 0 }]} />
              <View style={[styles.tableCell, { width: colWidths.currentRelease, borderBottomWidth: 0 }]} />
              
              {dayColumns.map((date, i) => (
                <View key={date} style={[styles.tableCell, { width: `${dynamicWidthPerCol * 2}%` }]}>
                  <Text style={styles.bold}>{formatDateHeader(date)}</Text>
                </View>
              ))}

              <View style={[styles.tableCell, { width: colWidths.fwd, borderBottomWidth: 0 }]} />
              <View style={[styles.tableCell, { width: colWidths.fwd, borderBottomWidth: 0 }]} />
            </View>

            {/* Header Row 2: Titles & Sub-headers */}
            <View style={[styles.tableHeaderRow, { height: 20 }]}>
              <View style={[styles.tableCell, { width: colWidths.no }]}>
                <Text style={styles.bold}>NO.</Text>
              </View>
              <View style={[styles.tableCell, { width: colWidths.name }]}>
                <Text style={styles.bold}>NAME</Text>
              </View>
              <View style={[styles.tableCell, { width: colWidths.balance }]}>
                <Text style={styles.bold}>LOAN BAL</Text>
              </View>
              <View style={[styles.tableCell, { width: colWidths.currentRelease }]}>
                <Text style={styles.bold}>ACTIVE RELEASE</Text>
              </View>

              {dayColumns.map((date) => (
                <React.Fragment key={date}>
                  <View style={[styles.tableCell, { width: colWidths.day }]}>
                    <Text style={{ fontSize: 6 }}>PAY</Text>
                  </View>
                  <View style={[styles.tableCell, { width: colWidths.day }]}>
                    <Text style={{ fontSize: 6 }}>SAV</Text>
                  </View>
                </React.Fragment>
              ))}

              <View style={[styles.tableCell, { width: colWidths.fwd }]}>
                <Text style={{ fontSize: 6.5, ...styles.bold }}>Bal Fwd</Text>
              </View>
              <View style={[styles.tableCell, { width: colWidths.fwd }]}>
                <Text style={{ fontSize: 6.5, ...styles.bold }}>Sav Fwd</Text>
              </View>
            </View>

            {/* Data Rows */}
            {chunkMembers.map((member, i) => {
              const globalIndex = (pageIndex * ITEMS_PER_PAGE) + i + 1;
              return (
                <View key={i} style={styles.tableRow}>
                  <View style={[styles.tableCell, { width: colWidths.no }]}>
                    <Text>{globalIndex}</Text>
                  </View>
                  <View style={[styles.tableCell, { width: colWidths.name, alignItems: 'flex-start', paddingLeft: 4 }]}>
                    <Text style={styles.textLeft}>{member.name}</Text>
                  </View>
                  <View style={[styles.tableCell, { width: colWidths.balance, textAlign: 'right', paddingRight: 2 }]}>
                    <Text>{formatMoney(member.loanBalance)}</Text>
                  </View>
                  <View style={[styles.tableCell, { width: colWidths.currentRelease }]}>
                    <Text></Text>
                  </View>

                  {dayColumns.map((date) => (
                    <React.Fragment key={date}>
                      <View style={[styles.tableCell, { width: colWidths.day, textAlign: 'right', paddingRight: 2 }]}>
                        <Text>{formatMoney(member.payments[date] || 0)}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: colWidths.day, textAlign: 'right', paddingRight: 2 }]}>
                        <Text>{formatMoney(member.savings[date] || 0)}</Text>
                      </View>
                    </React.Fragment>
                  ))}

                  <View style={[styles.tableCell, { width: colWidths.fwd, textAlign: 'right', paddingRight: 2 }]}>
                    <Text>{formatMoney(member.totalPayments)}</Text>
                  </View>
                  <View style={[styles.tableCell, { width: colWidths.fwd, textAlign: 'right', paddingRight: 2 }]}>
                    <Text>{formatMoney(member.totalSavings)}</Text>
                  </View>
                </View>
              );
            })}

            {/* Total Row */}
            {pageIndex === memberChunks.length - 1 && (
              <View style={[styles.tableRow, { backgroundColor: '#FFFCC8' }]}>
                <View style={[styles.tableCell, { width: `14%` }]}>
                  <Text style={styles.bold}>TOTAL:</Text>
                </View>
                <View style={[styles.tableCell, { width: colWidths.balance, textAlign: 'right', paddingRight: 2 }]}>
                  <Text style={styles.bold}>{formatMoney(totals.loanBalance)}</Text>
                </View>
                <View style={[styles.tableCell, { width: colWidths.currentRelease }]} />

                {dayColumns.map((date) => (
                  <React.Fragment key={date}>
                    <View style={[styles.tableCell, { width: colWidths.day, textAlign: 'right', paddingRight: 2 }]}>
                      <Text style={styles.bold}>{formatMoney(totals.dailyPayments[date] || 0)}</Text>
                    </View>
                    <View style={[styles.tableCell, { width: colWidths.day, textAlign: 'right', paddingRight: 2 }]}>
                      <Text style={styles.bold}>{formatMoney(totals.dailySavings[date] || 0)}</Text>
                    </View>
                  </React.Fragment>
                ))}

                <View style={[styles.tableCell, { width: colWidths.fwd, textAlign: 'right', paddingRight: 2 }]}>
                  <Text style={styles.bold}>{formatMoney(totals.totalPayments)}</Text>
                </View>
                <View style={[styles.tableCell, { width: colWidths.fwd, textAlign: 'right', paddingRight: 2 }]}>
                  <Text style={styles.bold}>{formatMoney(totals.totalSavings)}</Text>
                </View>
              </View>
            )}
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
};
