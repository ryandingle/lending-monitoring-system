import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = "admin";
  const encoderUsername = "encoder";

  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const encoderPasswordHash = await bcrypt.hash("encoder123", 10);

  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      passwordHash: adminPasswordHash,
    },
    create: {
      username: adminUsername,
      email: "admin@example.com",
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      passwordHash: adminPasswordHash,
    },
  });

  await prisma.user.upsert({
    where: { username: encoderUsername },
    update: {
      name: "Encoder",
      role: Role.ENCODER,
      passwordHash: encoderPasswordHash,
    },
    create: {
      username: encoderUsername,
      email: "encoder@example.com",
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

