import dotenv from "dotenv";
dotenv.config();

import { getQuotes, getQuote, getPriceHistory } from "../services/schwab-client.js";

async function test() {
  console.log("Testing Schwab integration...\n");

  // Test batch quotes
  console.log("1. Batch quotes for AAPL, TSLA, MSFT:");
  const quotes = await getQuotes(["AAPL", "TSLA", "MSFT"]);
  for (const [sym, data] of Object.entries(quotes)) {
    const q = data.quote;
    console.log(`   ${sym}: $${q?.lastPrice} (${q?.netChange > 0 ? "+" : ""}${q?.netChangePercent?.toFixed(2)}%)`);
  }

  // Test single quote (should use batch under the hood)
  console.log("\n2. Single quote for AAPL:");
  const single = await getQuote("AAPL");
  console.log(`   AAPL: $${single?.quote?.lastPrice}`);

  // Test price history
  console.log("\n3. Price history for AAPL (last 5 days):");
  const hist = await getPriceHistory("AAPL", { periodType: "day", period: 5, frequencyType: "minute", frequency: 30 });
  console.log(`   Candles: ${hist.candles?.length}`);
  console.log(`   First: ${JSON.stringify(hist.candles?.[0])}`);
  console.log(`   Last:  ${JSON.stringify(hist.candles?.[hist.candles.length - 1])}`);

  console.log("\n✅ All tests passed!");
}

test().catch((e) => {
  console.error("❌ Test failed:", e.message);
  process.exit(1);
});
