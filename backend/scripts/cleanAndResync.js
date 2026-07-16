#!/usr/bin/env node

/**
 * Deletes all Filing records (and cascade-deleted Holdings) for curated gurus,
 * then re-fetches everything fresh from SEC EDGAR.
 *
 * This fixes the bug where the old parser stored shares:0 for all holdings,
 * and syncInvestor skipped re-parsing them because the filing already existed.
 */

import prisma from "../services/db.js";
import { syncInvestor, CURATED_INVESTORS } from "../services/sec.js";

async function main() {
  console.log("=== Clean & Resync Curated Gurus ===\n");

  // 1. Look up all investor IDs for curated gurus
  const ciks = CURATED_INVESTORS.map(c => c.CIK.trim().padStart(10, "0"));
  const investors = await prisma.investor.findMany({
    where: { CIK: { in: ciks } },
    select: { id: true, CIK: true, name: true }
  });

  console.log(`Found ${investors.length} curated investors in database.\n`);

  if (investors.length === 0) {
    console.log("No investors found. Nothing to clean.");
    return;
  }

  // 2. Count current holdings/filings before deletion
  const investorIds = investors.map(i => i.id);
  const filingCountBefore = await prisma.filing.count({
    where: { investorId: { in: investorIds } }
  });
  const holdingCountBefore = await prisma.holding.count({
    where: { filing: { investorId: { in: investorIds } } }
  });
  console.log(`Before cleanup: ${filingCountBefore} filings, ${holdingCountBefore} holdings.\n`);

  // 3. Delete all filings for curated investors (Holdings cascade-delete automatically)
  const deleteResult = await prisma.filing.deleteMany({
    where: { investorId: { in: investorIds } }
  });
  console.log(`Deleted ${deleteResult.count} filings (and their cascade-deleted holdings).\n`);

  // 4. Verify cleanup
  const filingCountAfter = await prisma.filing.count({
    where: { investorId: { in: investorIds } }
  });
  console.log(`After cleanup: ${filingCountAfter} filings remaining.\n`);

  // 5. Re-sync all curated investors from SEC EDGAR
  console.log("--- Starting fresh sync from SEC EDGAR ---\n");
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < CURATED_INVESTORS.length; i++) {
    const cur = CURATED_INVESTORS[i];
    const progress = `[${i + 1}/${CURATED_INVESTORS.length}]`;
    console.log(`${progress} Syncing ${cur.name} (CIK: ${cur.CIK})...`);

    try {
      await syncInvestor(cur.CIK);
      console.log(`${progress} ✓ ${cur.name} synced successfully.`);
      successCount++;
    } catch (err) {
      console.error(`${progress} ✗ Failed to sync ${cur.name}: ${err.message}`);
      failCount++;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // 6. Verify final state
  const finalFilingCount = await prisma.filing.count({
    where: { investorId: { in: investorIds } }
  });
  const finalHoldingCount = await prisma.holding.count({
    where: { filing: { investorId: { in: investorIds } } }
  });

  console.log("\n=== Summary ===");
  console.log(`Time elapsed: ${elapsed}s`);
  console.log(`Investors synced: ${successCount} success, ${failCount} failed`);
  console.log(`Final state: ${finalFilingCount} filings, ${finalHoldingCount} holdings`);

  // 7. Quick sanity check: verify no holdings have shares=0 (except intentional)
  const zeroShareHoldings = await prisma.holding.count({
    where: {
      filing: { investorId: { in: investorIds } },
      shares: 0
    }
  });
  if (zeroShareHoldings > 0) {
    console.log(`\n⚠ Warning: ${zeroShareHoldings} holdings still have shares=0 (may be 13D/G filings with unknown shares).`);
  } else {
    console.log(`\n✓ No holdings with shares=0 found — all 13F holdings parsed correctly.`);
  }

  console.log("\n=== Clean & Resync Complete ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
