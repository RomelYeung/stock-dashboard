/**
 * Seed script — creates a default admin user if one does not exist.
 * Runs automatically at server startup.
 */

import prisma from "../services/db.js";
import { hashPassword } from "../services/auth.js";

const ADMIN_EMAIL = "admin@stock-dashboard.local";
const ADMIN_PASSWORD = "ChangeMe123!";

export async function seedAdmin() {
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existing) {
    console.log(`[seed] Admin user already exists: ${ADMIN_EMAIL}`);
    return;
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`[seed] Default admin user created: ${ADMIN_EMAIL}`);
}
