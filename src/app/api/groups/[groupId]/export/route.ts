import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { BalanceUpdateType, Role, SavingsUpdateType } from "@prisma/client";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";
import { getMonday, formatDateYMD } from "@/lib/date";

export const runtime = "nodejs";

function safeFilePart(s: string) {
  return s.replaceAll(/[^a-zA-Z0-9-_]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/(^-|-$)/g, "");
}

function toNumber(d: unknown) {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  if (typeof d === "string") return Number(d) || 0;
  try {
    return Number((d as any).toString()) || 0;
  } catch {
    return 0;
  }
}

/** Get all weekdays (Mon-Fri) strings between from and to (inclusive) */
function getWeekdaysInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  // Normalize to midnight
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) { // Skip Sun(0) and Sat(6)
      dates.push(formatDateYMD(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function parseDateRange(req: Request): { from: string | null; to: string | null } {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from")?.trim() ?? null;
    const to = url.searchParams.get("to")?.trim() ?? null;
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { from: null, to: null };
    }
    return { from, to };
  } catch {
    return { from: null, to: null };
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const { groupId } = await ctx.params;
  const { from: dateFromRaw, to: dateTo } = parseDateRange(req);

  if (!dateFromRaw || !dateTo) {
     return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  // Snap start date to Monday
  const startDateObj = getMonday(new Date(dateFromRaw));
  const dateFrom = formatDateYMD(startDateObj);

  // Determine report columns (days)
  const dayColumns = getWeekdaysInRange(dateFrom, dateTo );

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          // Fetch ALL DEDUCT adjustments to calculate "Original Loan Amount" (Principal)
          // Principal = Current Balance + Total Payments
          // AND to calculate payments within the period
          balanceAdjustments: {
            where: { type: BalanceUpdateType.DEDUCT },
            select: { amount: true, createdAt: true },
          },
          // Fetch SAVINGS INCREASE for the period
          savingsAdjustments: {
            where: { 
              type: SavingsUpdateType.INCREASE,
              createdAt: {
                gte: new Date(dateFrom),
                lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)),
              }
            },
            select: { amount: true, createdAt: true },
          },
        },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mod = await import("exceljs");
  const Workbook = (mod as any).Workbook as new () => any;

  const wb = new Workbook();
  wb.creator = "Lending Monitoring System";
  wb.created = new Date();

  const ws = wb.addWorksheet("Collection Report");

  // --- STYLING ---
  const borderThin = { style: "thin", color: { argb: "FF000000" } } as const;
  const borderAll = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };
  
  const alignCenter = { vertical: "middle", horizontal: "center", wrapText: true } as const;
  const alignLeft = { vertical: "middle", horizontal: "left", wrapText: true } as const;
  
  const fontHeader = { bold: true, name: "Arial", size: 10 };
  const fontTitle = { bold: true, name: "Arial", size: 20 };
  const fontSubTitle = { bold: true, name: "Arial", size: 14 };

  // --- HEADER ROWS ---
  // Row 1: COLLECTION REPORT (Centered Title)
  ws.mergeCells("E1:N1"); // Approximate center
  const cellTitle = ws.getCell("E1");
  cellTitle.value = "COLLECTION REPORT";
  cellTitle.font = fontTitle;
  cellTitle.alignment = alignCenter;

  // Row 2: CENTER NAME & Group Name
  ws.getCell("A2").value = "CENTER NAME:";
  ws.getCell("A2").font = fontSubTitle;
  ws.mergeCells("E2:G2");
  const cellGn = ws.getCell("E2");
  cellGn.value = group.name;
  cellGn.font = { ...fontSubTitle, color: { argb: "FFFF0000" } }; // Red color
  cellGn.alignment = alignCenter;

  // Row 3: DATE
  ws.getCell("A3").value = "DATE:";
  ws.getCell("A3").font = fontSubTitle;
  ws.getCell("B3").value =  `${new Date(dateFrom).toLocaleDateString('en-US', { day: '2-digit', month: 'short'})} - ${new Date(dateTo).toLocaleDateString('en-US', { day: '2-digit', month: 'short'})}`;
  ws.getCell("B3").font = fontSubTitle;

  // Date Headers (Dynamic)
  // Structure:
  // Col A: No.
  // Col B: NAME
  // Col C: LOAN BALANCE
  // Col D..: Pairs of (PAYMENT, SAVINGS) per day
  // Col End-1: Balance Forwarded
  // Col End: Saving Forwarded

  // Define Columns
  // 1: No
  // 2: Name
  // 3: Loan Balance
  // D onwards: Days
  
  let colIdx = 4;
  const dayColMap: Record<string, number> = {}; // YYYY-MM-DD -> start col index (Payment)

  // Header Row 3 (Date Labels mostly)
  // But we need to build the structure first.
  
  // "No."
  ws.mergeCells("A4:A5");
  ws.getCell("A4").value = "NO.";
  
  // "NAME"
  ws.mergeCells("B4:B5");
  ws.getCell("B4").value = "NAME";

  // "LOAN BALANCE"
  ws.mergeCells("C4:C5");
  ws.getCell("C4").value = "LOAN BALANCE";

  // Days
  dayColumns.forEach((dateStr) => {
    // Format date for header (e.g. "21-Apr")
    const d = new Date(dateStr);
    const label = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    
    // Merge 2 columns for this day
    const startCol = colIdx;
    const endCol = colIdx + 1;
    
    // Header Day Label (Row 4) 
    ws.mergeCells(4, startCol, 4, endCol);
    const cellDate = ws.getCell(4, startCol);
    cellDate.value = label;
    cellDate.alignment = alignCenter;
    cellDate.font = fontHeader;
    cellDate.border = borderAll;

    // Sub-headers (Row 5)
    // T1, 1, T2, 2...
    // Let's just say "PAYMENT" and "SAVINGS"
    ws.getCell(5, startCol).value = "PAYMENT";
    ws.getCell(5, endCol).value = "SAVINGS";
    
    dayColMap[dateStr] = startCol;
    colIdx += 2;
  });

  // Balance Forwarded
  ws.mergeCells(4, colIdx, 5, colIdx);
  const cellBalFwd = ws.getCell(4, colIdx);
  cellBalFwd.value = "Balance Forwarded";
  cellBalFwd.alignment = { textRotation: 0, ...alignCenter }; // Wrap
  
  colIdx++;

  // Saving Forwarded
  ws.mergeCells(4, colIdx, 5, colIdx);
  const cellSavFwd = ws.getCell(4, colIdx);
  cellSavFwd.value = "Saving Forwarded";
  cellSavFwd.alignment = { textRotation: 0, ...alignCenter };
  
  const lastColIdx = colIdx;

  // Formatting Headers
  for (let r = 4; r <= 5; r++) {
    for (let c = 1; c <= lastColIdx; c++) {
      const cell = ws.getCell(r, c);
      cell.border = borderAll;
      cell.font = fontHeader;
      cell.alignment = alignCenter;
    }
  }

  // Column Widths
  ws.getColumn(1).width = 5;  // No
  ws.getColumn(2).width = 25; // Name
  ws.getColumn(3).width = 15; // Loan Balance
  for (let c = 4; c < lastColIdx - 1; c++) {
    ws.getColumn(c).width = 12; // Daily cols
  }
  ws.getColumn(lastColIdx - 1).width = 15; // Bal Fwd
  ws.getColumn(lastColIdx).width = 15; // Sav Fwd

  // --- DATA ROWS ---
  let currentRow = 6;
  
  // Calculate Totals Row Data
  const totals: Record<number, number> = {};

  group.members.forEach((m, idx) => {
    const row = ws.getRow(currentRow);
    
    // 1. No
    row.getCell(1).value = idx + 1;
    
    // 2. Name
    row.getCell(2).value = `${m.lastName}, ${m.firstName}`;
    
    // 3. Loan Balance = Current Balance + Sum(All DEDUCT payments)
    const currentBal = toNumber(m.balance);
    const totalPaymentsAllTime = m.balanceAdjustments.reduce((sum, adj) => sum + toNumber(adj.amount), 0);
    const loanBalance = currentBal + totalPaymentsAllTime;
    row.getCell(3).value = loanBalance;
    row.getCell(3).numFmt = "#,##0.00";

    // 4. Daily Columns
    let totalPaymentsPeriod = 0;
    let totalSavingsPeriod = 0;

    dayColumns.forEach(dateStr => {
      // Find adjustments for this day
      // Note: createdAt is UTC/Timestamp. Need careful comparison?
      // Just string matching YYYY-MM-DD for simplicity if safe, or compare ranges.
      // We are comparing `formatDateYMD(createdAt)` with `dateStr`.
      
      const payments = m.balanceAdjustments.filter(adj => formatDateYMD(new Date(adj.createdAt)) === dateStr);
      const savings = m.savingsAdjustments.filter(adj => formatDateYMD(new Date(adj.createdAt)) === dateStr);

      const paymentSum = payments.reduce((s, a) => s + toNumber(a.amount), 0);
      const savingsSum = savings.reduce((s, a) => s + toNumber(a.amount), 0);

      const startCol = dayColMap[dateStr];
      if (paymentSum > 0) row.getCell(startCol).value = paymentSum;
      if (savingsSum > 0) row.getCell(startCol + 1).value = savingsSum;

      // Add to Period Totals
      totalPaymentsPeriod += paymentSum;
      totalSavingsPeriod += savingsSum;
      
      // Add to Column Totals for Footer (using column index)
      totals[startCol] = (totals[startCol] || 0) + paymentSum;
      totals[startCol + 1] = (totals[startCol + 1] || 0) + savingsSum;
    });

    // Balance Forwarded (Total Payments in Period)
    row.getCell(lastColIdx - 1).value = totalPaymentsPeriod;
    row.getCell(lastColIdx - 1).numFmt = "#,##0.00";
    totals[lastColIdx - 1] = (totals[lastColIdx - 1] || 0) + totalPaymentsPeriod;

    // Savings Forwarded (Total Savings in Period)
    row.getCell(lastColIdx).value = totalSavingsPeriod;
    row.getCell(lastColIdx).numFmt = "#,##0.00";
    totals[lastColIdx] = (totals[lastColIdx] || 0) + totalSavingsPeriod;

    // Loan Balance Total
    totals[3] = (totals[3] || 0) + loanBalance;

    // Borders & Styling
    for (let c = 1; c <= lastColIdx; c++) {
      const cell = row.getCell(c);
      cell.border = borderAll;
      cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" };
    }

    currentRow++;
  });

  // --- FOOTER (TOTALS) ---
  const totalRow = ws.getRow(currentRow);
  totalRow.getCell(1).value = "TOTAL:";
  ws.mergeCells(currentRow, 1, currentRow, 2); // Merge No & Name
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(1).alignment = alignLeft;

  // Loan Balance Total
  totalRow.getCell(3).value = totals[3] || 0;
  totalRow.getCell(3).numFmt = "#,##0.00";
  totalRow.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCC89B" } };
  totalRow.getCell(3).font = { bold: true };
  
  // Daily Totals + Forwarded Totals
  const dayColIndices = Object.values(dayColMap).flatMap(i => [i, i+1]).concat([lastColIdx-1, lastColIdx]);

  dayColIndices.forEach(c => {
    const cell = totalRow.getCell(c);
    cell.value = totals[c] || 0;
    cell.numFmt = "#,##0.00";
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCC89B" } }; // Light Orange
    cell.border = borderAll;
    cell.alignment = alignCenter;
  });
  
  // Style Total Label Cell
  totalRow.getCell(1).border = borderAll;
  totalRow.getCell(2).border = borderAll; // Merged
  // Fill for label?
  totalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCC89B" } };

  // Freeze Panes
  ws.views = [{ state: "frozen", ySplit: 5, xSplit: 2 }];

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

  // Audit
  try {
    const request = await tryGetAuditRequestContext();
    await createAuditLogStandalone({
      actorUserId: actor.id,
      action: "GROUP_EXPORT",
      entityType: "Group",
      entityId: groupId,
      metadata: { format: "xlsx", memberCount: group.members.length },
      request,
    });
  } catch {
    // ignore audit failures for export
  }

  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `collection-report-${safeFilePart(group.name)}-${datePart}.xlsx`;

  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

