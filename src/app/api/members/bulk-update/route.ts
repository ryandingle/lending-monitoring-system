import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { getManilaBusinessDate, getManilaDateRange, formatDateYMD } from "@/lib/date";

export async function POST(req: NextRequest) {
  const actor = await requireUser();
  if (!hasRole(actor, [Role.SUPER_ADMIN, Role.ENCODER])) {
    return NextResponse.json(
      { error: "Your role is not allowed to do this action" },
      { status: 403 },
    );
  }

  const { updates } = await req.json();

  const request = await tryGetAuditRequestContext();
  const businessDate = getManilaBusinessDate();
  const todayStr = formatDateYMD(businessDate);
  const todayRange = getManilaDateRange(todayStr, todayStr);

  const errors: { memberId: string; message: string; type: "balance" | "savings" | "processingFee" }[] = [];
  const warnings: { memberId: string; message: string }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const member = await tx.member.findUnique({
        where: { id: update.memberId },
        select: { id: true, firstName: true, lastName: true, balance: true, savings: true, daysCount: true },
      });
      if (!member) continue;

      const balanceDeduct = parseFloat(update.balanceDeduct) || 0;
      const savingsIncrease = parseFloat(update.savingsIncrease) || 0;
      const processingFee = parseFloat(update.processingFee) || 0;
      const passbookFee = parseFloat(update.passbookFee) || 0;
      const membershipFee = parseFloat(update.membershipFee) || 0;
      const newDaysCount = update.daysCount !== "" ? parseInt(update.daysCount) : null;
      const noteContent = update.notes?.trim() || "";

      if (noteContent !== "") {
        await (tx as any).memberNote.create({
          data: {
            memberId: member.id,
            content: noteContent,
            createdAt: businessDate,
          },
        });
      }

      if (processingFee > 0) {
        await (tx as any).processingFee.create({
          data: {
            memberId: member.id,
            encodedById: actor.id,
            amount: processingFee,
            createdAt: businessDate,
          },
        });
      }

      if (passbookFee > 0) {
        await (tx as any).passbookFee.create({
          data: {
            memberId: member.id,
            encodedById: actor.id,
            amount: passbookFee,
            createdAt: businessDate,
          },
        });
      }

      if (membershipFee > 0) {
        await (tx as any).membershipFee.create({
          data: {
            memberId: member.id,
            encodedById: actor.id,
            amount: membershipFee,
            createdAt: businessDate,
          },
        });
      }

      if (balanceDeduct > 0) {
        const alreadyUpdated = await tx.balanceAdjustment.findFirst({
          where: {
            memberId: member.id,
            createdAt: { gte: todayRange.from, lte: todayRange.to },
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
            message: `Balance for ${member.firstName} has already been updated today.`
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
              type: "DEDUCT",
              amount: balanceDeduct,
              balanceBefore,
              balanceAfter,
              createdAt: businessDate,
            },
          });

          if (shouldIncrementDays) {
            update.daysCount = String(finalDaysCount);
          }
          
          if (finalDaysCount >= 40) {
            warnings.push({
              memberId: member.id,
              message: `${member.firstName} ${member.lastName} has reached ${finalDaysCount} days.`
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
            createdAt: { gte: todayRange.from, lte: todayRange.to },
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
            message: `Savings for ${member.firstName} has already been updated today.`
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
              type: "INCREASE",
              amount: savingsIncrease,
              savingsBefore,
              savingsAfter,
              createdAt: businessDate,
            },
          });
        }
      }

      if (newDaysCount !== null && newDaysCount !== member.daysCount) {
        await tx.member.update({
          where: { id: member.id },
          data: { daysCount: newDaysCount },
        });
      }

      if ((balanceDeduct > 0 || savingsIncrease > 0 || processingFee > 0 || passbookFee > 0 || membershipFee > 0 || newDaysCount !== null || noteContent !== "") && !errors.some(e => e.memberId === member.id)) {
        await createAuditLog(tx, {
          actorUserId: actor.id,
          action: "MEMBER_BULK_UPDATE",
          entityType: "Member",
          entityId: member.id,
          metadata: { balanceDeduct, savingsIncrease, processingFee, passbookFee, membershipFee, daysCount: newDaysCount, hasNotes: noteContent !== "" },
          request,
        });
      }
    }
  });

  return NextResponse.json({ success: errors.length === 0, errors, warnings });
}
