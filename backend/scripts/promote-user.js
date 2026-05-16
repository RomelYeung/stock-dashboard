/**
 * Script to promote a user to ADMIN role.
 * Usage: node scripts/promote-user.js <email>
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: node scripts/promote-user.js <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    console.log(`User ${email} is already an ADMIN.`);
    await prisma.$disconnect();
    return;
  }

  await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
  });

  console.log(`User ${email} has been promoted to ADMIN.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
