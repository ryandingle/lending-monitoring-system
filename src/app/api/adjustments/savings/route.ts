import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";
import { adjustDateForWeekend, getManilaToday } from "@/lib/date";

const SavingsAdjustmentSchema = z.object({
  memberId: z.string().uuid(),
  type: z.enum(["INCREASE", "WITHDRAW"]),
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
            prisma.savingsAdjustment.findMany({
                where: { memberId },
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                include: { encodedBy: { select: { name: true } } },
            }),
            prisma.savingsAdjustment.count({ where: { memberId } }),
        ]);

        const serializedAdjustments = adjustments.map(adj => ({
            ...adj,
            amount: Number(adj.amount),
            savingsBefore: Number(adj.savingsBefore),
            savingsAfter: Number(adj.savingsAfter),
            createdAt: adj.createdAt.toISOString(),
        }));

        return NextResponse.json({
            items: serializedAdjustments,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error("Error fetching savings adjustments:", error);
        return NextResponse.json({ error: "Failed to fetch adjustments" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  
  try {
    const body = await req.json();
    const parsed = SavingsAdjustmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
    }

    const { memberId, type, amount } = parsed.data;

    // Adjust date if weekend
    const adjustmentDate = adjustDateForWeekend(getManilaToday());

    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) throw new Error("Member not found");

      const savingsBefore = Number(member.savings);
      const adjustmentAmount = type === "INCREASE" ? amount : -amount;
      const savingsAfter = savingsBefore + adjustmentAmount;

      await tx.member.update({
        where: { id: memberId },
        data: { savings: savingsAfter },
      });

      const adjustment = await tx.savingsAdjustment.create({
        data: {
          memberId,
          encodedById: user.id,
          type,
          amount,
          savingsBefore,
          savingsAfter,
          createdAt: adjustmentDate,
        },
        include: { encodedBy: { select: { name: true } } }
      });
      
      return { adjustment, savingsAfter };
    });

    return NextResponse.json({ 
        success: true, 
        adjustment: {
            ...result.adjustment,
            amount: Number(result.adjustment.amount),
            savingsBefore: Number(result.adjustment.savingsBefore),
            savingsAfter: Number(result.adjustment.savingsAfter),
            createdAt: result.adjustment.createdAt.toISOString(),
        },
        newSavings: result.savingsAfter
    });
  } catch (error) {
    console.error("Error creating savings adjustment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create adjustment" },
      { status: 500 }
    );
  }
}
