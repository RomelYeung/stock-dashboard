/**
 * Backfill Holding company names from CusipMapping.
 *
 * Iterates over Holding records where companyName is null,
 * looks up the matching CusipMapping by CUSIP, and updates
 * the Holding with the mapped companyName. Skips if the
 * mapped name is empty.
 *
 * Usage: node scripts/backfillHoldingCompanyNames.js
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const holdings = await prisma.holding.findMany({
    where: { companyName: null },
    select: { id: true, CUSIP: true, ticker: true },
  });

  console.log(`Found ${holdings.length} holdings with null companyName.`);

  let updated = 0;
  let skipped = 0;

  for (const h of holdings) {
    if (!h.CUSIP || h.CUSIP === "UNKNOWN") {
      skipped++;
      continue;
    }

    const mapping = await prisma.cusipMapping.findUnique({
      where: { CUSIP: h.CUSIP },
      select: { companyName: true },
    });

    if (mapping && mapping.companyName && mapping.companyName.trim() !== "") {
      await prisma.holding.update({
        where: { id: h.id },
        data: { companyName: mapping.companyName },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
