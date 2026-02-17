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
      const adjustment = await tx.balanceAdjustment.findUnique({
        where: { id },
        include: { member: true },
      });

      if (!adjustment) {
        throw new Error("Adjustment not found");
      }

      // Reverse the effect
      let adjustmentAmount = Number(adjustment.amount);
      if (adjustment.type === "DEDUCT") {
        adjustmentAmount = -adjustmentAmount;
      }
      // If INCREASE, amount is positive.
      // Revert: newBalance = currentBalance - amount
      // If DEDUCT, amount is effectively negative (conceptually).
      // Revert: newBalance = currentBalance - (-amount) = currentBalance + amount

      // Wait, let's be precise.
      // If type INCREASE, it added to balance. Revert should SUBTRACT.
      // If type DEDUCT, it subtracted from balance. Revert should ADD.
      
      const reverseAmount = adjustment.type === "INCREASE" 
        ? -Number(adjustment.amount) 
        : Number(adjustment.amount);

      const updateData: any = {
        balance: { increment: reverseAmount },
      };

      if (adjustment.type === "DEDUCT" && adjustment.member && adjustment.member.daysCount > 0) {
        updateData.daysCount = adjustment.member.daysCount - 1;
      }

      await tx.member.update({
        where: { id: adjustment.memberId },
        data: updateData,
      });

      await tx.balanceAdjustment.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reverting balance adjustment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revert adjustment" },
      { status: 500 }
    );
  }
}
