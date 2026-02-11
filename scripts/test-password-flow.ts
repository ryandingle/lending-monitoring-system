import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const username = "testuser_pw_check";
  const initialPassword = "password123";
  const newPassword1 = "password456"; // Admin reset
  const newPassword2 = "password789"; // Self update

  console.log("Cleaning up old test user...");
  await prisma.user.deleteMany({ where: { username } });

  // 1. Create User
  console.log("Creating user...");
  const passwordHash = await hashPassword(initialPassword);
  const user = await prisma.user.create({
    data: {
      username,
      name: "Test User",
      role: "ENCODER",
      passwordHash,
      isActive: true,
    },
  });

  // 2. Verify Login
  console.log("Verifying initial login...");
  const valid1 = await verifyPassword(initialPassword, user.passwordHash);
  console.log(`Initial login valid: ${valid1}`);
  if (!valid1) throw new Error("Initial login failed");

  // 3. Simulate Admin Reset (Users Module)
  console.log("Simulating Admin Reset...");
  const hash1 = await hashPassword(newPassword1);
  const updated1 = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash1 },
  });

  // 4. Verify Login with New Password
  console.log("Verifying login after Admin Reset...");
  const valid2 = await verifyPassword(newPassword1, updated1.passwordHash);
  console.log(`Login after Admin Reset valid: ${valid2}`);
  if (!valid2) throw new Error("Login after Admin Reset failed");

  // 5. Simulate Self Update (Account Module)
  console.log("Simulating Self Update...");
  // First verify old password (backend logic)
  const currentCheck = await verifyPassword(newPassword1, updated1.passwordHash);
  if (!currentCheck) throw new Error("Current password check failed in Account Module logic");

  const hash2 = await hashPassword(newPassword2);
  const updated2 = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash2 },
  });

  // 6. Verify Login with New Password
  console.log("Verifying login after Self Update...");
  const valid3 = await verifyPassword(newPassword2, updated2.passwordHash);
  console.log(`Login after Self Update valid: ${valid3}`);
  if (!valid3) throw new Error("Login after Self Update failed");

  console.log("ALL TESTS PASSED");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
