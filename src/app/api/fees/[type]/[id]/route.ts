import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  const { type, id } = await params;

  try {
    if (type === "processing") {
      const row = await prisma.processingFee.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Fee not found" }, { status: 404 });
      await prisma.processingFee.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    if (type === "membership") {
      const row = await prisma.membershipFee.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Fee not found" }, { status: 404 });
      await prisma.membershipFee.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    if (type === "loan-insurance") {
      const row = await prisma.loanInsurance.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Fee not found" }, { status: 404 });
      await prisma.loanInsurance.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    if (type === "passbook") {
      const row = await prisma.passbookFee.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Fee not found" }, { status: 404 });
      await prisma.passbookFee.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid fee type" }, { status: 400 });
  } catch (error) {
    console.error("Error reverting fee:", error);
    return NextResponse.json({ error: "Failed to revert fee" }, { status: 500 });
  }
}
