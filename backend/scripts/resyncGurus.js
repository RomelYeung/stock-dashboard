#!/usr/bin/env node

import { syncInvestor, CURATED_INVESTORS } from "../services/sec.js";

async function main() {
  console.log(`=== SEC Guru Resync ===`);
  console.log(`Found ${CURATED_INVESTORS.length} curated investors to sync.\n`);

  const startTime = Date.now();

  for (let i = 0; i < CURATED_INVESTORS.length; i++) {
    const cur = CURATED_INVESTORS[i];
    const progress = `[${i + 1}/${CURATED_INVESTORS.length}]`;
    console.log(`${progress} Syncing ${cur.name} (CIK: ${cur.CIK})...`);

    try {
      await syncInvestor(cur.CIK);
      console.log(`${progress} ✓ ${cur.name} synced successfully.`);
    } catch (err) {
      console.error(`${progress} ✗ Failed to sync ${cur.name}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Resync Complete ===`);
  console.log(`Processed ${CURATED_INVESTORS.length} investors in ${elapsed}s.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
