import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;

  try {
    await prisma.$transaction(async (tx) => {
      const adjustment = await tx.savingsAdjustment.findUnique({
        where: { id },
        include: { member: true },
      });

      if (!adjustment) {
        throw new Error("Adjustment not found");
      }

      // Reverse the effect
      // If INCREASE, it added to savings. Revert should SUBTRACT.
      // If WITHDRAW or APPLY_TO_BALANCE, it subtracted from savings. Revert should ADD.
      
      const reverseAmount = adjustment.type === "INCREASE" 
        ? -Number(adjustment.amount) 
        : Number(adjustment.amount);

      await tx.member.update({
        where: { id: adjustment.memberId },
        data: {
          savings: { increment: reverseAmount },
        },
      });

      await tx.savingsAdjustment.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reverting savings adjustment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revert adjustment" },
      { status: 500 }
    );
  }
}
