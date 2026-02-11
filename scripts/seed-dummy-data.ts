
import { PrismaClient, BalanceUpdateType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding dummy data...");

  // 1. Get Admin
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) throw new Error("Admin not found. Run basic seed first.");

  // 2. Create Employees
  const employees = await prisma.employee.createManyAndReturn({
    data: [
      { firstName: "Juan", lastName: "Dela Cruz", position: "COLLECTION_OFFICER" },
      { firstName: "Maria", lastName: "Santos", position: "COLLECTION_OFFICER" },
    ]
  });

  // 3. Create Groups
  const group1 = await prisma.group.create({
    data: {
      name: "North Sector A",
      description: "Barangay 1-10",
      createdById: admin.id,
      collectionOfficerId: employees[0].id
    }
  });

  const group2 = await prisma.group.create({
    data: {
      name: "South Sector B",
      description: "Barangay 11-20",
      createdById: admin.id,
      collectionOfficerId: employees[1].id
    }
  });

  // 4. Create Members
  const membersData = [];
  for (let i = 1; i <= 20; i++) {
    membersData.push({
      firstName: `Member`,
      lastName: `${i}`,
      balance: 5000 + (i * 1000),
      savings: 100 + (i * 50),
      groupId: i % 2 === 0 ? group1.id : group2.id
    });
  }
  
  const members = await prisma.member.createManyAndReturn({ data: membersData });

  // 5. Create Transactions (Backdated)
  const adjustments = [];
  const today = new Date();
  
  for (const member of members) {
    // 3 transactions per member over last week
    for (let d = 1; d <= 3; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      
      adjustments.push({
        memberId: member.id,
        encodedById: admin.id,
        type: BalanceUpdateType.DEDUCT,
        amount: 500,
        balanceBefore: member.balance.toNumber() + 500,
        balanceAfter: member.balance.toNumber(),
        createdAt: date
      });
    }
  }

  await prisma.balanceAdjustment.createMany({ data: adjustments });

  console.log("Seeding complete: Employees, Groups, Members, and Transactions added.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
