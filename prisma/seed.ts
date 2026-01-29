import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@example.com";
  const encoderEmail = "encoder@example.com";

  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const encoderPasswordHash = await bcrypt.hash("encoder123", 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      passwordHash: adminPasswordHash,
    },
    create: {
      email: adminEmail,
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      passwordHash: adminPasswordHash,
    },
  });

  await prisma.user.upsert({
    where: { email: encoderEmail },
    update: {
      name: "Encoder",
      role: Role.ENCODER,
      passwordHash: encoderPasswordHash,
    },
    create: {
      email: encoderEmail,
      name: "Encoder",
      role: Role.ENCODER,
      passwordHash: encoderPasswordHash,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

