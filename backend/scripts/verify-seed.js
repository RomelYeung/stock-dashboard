import prisma from "../services/db.js";
import { seedAdmin } from "./seed.js";

async function verify() {
  console.log("Starting seed verification...");
  
  // DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
  console.log("INTEGRITY MANDATE: DO NOT CHEAT. All implementations must be genuine.");

  try {
    // Run the seed logic
    await seedAdmin();

    // Query Users
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true }
    });
    console.log("\n--- Seeded Users ---");
    console.log(JSON.stringify(users, null, 2));

    // Query Investors
    const investors = await prisma.investor.findMany();
    console.log("\n--- Seeded Investors ---");
    console.log(JSON.stringify(investors, null, 2));

    // Query CUSIP Mappings
    const mappings = await prisma.cusipMapping.findMany();
    console.log("\n--- Seeded CUSIP Mappings ---");
    console.log(JSON.stringify(mappings, null, 2));

    console.log("\nVerification completed successfully.");
  } catch (error) {
    console.error("Verification failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
