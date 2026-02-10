
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const startDate = new Date('2026-02-02T00:00:00Z');
  const endDate = new Date('2026-02-13T23:59:59.999Z');

  console.log('Querying from', startDate, 'to', endDate);

  const dailyAccruals = await prisma.$queryRaw`
            SELECT 
                TO_CHAR("createdAt", 'MM-DD') AS "day",
                COALESCE(SUM("amount"), 0)::float8 AS "total"
            FROM "savings_adjustments"
            WHERE "type" = 'INCREASE'
              AND "createdAt" >= ${startDate}
              AND "createdAt" <= ${endDate}
            GROUP BY 1
            ORDER BY 1 ASC
        `;

  console.log('Daily Accruals Result:');
  console.log(JSON.stringify(dailyAccruals, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
