import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCollectorScopedGroupIds } from "@/lib/auth/access";
import { requireRole, requireUser } from "@/lib/auth/session";
import { z } from "zod";
import { formatDateYMD, getManilaBusinessDate, getManilaDateRange } from "@/lib/date";
import { Role, SavingsAdjustment } from "@prisma/client";

const SavingsAdjustmentSchema = z.object({
  memberId: z.string().uuid(),
  type: z.enum(["INCREASE", "WITHDRAW"]),
  amount: z.coerce.number().positive(),
});

export async function GET(req: NextRequest) {
    const user = await requireUser();
    requireRole(user, ["SUPER_ADMIN", "ENCODER", "VIEWER", "COLLECTOR"] as Role[]);
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");
    const collectorGroupIds = await getCollectorScopedGroupIds(user);

    if (!memberId) {
        return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
    }

    try {
        if (collectorGroupIds) {
            const member = await prisma.member.findUnique({
                where: { id: memberId },
                select: { groupId: true },
            });
            if (!member?.groupId || !collectorGroupIds.includes(member.groupId)) {
                return NextResponse.json({ error: "Member not found" }, { status: 404 });
            }
        }

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

        const serializedAdjustments = (adjustments as SavingsAdjustment[]).map((adj: SavingsAdjustment) => ({
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
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  
  try {
    const body = await req.json();
    const parsed = SavingsAdjustmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
    }

    const { memberId, type, amount } = parsed.data;

    const adjustmentDate = getManilaBusinessDate();
    const todayStr = formatDateYMD(adjustmentDate);
    const todayRange = getManilaDateRange(todayStr, todayStr);

    const result = await prisma.$transaction(async (tx) => {
      const alreadyUpdated = await tx.savingsAdjustment.findFirst({
        where: {
          memberId,
          createdAt: { gte: todayRange.from, lte: todayRange.to },
        },
      });
      if (alreadyUpdated) {
        throw new Error("SAVINGS_ALREADY_UPDATED_TODAY");
      }

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
    if (error instanceof Error && error.message === "SAVINGS_ALREADY_UPDATED_TODAY") {
      return NextResponse.json(
        { error: "Savings has already been updated today." },
        { status: 409 },
      );
    }
    console.error("Error creating savings adjustment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create adjustment" },
      { status: 500 }
    );
  }
}
