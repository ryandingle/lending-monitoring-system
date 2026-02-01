import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";

export const runtime = "nodejs";

function safeFilePart(s: string) {
  return s.replaceAll(/[^a-zA-Z0-9-_]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/(^-|-$)/g, "");
}

function toNumber(d: unknown) {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  if (typeof d === "string") return Number(d) || 0;
  // Prisma.Decimal has toString()
  try {
    return Number((d as any).toString()) || 0;
  } catch {
    return 0;
  }
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
  const { from: dateFrom, to: dateTo } = parseDateRange(req);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
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

  const ws = wb.addWorksheet("Group");

  // Columns roughly match the provided template.
  ws.columns = [
    { key: "no", width: 6 },
    { key: "name", width: 26 },
    { key: "passbook", width: 10 },
    { key: "newMem", width: 10 },
    { key: "loanBal", width: 14 },
    { key: "reloan", width: 12 },
    { key: "curAmt", width: 14 },
    { key: "curDate", width: 12 },
    { key: "loan1", width: 8 },
    { key: "loan2", width: 8 },
    { key: "loan3", width: 8 },
    { key: "loan4", width: 8 },
    { key: "total", width: 10 },
    { key: "newBal", width: 14 },
    { key: "savings", width: 12 },
    { key: "fullAmt", width: 16 },
    { key: "fullDate", width: 12 },
    { key: "savFwd", width: 16 },
  ];

  // Title row
  const periodSuffix =
    dateFrom && dateTo ? ` (Report period: ${dateFrom} to ${dateTo})` : "";
  const title = `Group Name: ${group.name}${periodSuffix}`;
  ws.mergeCells(1, 1, 1, 18);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 22;

  // Header (2 rows with merges)
  ws.mergeCells("A2:A3");
  ws.mergeCells("B2:B3");
  ws.mergeCells("C2:C3");
  ws.mergeCells("D2:D3");
  ws.mergeCells("E2:F2");
  ws.mergeCells("G2:H2");
  ws.mergeCells("I2:L2");
  ws.mergeCells("M2:M3");
  ws.mergeCells("N2:N3");
  ws.mergeCells("O2:O3");
  ws.mergeCells("P2:Q2");
  ws.mergeCells("R2:R3");

  ws.getCell("A2").value = "Sl.No.";
  ws.getCell("B2").value = "Name of Member";
  ws.getCell("C2").value = "Pass Book";
  ws.getCell("D2").value = "New Mem";
  ws.getCell("E2").value = "BALANCE FORWARDED";
  ws.getCell("E3").value = "Loan Balance";
  ws.getCell("F3").value = "Re-loan";
  ws.getCell("G2").value = "Current Release";
  ws.getCell("G3").value = "Amount";
  ws.getCell("H3").value = "Date";
  ws.getCell("I2").value = "Loan";
  ws.getCell("I3").value = "1";
  ws.getCell("J3").value = "2";
  ws.getCell("K3").value = "3";
  ws.getCell("L3").value = "4";
  ws.getCell("M2").value = "Total";
  ws.getCell("N2").value = "New Balance";
  ws.getCell("O2").value = "SAVINGS";
  ws.getCell("P2").value = "Full Repayment";
  ws.getCell("P3").value = "Amount";
  ws.getCell("Q3").value = "Date";
  ws.getCell("R2").value = "SAVINGS FORWARDED";

  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;

  // Styles
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  const headerFont = { bold: true, color: { argb: "FFE5E7EB" } };
  const headerAlignment = { vertical: "middle", horizontal: "center", wrapText: true };

  const yellowFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF59D" } };
  const greenFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF86EFAC" } };

  const thinBorder = {
    top: { style: "thin", color: { argb: "FF334155" } },
    left: { style: "thin", color: { argb: "FF334155" } },
    bottom: { style: "thin", color: { argb: "FF334155" } },
    right: { style: "thin", color: { argb: "FF334155" } },
  };

  for (let r = 2; r <= 3; r++) {
    for (let c = 1; c <= 18; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = headerAlignment;
      cell.border = thinBorder;
    }
  }

  // Column accents (header)
  ws.getCell("N2").fill = yellowFill;
  ws.getCell("N2").font = { bold: true, color: { argb: "FF0B1220" } };
  ws.getCell("O2").fill = greenFill;
  ws.getCell("O2").font = { bold: true, color: { argb: "FF0B1220" } };
  ws.getCell("R2").fill = greenFill;
  ws.getCell("R2").font = { bold: true, color: { argb: "FF0B1220" } };

  // Body rows start at 4
  const firstDataRow = 4;
  group.members.forEach((m, idx) => {
    const rowIndex = firstDataRow + idx;
    const r = ws.getRow(rowIndex);

    const balance = toNumber(m.balance);
    const savings = toNumber(m.savings);

    r.getCell(1).value = idx + 1;
    r.getCell(2).value = `${m.lastName}, ${m.firstName}`;
    // columns 3-4 intentionally blank for template fields
    r.getCell(5).value = balance; // Loan Balance forwarded
    // columns 6-12 blank
    r.getCell(13).value = 0; // Total
    r.getCell(14).value = balance; // New Balance
    r.getCell(15).value = savings; // Savings
    // columns 16-17 blank (full repayment)
    r.getCell(18).value = savings; // Savings forwarded

    for (let c = 1; c <= 18; c++) {
      const cell = r.getCell(c);
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" };
      if ([5, 13, 14, 15, 18].includes(c)) {
        cell.numFmt = "#,##0.00";
      }
    }

    // Color-highlight the key columns like the sample.
    r.getCell(14).fill = yellowFill;
    r.getCell(15).fill = greenFill;
    r.getCell(18).fill = greenFill;
  });

  const lastDataRow = firstDataRow + group.members.length - 1;
  const totalRowIndex = (group.members.length ? lastDataRow : firstDataRow - 1) + 1;
  const totalRow = ws.getRow(totalRowIndex);

  // Total row label (merge A-D)
  ws.mergeCells(totalRowIndex, 1, totalRowIndex, 4);
  totalRow.getCell(1).value = "Total";
  totalRow.getCell(1).font = { bold: true, color: { argb: "FFE5E7EB" } };
  totalRow.getCell(1).fill = headerFill;
  totalRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

  for (let c = 1; c <= 18; c++) {
    totalRow.getCell(c).border = thinBorder;
  }

  if (group.members.length) {
    totalRow.getCell(14).value = { formula: `SUM(N${firstDataRow}:N${lastDataRow})` };
    totalRow.getCell(15).value = { formula: `SUM(O${firstDataRow}:O${lastDataRow})` };
    totalRow.getCell(18).value = { formula: `SUM(R${firstDataRow}:R${lastDataRow})` };
  } else {
    totalRow.getCell(14).value = 0;
    totalRow.getCell(15).value = 0;
    totalRow.getCell(18).value = 0;
  }

  totalRow.getCell(14).numFmt = "#,##0.00";
  totalRow.getCell(15).numFmt = "#,##0.00";
  totalRow.getCell(18).numFmt = "#,##0.00";

  totalRow.getCell(14).fill = yellowFill;
  totalRow.getCell(15).fill = greenFill;
  totalRow.getCell(18).fill = greenFill;
  totalRow.getCell(14).font = { bold: true };
  totalRow.getCell(15).font = { bold: true };
  totalRow.getCell(18).font = { bold: true };

  // Freeze header rows
  ws.views = [{ state: "frozen", ySplit: 3 }];

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
  const filename = `group-${safeFilePart(group.name)}-${datePart}.xlsx`;

  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

