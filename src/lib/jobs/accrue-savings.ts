import { prisma } from "@/lib/db";
import { getManilaToday, formatDateYMD } from "@/lib/date";

/**
 * Idempotent daily savings accrual.
 *
 * Rule: "Upon member creation, the savings will increase every next day 20.00"
 *
 * Implementation:
 * - We store `savingsLastAccruedAt` as a DATE.
 * - When job runs, it accrues from `savingsLastAccruedAt` (or `createdAt::date`) up to CURRENT_DATE (Manila).
 *
 * Running multiple times same day is safe due to:
 * - generate_series ending at CURRENT_DATE
 * - unique constraint on ("memberId","accruedForDate")
 */
export async function accrueSavingsOnce() {
  const incrementStr = process.env.SAVINGS_DAILY_INCREMENT || "20.00";
  const increment = Number(incrementStr);
  if (!Number.isFinite(increment) || increment <= 0) {
    throw new Error(`Invalid SAVINGS_DAILY_INCREMENT: "${incrementStr}"`);
  }

  // Enforce Manila Timezone for the "Effective Date"
  const manilaNow = getManilaToday();
  const todayStr = formatDateYMD(manilaNow);

  const inserted = await prisma.$queryRaw<{ inserted_count: bigint; updated_members: bigint }[]>`
    WITH candidates AS (
      SELECT
        "id" AS member_id,
        COALESCE("savingsLastAccruedAt", "createdAt"::date) AS last_date
      FROM "members"
    ),
    to_insert AS (
      SELECT
        c.member_id,
        gs::date AS accrued_for
      FROM candidates c
      JOIN LATERAL generate_series(c.last_date + interval '1 day', ${todayStr}::date, interval '1 day') gs ON TRUE
      WHERE c.last_date < ${todayStr}::date
    ),
    ins AS (
      INSERT INTO "savings_accruals" ("id", "memberId", "accruedForDate", "amount", "createdAt")
      SELECT gen_random_uuid(), member_id, accrued_for, ${increment}::numeric(14,2), now()
      FROM to_insert
      ON CONFLICT ("memberId", "accruedForDate") DO NOTHING
      RETURNING "memberId"
    ),
    agg AS (
      SELECT "memberId", COUNT(*)::int AS cnt
      FROM ins
      GROUP BY "memberId"
    ),
    upd AS (
      UPDATE "members" m
      SET
        "savings" = m."savings" + (agg.cnt * ${increment})::numeric(14,2),
        "savingsLastAccruedAt" = ${todayStr}::date
      FROM agg
      WHERE m."id" = agg."memberId"
      RETURNING m."id"
    )
    SELECT
      (SELECT COUNT(*) FROM ins)::bigint AS inserted_count,
      (SELECT COUNT(*) FROM upd)::bigint AS updated_members
  `;

  return {
    insertedAccrualRows: Number(inserted?.[0]?.inserted_count ?? 0n),
    updatedMembers: Number(inserted?.[0]?.updated_members ?? 0n),
  };
}




