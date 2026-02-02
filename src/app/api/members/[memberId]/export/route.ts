import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role, BalanceUpdateType, SavingsUpdateType } from "@prisma/client";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";
import { getManilaDateRange, getMonday, formatDateYMD, getWeekdaysInRange, countBusinessDays, getManilaToday } from "@/lib/date";

export const runtime = "nodejs";

function safeFilePart(s: string) {
  return s.replaceAll(/[^a-zA-Z0-9-_]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/(^-|-$)/g, "");
}



function parseDateRange(req: Request): { from: string | null; to: string | null } {
  try {
    const url = new URL(req.url, "http://localhost"); // Provide base in case req.url is relative
    const from = url.searchParams.get("from")?.trim();
    const to = url.searchParams.get("to")?.trim();
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { from: null, to: null };
    }
    return { from, to };
  } catch {
    return { from: null, to: null };
  }
}

// Reimplementation of GET to match Group Export Design
export async function GET(
  req: Request,
  ctx: { params: Promise<{ memberId: string }> },
) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const { memberId } = await ctx.params;
  const { from: dateFromStr, to: dateToStr } = parseDateRange(req);

  if (!dateFromStr || !dateToStr) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  // Snap start date to Monday (like Group Export)
  // Logic: new Date("YYYY-MM-DD") in Node is UTC midnight. getMonday handles it correctly in UTC.
  const startDateObj = getMonday(new Date(dateFromStr));
  const dateFromGroupStyle = formatDateYMD(startDateObj);

  // Use manila boundaries for queries
  const range = getManilaDateRange(dateFromGroupStyle, dateToStr);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      group: { select: { id: true, name: true } },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch adjustments separate from finding member to keep logic clean?
  const [balanceAdjustments, savingsAdjustments] = await Promise.all([
    // All DEDUCT adjustments for "Loan Balance" calculation
    prisma.balanceAdjustment.findMany({
      where: {
        memberId: member.id,
        type: BalanceUpdateType.DEDUCT,
      },
      select: { amount: true, createdAt: true },
    }),
    // Savings INCREASES within range
    prisma.savingsAdjustment.findMany({
      where: {
        memberId: member.id,
        type: SavingsUpdateType.INCREASE,
        createdAt: {
          gte: range.from,
          lte: range.to,
        }
      },
      select: { amount: true, createdAt: true },
    })
  ]);

  // Helper
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

  // Determine report columns (days)
  // NOTE: getWeekdaysInRange strictly returns Mon-Fri only, excluding weekends as required.
  const dayColumns = getWeekdaysInRange(dateFromGroupStyle, dateToStr);

  const mod = await import("exceljs");
  const Workbook = (mod as any).Workbook as new () => any;

  const wb = new Workbook();
  wb.creator = process.env.NEXT_PUBLIC_APP_NAME || "TRIPLE E microfinance inc.";
  wb.created = new Date();

  // --- SHEET: Collection Report ---
  const ws = wb.addWorksheet("Member Statement");

  // --- STYLING ---
  const borderThin = { style: "thin", color: { argb: "FF000000" } } as const;
  const borderAll = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };

  const alignCenter = { vertical: "middle", horizontal: "center", wrapText: true } as const;
  const alignLeft = { vertical: "middle", horizontal: "left", wrapText: true } as const;
  const fontHeader = { bold: true, name: "Arial", size: 10 };
  const fontBoldIdx = { bold: true, name: "Arial", size: 10 };

  // --- INFO ROWS ---
  // Row 1: Name
  ws.getCell("A1").value = "Name";
  ws.getCell("A1").font = fontBoldIdx;
  ws.getCell("B1").value = `${member.firstName} ${member.lastName}`;
  ws.getCell("B1").alignment = alignLeft;

  // Row 2: Group
  ws.getCell("A2").value = "group";
  ws.getCell("A2").font = fontBoldIdx;
  ws.getCell("B2").value = member.group?.name || "No Group";
  ws.getCell("B2").alignment = alignLeft;

  // Row 3: Member Since
  const memberCreatedDate = new Date(member.createdAt);
  const todayDate = getManilaToday();
  const daysSince = countBusinessDays(memberCreatedDate, todayDate);

  ws.getCell("A3").value = "Member Since";
  ws.getCell("A3").font = fontBoldIdx;
  ws.getCell("B3").value = `${formatDateYMD(memberCreatedDate)} (${daysSince} ${daysSince === 1 ? "day" : "days"})`;
  ws.getCell("B3").alignment = alignLeft;

  // Row 4: report date
  ws.getCell("A4").value = "report date";
  ws.getCell("A4").font = fontBoldIdx;
  ws.getCell("B4").value = `${new Date(dateFromGroupStyle).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} to ${new Date(dateToStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}`;
  ws.getCell("B4").alignment = alignLeft;

  // --- REPORT TABLE HEADERS ---
  const headerRow1 = 6;
  const headerRow2 = 7;

  let colIdx = 3;

  // "NO."
  ws.mergeCells(`A${headerRow1}:A${headerRow2}`);
  const cellNo = ws.getCell(`A${headerRow1}`);
  cellNo.value = "NO.";
  cellNo.font = fontHeader;
  cellNo.alignment = alignCenter;
  cellNo.border = borderAll;

  // "LOAN BALANCE"
  ws.mergeCells(`B${headerRow1}:B${headerRow2}`);
  const cellLB = ws.getCell(`B${headerRow1}`);
  cellLB.value = "LOAN BALANCE";
  cellLB.font = fontHeader;
  cellLB.alignment = alignCenter;
  cellLB.border = borderAll;

  const dayColMap: Record<string, number> = {};

  dayColumns.forEach((dateStr) => {
    const d = new Date(dateStr);
    const label = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });

    const startCol = colIdx;
    const endCol = colIdx + 1;

    // Header Row 1: Date Label
    ws.mergeCells(headerRow1, startCol, headerRow1, endCol);
    const cellDate = ws.getCell(headerRow1, startCol);
    cellDate.value = label;
    cellDate.alignment = alignCenter;
    cellDate.font = fontHeader;
    cellDate.border = borderAll;

    // Header Row 2: PAYMENT | SAVINGS
    const cellPay = ws.getCell(headerRow2, startCol);
    cellPay.value = "PAYMENT";
    cellPay.font = { ...fontHeader, size: 8 };
    cellPay.alignment = alignCenter;
    cellPay.border = borderAll;

    const cellSav = ws.getCell(headerRow2, endCol);
    cellSav.value = "SAVINGS";
    cellSav.font = { ...fontHeader, size: 8 };
    cellSav.alignment = alignCenter;
    cellSav.border = borderAll;

    dayColMap[dateStr] = startCol;
    colIdx += 2;
  });

  // Balance Forwarded Header
  ws.mergeCells(headerRow1, colIdx, headerRow2, colIdx);
  const cellBalFwd = ws.getCell(headerRow1, colIdx);
  cellBalFwd.value = "Balance Forwarded";
  cellBalFwd.alignment = { textRotation: 0, ...alignCenter }; // Wrap
  cellBalFwd.font = fontHeader;
  cellBalFwd.border = borderAll;
  colIdx++;

  // Saving Forwarded Header
  ws.mergeCells(headerRow1, colIdx, headerRow2, colIdx);
  const cellSavFwd = ws.getCell(headerRow1, colIdx);
  cellSavFwd.value = "Saving Forwarded";
  cellSavFwd.alignment = { textRotation: 0, ...alignCenter };
  cellSavFwd.font = fontHeader;
  cellSavFwd.border = borderAll;

  const lastColIdx = colIdx;

  // Column Widths
  ws.getColumn(1).width = 10; // NO.
  ws.getColumn(2).width = 20; // LOAN BALANCE
  for (let c = 3; c <= lastColIdx - 2; c++) {
    ws.getColumn(c).width = 12; // Daily
  }
  ws.getColumn(lastColIdx - 1).width = 15; // Bal Fwd
  ws.getColumn(lastColIdx).width = 15; // Sav Fwd

  // --- DATA ROW ---
  const dataRowIdx = 8;
  const row = ws.getRow(dataRowIdx);
  const totals: Record<number, number> = {};

  // 1. No
  row.getCell(1).value = 1;
  row.getCell(1).alignment = alignCenter;
  row.getCell(1).border = borderAll;

  // 2. LOAN BALANCE
  const currentBal = toNumber(member.balance);
  const totalPaymentsAllTime = balanceAdjustments.reduce((sum, adj) => sum + toNumber(adj.amount), 0);
  const loanBalance = currentBal + totalPaymentsAllTime;
  row.getCell(2).value = loanBalance;
  row.getCell(2).numFmt = "#,##0.00";
  row.getCell(2).alignment = alignCenter;
  row.getCell(2).border = borderAll;

  totals[2] = loanBalance;

  // Daily Columns
  let totalPaymentsPeriod = 0;
  let totalSavingsPeriod = 0;

  dayColumns.forEach(dateStr => {
    const payments = balanceAdjustments.filter(adj => formatDateYMD(new Date(adj.createdAt)) === dateStr);
    const savings = savingsAdjustments.filter(adj => formatDateYMD(new Date(adj.createdAt)) === dateStr);

    const paymentSum = payments.reduce((s, a) => s + toNumber(a.amount), 0);
    const savingsSum = savings.reduce((s, a) => s + toNumber(a.amount), 0);

    const startCol = dayColMap[dateStr];

    // Payment
    const cellP = row.getCell(startCol);
    if (paymentSum > 0) cellP.value = paymentSum;
    cellP.numFmt = "#,##0.00";
    cellP.border = borderAll;
    cellP.alignment = alignCenter;

    // Savings
    const cellS = row.getCell(startCol + 1);
    if (savingsSum > 0) cellS.value = savingsSum;
    cellS.numFmt = "#,##0.00";
    cellS.border = borderAll;
    cellS.alignment = alignCenter;

    totals[startCol] = (totals[startCol] || 0) + paymentSum;
    totals[startCol + 1] = (totals[startCol + 1] || 0) + savingsSum;

    totalPaymentsPeriod += paymentSum;
    totalSavingsPeriod += savingsSum;
  });

  // Balance Forwarded Data (Sum of payments in this period)
  const cellBFData = row.getCell(lastColIdx - 1);
  cellBFData.value = totalPaymentsPeriod;
  cellBFData.numFmt = "#,##0.00";
  cellBFData.border = borderAll;
  cellBFData.alignment = alignCenter;
  totals[lastColIdx - 1] = (totals[lastColIdx - 1] || 0) + totalPaymentsPeriod;

  // Savings Forwarded Data (Sum of savings in this period)
  const cellSFData = row.getCell(lastColIdx);
  cellSFData.value = totalSavingsPeriod;
  cellSFData.numFmt = "#,##0.00";
  cellSFData.border = borderAll;
  cellSFData.alignment = alignCenter;
  totals[lastColIdx] = (totals[lastColIdx] || 0) + totalSavingsPeriod;

  // --- TOTAL ROW ---
  const totalRowIdx = 9;
  const totalRow = ws.getRow(totalRowIdx);

  // "TOTAL:"
  totalRow.getCell(1).value = "TOTAL:";
  totalRow.getCell(1).font = fontHeader;
  totalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCC89B" } }; // Orange
  totalRow.getCell(1).border = borderAll;

  // Loan Balance Total
  totalRow.getCell(2).value = totals[2];
  totalRow.getCell(2).numFmt = "#,##0.00";
  totalRow.getCell(2).font = fontHeader;
  totalRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCC89B" } };
  totalRow.getCell(2).border = borderAll;
  totalRow.getCell(2).alignment = alignCenter;

  // Daily Totals + Forwarded Totals
  for (let c = 3; c <= lastColIdx; c++) {
    const cell = totalRow.getCell(c);
    cell.value = totals[c] || 0;
    cell.numFmt = "#,##0.00";
    cell.font = fontHeader;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCC89B" } };
    cell.border = borderAll;
    cell.alignment = alignCenter;
  }

  ws.views = [{ state: "frozen", ySplit: 5, xSplit: 2 }];

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

  // Audit
  try {
    const request = await tryGetAuditRequestContext();
    await createAuditLogStandalone({
      actorUserId: actor.id,
      action: "MEMBER_EXPORT",
      entityType: "Member",
      entityId: memberId,
      metadata: { format: "xlsx" },
      request,
    });
  } catch {
    // ignore audit failures for export
  }

  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `member-${safeFilePart(member.lastName)}-${safeFilePart(member.firstName)}-${datePart}.xlsx`;

  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
