import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const balanceCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM "balance_adjustments"
    WHERE EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Manila') IN (0, 6);
  `;

  const savingsCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM "savings_adjustments"
    WHERE EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Manila') IN (0, 6);
  `;

  console.log('Remaining weekend balance adjustments:', balanceCount);
  console.log('Remaining weekend savings adjustments:', savingsCount);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
