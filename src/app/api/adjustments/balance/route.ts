import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";

const BalanceAdjustmentSchema = z.object({
  memberId: z.string().uuid(),
  type: z.enum(["INCREASE", "DEDUCT"]),
  amount: z.coerce.number().positive(),
});

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");

    if (!memberId) {
        return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
    }

    try {
        const [adjustments, total] = await Promise.all([
            prisma.balanceAdjustment.findMany({
                where: { memberId },
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                include: { encodedBy: { select: { name: true } } },
            }),
            prisma.balanceAdjustment.count({ where: { memberId } }),
        ]);

        const serializedAdjustments = adjustments.map(adj => ({
            ...adj,
            amount: Number(adj.amount),
            balanceBefore: Number(adj.balanceBefore),
            balanceAfter: Number(adj.balanceAfter),
            createdAt: adj.createdAt.toISOString(),
        }));

        return NextResponse.json({
            items: serializedAdjustments,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error("Error fetching balance adjustments:", error);
        return NextResponse.json({ error: "Failed to fetch adjustments" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  
  try {
    const body = await req.json();
    const parsed = BalanceAdjustmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
    }

    const { memberId, type, amount } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) throw new Error("Member not found");

      const balanceBefore = Number(member.balance);
      const adjustmentAmount = type === "INCREASE" ? amount : -amount;
      const balanceAfter = balanceBefore + adjustmentAmount;

      await tx.member.update({
        where: { id: memberId },
        data: { balance: balanceAfter },
      });

      const adjustment = await tx.balanceAdjustment.create({
        data: {
          memberId,
          encodedById: user.id,
          type,
          amount,
          balanceBefore,
          balanceAfter,
        },
        include: { encodedBy: { select: { name: true } } }
      });
      
      return { adjustment, balanceAfter };
    });

    return NextResponse.json({ 
        success: true, 
        adjustment: {
            ...result.adjustment,
            amount: Number(result.adjustment.amount),
            balanceBefore: Number(result.adjustment.balanceBefore),
            balanceAfter: Number(result.adjustment.balanceAfter),
            createdAt: result.adjustment.createdAt.toISOString(),
        },
        newBalance: result.balanceAfter
    });
  } catch (error) {
    console.error("Error creating balance adjustment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create adjustment" },
      { status: 500 }
    );
  }
}
