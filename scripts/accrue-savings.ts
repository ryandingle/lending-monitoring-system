import { prisma } from "../src/lib/db";
import { accrueSavingsOnce } from "../src/lib/jobs/accrue-savings";

/**
 * Idempotent daily savings accrual.
 *
 * Rule: "Upon member creation, the savings will increase every next day 20.00"
 *
 * Implementation:
 * - We store `savingsLastAccruedAt` as a DATE.
 * - When job runs, it accrues `diffDays = CURRENT_DATE - COALESCE(savingsLastAccruedAt, created_at::date)`.
 * - If diffDays > 0, savings += diffDays * increment and `savingsLastAccruedAt = CURRENT_DATE`.
 *
 * Running multiple times same day is safe: diffDays becomes 0.
 */
// NOTE: logic moved to src/lib/jobs/accrue-savings.ts so it can be reused by the API.

async function main() {
  const result = await accrueSavingsOnce();
  // eslint-disable-next-line no-console
  console.log(
    `[lms] accrue-savings inserted rows: ${result.insertedAccrualRows}, updated members: ${result.updatedMembers}`
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

