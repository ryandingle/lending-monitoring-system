import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";

export const runtime = "nodejs";

function safeFilePart(s: string) {
  return s.replaceAll(/[^a-zA-Z0-9-_]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/(^-|-$)/g, "");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ memberId: string }> },
) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const { memberId } = await ctx.params;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { group: { select: { id: true, name: true } } },
  });

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [accrualSum, accruals, balanceUpdates, savingsUpdates] = await Promise.all([
    prisma.savingsAccrual.aggregate({ where: { memberId }, _sum: { amount: true } }),
    prisma.savingsAccrual.findMany({
      where: { memberId },
      orderBy: { accruedForDate: "desc" },
      take: 5000,
    }),
    prisma.balanceAdjustment.findMany({
      where: { memberId },
      include: { encodedBy: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.savingsAdjustment.findMany({
      where: { memberId },
      include: { encodedBy: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  const accruedTotal = accrualSum._sum.amount ?? 0;

  // Dynamic import so the server can boot even if exceljs isn't available yet.
  // (But it should be installed as a dependency.)
  const mod = await import("exceljs");
  const Workbook = (mod as any).Workbook as new () => any;

  const wb = new Workbook();
  wb.creator = "Lending Monitoring System";
  wb.created = new Date();

  // Sheet 1: Summary
  const summary = wb.addWorksheet("Member");
  summary.columns = [
    { header: "Field", key: "field", width: 26 },
    { header: "Value", key: "value", width: 45 },
  ];

  const addRow = (field: string, value: string) => summary.addRow({ field, value });
  addRow("Member ID", member.id);
  addRow("Name", `${member.firstName} ${member.lastName}`);
  addRow("Group", member.group?.name ?? "—");
  addRow("Phone", member.phoneNumber ?? "—");
  addRow("Address", member.address ?? "—");
  addRow("Age", member.age != null ? String(member.age) : "—");
  addRow("Balance", member.balance.toFixed(2));
  addRow("Savings (stored)", member.savings.toFixed(2));
  addRow("Savings (ledger total)", typeof accruedTotal === "number" ? accruedTotal.toFixed(2) : String(accruedTotal));
  addRow("Created", member.createdAt.toISOString());
  addRow("Last accrued", member.savingsLastAccruedAt ? member.savingsLastAccruedAt.toISOString().slice(0, 10) : "—");

  summary.getRow(1).font = { bold: true };
  summary.views = [{ state: "frozen", ySplit: 1 }];

  // Sheet 2: Balance adjustments
  const bal = wb.addWorksheet("Balance Updates");
  bal.columns = [
    { header: "Created At (UTC)", key: "createdAt", width: 22 },
    { header: "Type", key: "type", width: 12 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Before", key: "before", width: 12 },
    { header: "After", key: "after", width: 12 },
    { header: "Encoded By", key: "encodedBy", width: 26 },
  ];
  balanceUpdates.forEach((b) =>
    bal.addRow({
      createdAt: b.createdAt.toISOString().replace("T", " ").slice(0, 19),
      type: b.type,
      amount: b.amount.toFixed(2),
      before: b.balanceBefore.toFixed(2),
      after: b.balanceAfter.toFixed(2),
      encodedBy: `${b.encodedBy.name} (${b.encodedBy.role})`,
    }),
  );
  bal.getRow(1).font = { bold: true };
  bal.views = [{ state: "frozen", ySplit: 1 }];

  // Sheet 3: Savings adjustments
  const sav = wb.addWorksheet("Savings Updates");
  sav.columns = [
    { header: "Created At (UTC)", key: "createdAt", width: 22 },
    { header: "Type", key: "type", width: 18 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Before", key: "before", width: 12 },
    { header: "After", key: "after", width: 12 },
    { header: "Encoded By", key: "encodedBy", width: 26 },
  ];
  savingsUpdates.forEach((s) =>
    sav.addRow({
      createdAt: s.createdAt.toISOString().replace("T", " ").slice(0, 19),
      type: s.type,
      amount: s.amount.toFixed(2),
      before: s.savingsBefore.toFixed(2),
      after: s.savingsAfter.toFixed(2),
      encodedBy: `${s.encodedBy.name} (${s.encodedBy.role})`,
    }),
  );
  sav.getRow(1).font = { bold: true };
  sav.views = [{ state: "frozen", ySplit: 1 }];

  // Sheet 4: Accrual ledger
  const acc = wb.addWorksheet("Savings Accruals");
  acc.columns = [
    { header: "Accrued For Date (UTC)", key: "day", width: 18 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Recorded At (UTC)", key: "createdAt", width: 22 },
  ];
  accruals.forEach((a) =>
    acc.addRow({
      day: a.accruedForDate.toISOString().slice(0, 10),
      amount: a.amount.toFixed(2),
      createdAt: a.createdAt.toISOString().replace("T", " ").slice(0, 19),
    }),
  );
  acc.getRow(1).font = { bold: true };
  acc.views = [{ state: "frozen", ySplit: 1 }];

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

