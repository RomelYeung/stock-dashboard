/**
 * Seed script — creates a default admin user if one does not exist.
 * Runs automatically at server startup.
 */

import { randomBytes } from "node:crypto";
import prisma from "../services/db.js";
import { hashPassword } from "../services/auth.js";

const ADMIN_EMAIL = "admin@stock-dashboard.local";

export async function seedAdmin() {
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existing) {
    console.log(`[seed] Admin user already exists: ${ADMIN_EMAIL}`);
    return;
  }

  const generatedPassword = randomBytes(24).toString("hex");
  const passwordHash = await hashPassword(generatedPassword);

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("");
  console.log("═══════════════════════════════════════════════");
  console.log("  DEFAULT ADMIN ACCOUNT CREATED");
  console.log("───────────────────────────────────────────────");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${generatedPassword}`);
  console.log("═══════════════════════════════════════════════");
  console.log("  ⚠  Save this password now — it will not");
  console.log("     be shown again.");
  console.log("═══════════════════════════════════════════════");
  console.log("");
}
