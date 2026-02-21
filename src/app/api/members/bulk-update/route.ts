import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { BalanceUpdateType, Role, SavingsUpdateType } from "@prisma/client";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { getManilaBusinessDate } from "@/lib/date";

export async function POST(req: NextRequest) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const body = await req.json();
  const { updates } = body as {
    updates: {
      memberId: string;
      balanceDeduct: string;
      savingsIncrease: string;
      daysCount: string;
      activeReleaseAmount?: string;
    }[];
  };

  if (!updates || !Array.isArray(updates)) {
    return NextResponse.json({ error: "Invalid updates data" }, { status: 400 });
  }

  const request = await tryGetAuditRequestContext();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const adjustmentDate = getManilaBusinessDate();

  const errors: { memberId: string; message: string; type: "balance" | "savings" }[] = [];
  const warnings: { memberId: string; message: string }[] = [];

  try {
    for (const update of updates) {
      await prisma.$transaction(async (tx) => {
        const member = await tx.member.findUnique({
          where: { id: update.memberId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            balance: true,
            savings: true,
            daysCount: true,
          },
        });
        if (!member) {
          return;
        }

        const balanceDeduct = parseFloat(update.balanceDeduct) || 0;
        const savingsIncrease = parseFloat(update.savingsIncrease) || 0;
        const activeReleaseAmount = parseFloat(update.activeReleaseAmount ?? "") || 0;
        const newDaysCount = update.daysCount !== "" ? parseInt(update.daysCount) : null;

        if (balanceDeduct > 0) {
          const alreadyUpdated = await tx.balanceAdjustment.findFirst({
            where: {
              memberId: member.id,
              createdAt: { gte: startOfToday },
            },
          });

          if (alreadyUpdated) {
            await createAuditLog(tx, {
              actorUserId: actor.id,
              action: "ATTEMPT_MULTIPLE_BALANCE_UPDATE",
              entityType: "Member",
              entityId: member.id,
              metadata: { attempt: balanceDeduct, memberName: `${member.firstName} ${member.lastName}` },
              request,
            });
            errors.push({
              memberId: member.id,
              type: "balance",
              message: `Balance for ${member.firstName} has already been updated today.`,
            });
          } else {
            const balanceBefore = member.balance;
            const balanceAfter = balanceBefore.minus(balanceDeduct);

            const shouldIncrementDays = newDaysCount === null;
            const finalDaysCount = shouldIncrementDays ? member.daysCount + 1 : newDaysCount;

            await tx.member.update({
              where: { id: member.id },
              data: {
                balance: balanceAfter,
                daysCount: finalDaysCount,
              },
            });

            await tx.balanceAdjustment.create({
              data: {
                memberId: member.id,
                encodedById: actor.id,
                type: BalanceUpdateType.DEDUCT,
                amount: balanceDeduct,
                balanceBefore,
                balanceAfter,
                createdAt: adjustmentDate,
              },
            });

            if (shouldIncrementDays) {
              update.daysCount = String(finalDaysCount);
            }

            if (finalDaysCount >= 40) {
              warnings.push({
                memberId: member.id,
                message: `${member.firstName} ${member.lastName} has reached ${finalDaysCount} days.`,
              });

              await createAuditLog(tx, {
                actorUserId: actor.id,
                action: "MEMBER_REACHED_40_DAYS",
                entityType: "Member",
                entityId: member.id,
                metadata: { daysCount: finalDaysCount },
                request,
              });
            }
          }
        }

        if (savingsIncrease > 0) {
          const alreadyUpdated = await tx.savingsAdjustment.findFirst({
            where: {
              memberId: member.id,
              createdAt: { gte: startOfToday },
            },
          });

          if (alreadyUpdated) {
            await createAuditLog(tx, {
              actorUserId: actor.id,
              action: "ATTEMPT_MULTIPLE_SAVINGS_UPDATE",
              entityType: "Member",
              entityId: member.id,
              metadata: { attempt: savingsIncrease, memberName: `${member.firstName} ${member.lastName}` },
              request,
            });
            errors.push({
              memberId: member.id,
              type: "savings",
              message: `Savings for ${member.firstName} has already been updated today.`,
            });
          } else {
            const savingsBefore = member.savings;
            const savingsAfter = savingsBefore.plus(savingsIncrease);

            await tx.member.update({
              where: { id: member.id },
              data: { savings: savingsAfter },
            });

            await tx.savingsAdjustment.create({
              data: {
                memberId: member.id,
                encodedById: actor.id,
                type: SavingsUpdateType.INCREASE,
                amount: savingsIncrease,
                savingsBefore,
                savingsAfter,
                createdAt: adjustmentDate,
              },
            });
          }
        }

        if (activeReleaseAmount > 0) {
          await (tx as any).activeRelease.create({
            data: {
              memberId: member.id,
              amount: activeReleaseAmount,
              releaseDate: adjustmentDate,
            },
          });

          await createAuditLog(tx, {
            actorUserId: actor.id,
            action: "ACTIVE_RELEASE_CREATE",
            entityType: "Member",
            entityId: member.id,
            metadata: { amount: activeReleaseAmount, releaseDate: adjustmentDate.toISOString() },
            request,
          });
        }

        if (newDaysCount !== null && newDaysCount !== member.daysCount) {
          await tx.member.update({
            where: { id: member.id },
            data: { daysCount: newDaysCount },
          });
        }

        if (
          (balanceDeduct > 0 ||
            savingsIncrease > 0 ||
            newDaysCount !== null ||
            activeReleaseAmount > 0) &&
          !errors.some((e) => e.memberId === member.id)
        ) {
          await createAuditLog(tx, {
            actorUserId: actor.id,
            action: "MEMBER_BULK_UPDATE",
            entityType: "Member",
            entityId: member.id,
            metadata: { balanceDeduct, savingsIncrease, daysCount: newDaysCount },
            request,
          });
        }
      });
    }

    return NextResponse.json({ success: errors.length === 0, errors, warnings });
  } catch (error) {
    console.error("Error performing bulk update:", error);
    return NextResponse.json({ error: "Failed to perform bulk update" }, { status: 500 });
  }
}
