import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting weekend adjustment migration...");

  // 1. Update Balance Adjustments
  // Logic:
  // If Manila Day is Saturday (6), add 2 days to reach Monday.
  // If Manila Day is Sunday (0), add 1 day to reach Monday.
  const balanceResult = await prisma.$executeRaw`
    UPDATE "balance_adjustments"
    SET "createdAt" = "createdAt" + (
      CASE 
        WHEN EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Manila') = 6 THEN INTERVAL '2 days'
        WHEN EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Manila') = 0 THEN INTERVAL '1 day'
      END
    )
    WHERE EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Manila') IN (0, 6);
  `;
  console.log(`Updated ${balanceResult} balance adjustments from weekends to next Monday.`);

  // 2. Update Savings Adjustments
  const savingsResult = await prisma.$executeRaw`
    UPDATE "savings_adjustments"
    SET "createdAt" = "createdAt" + (
      CASE 
        WHEN EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Manila') = 6 THEN INTERVAL '2 days'
        WHEN EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Manila') = 0 THEN INTERVAL '1 day'
      END
    )
    WHERE EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Manila') IN (0, 6);
  `;
  console.log(`Updated ${savingsResult} savings adjustments from weekends to next Monday.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
