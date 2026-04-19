/**
 * Simple backend smoke tests.
 * Run with: node test.js
 * Make sure the server is running first: npm run dev
 */

const BASE_URL = "http://localhost:3001";
const TEST_TICKER = "AAPL";
const TEST_PORTFOLIO = ["AAPL", "MSFT", "GOOGL"];

let passed = 0;
let failed = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(label, ok, detail = "") {
  const icon = ok ? "✅" : "❌";
  console.log(`  ${icon} ${label}${detail ? " — " + detail : ""}`);
  ok ? passed++ : failed++;
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const json = await res.json();
  return { status: res.status, body: json };
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

function check(label, value, expected) {
  const ok = expected !== undefined ? value === expected : value !== undefined && value !== null;
  log(label, ok, ok ? "" : `got ${JSON.stringify(value)}`);
}

function checkRange(label, value, min, max) {
  const ok = typeof value === "number" && value >= min && value <= max;
  log(label, ok, ok ? `${value.toFixed(2)}` : `got ${value}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testHealth() {
  console.log("\n📋 Health Check");
  const { status, body } = await get("/health");
  check("status 200", status, 200);
  check("status: ok", body.status, "ok");
  check("timestamp present", body.timestamp);
}

async function testSummary() {
  console.log(`\n📋 GET /api/stocks/${TEST_TICKER}/summary`);
  const { status, body } = await get(`/api/stocks/${TEST_TICKER}/summary`);
  check("status 200", status, 200);
  check("success: true", body.success, true);

  const d = body.data;
  check("ticker", d.ticker, TEST_TICKER);
  check("name present", d.name);
  check("currentPrice present", d.currentPrice);
  checkRange("currentPrice is a plausible number", d.currentPrice, 1, 100000);
  check("marketCap present", d.marketCap);
  check("52wk low present", d.fiftyTwoWeekLow);
  check("52wk high present", d.fiftyTwoWeekHigh);
  log(
    "52wk low < high",
    d.fiftyTwoWeekLow < d.fiftyTwoWeekHigh,
    `${d.fiftyTwoWeekLow} < ${d.fiftyTwoWeekHigh}`
  );
}

async function testFinancials() {
  console.log(`\n📋 GET /api/stocks/${TEST_TICKER}/financials`);
  const { status, body } = await get(`/api/stocks/${TEST_TICKER}/financials`);
  check("status 200", status, 200);
  check("success: true", body.success, true);

  const d = body.data;
  check("grossMargins present", d.grossMargins);
  checkRange("grossMargins is 0–1", d.grossMargins, 0, 1);
  check("profitMargins present", d.profitMargins);
  check("returnOnEquity present", d.returnOnEquity);
  check("annualIncome is array", Array.isArray(d.annualIncome));
  log(
    "annualIncome has entries",
    d.annualIncome.length > 0,
    `${d.annualIncome.length} years`
  );
  if (d.annualIncome.length > 0) {
    const year = d.annualIncome[0];
    check("annual entry has totalRevenue", year.totalRevenue);
    check("annual entry has netIncome", year.netIncome);
  }
}

async function testBalanceSheet() {
  console.log(`\n📋 GET /api/stocks/${TEST_TICKER}/balance-sheet`);
  const { status, body } = await get(`/api/stocks/${TEST_TICKER}/balance-sheet`);
  check("status 200", status, 200);
  check("success: true", body.success, true);

  const d = body.data;
  check("totalCash present", d.totalCash);
  check("totalDebt present", d.totalDebt);
  check("currentRatio present", d.currentRatio);
  checkRange("currentRatio > 0", d.currentRatio, 0.01, 100);
  check("annualBalanceSheet is array", Array.isArray(d.annualBalanceSheet));
  check("annualCashFlow is array", Array.isArray(d.annualCashFlow));
}

async function testPriceHistory() {
  console.log(`\n📋 GET /api/stocks/${TEST_TICKER}/price-history?period=3mo`);
  const { status, body } = await get(`/api/stocks/${TEST_TICKER}/price-history?period=3mo`);
  check("status 200", status, 200);
  check("success: true", body.success, true);
  check("data is array", Array.isArray(body.data));
  log("data has entries", body.data.length > 0, `${body.data.length} candles`);
  if (body.data.length > 0) {
    const candle = body.data[0];
    check("candle has date", candle.date);
    check("candle has close", candle.close);
    check("candle has volume", candle.volume);
  }

  // Test invalid period
  console.log(`\n📋 GET /api/stocks/${TEST_TICKER}/price-history?period=invalid`);
  const bad = await get(`/api/stocks/${TEST_TICKER}/price-history?period=invalid`);
  check("invalid period → 400", bad.status, 400);
  check("success: false", bad.body.success, false);
}

async function testAllEndpoint() {
  console.log(`\n📋 GET /api/stocks/${TEST_TICKER}/all`);
  const { status, body } = await get(`/api/stocks/${TEST_TICKER}/all`);
  check("status 200", status, 200);
  check("success: true", body.success, true);
  check("has summary", body.data.summary?.ticker, TEST_TICKER);
  check("has financials", body.data.financials?.ticker, TEST_TICKER);
  check("has balanceSheet", body.data.balanceSheet?.ticker, TEST_TICKER);
}

async function testPortfolio() {
  console.log(`\n📋 POST /api/stocks/portfolio`);
  const { status, body } = await post("/api/stocks/portfolio", { tickers: TEST_PORTFOLIO });
  check("status 200", status, 200);
  check("success: true", body.success, true);
  check("returns all tickers", body.data.length, TEST_PORTFOLIO.length);
  check(`meta.total = ${TEST_PORTFOLIO.length}`, body.meta.total, TEST_PORTFOLIO.length);
  log("all tickers succeeded", body.meta.failed === 0, `${body.meta.succeeded}/${body.meta.total}`);

  // Test validation
  console.log("\n📋 POST /api/stocks/portfolio (validation)");
  const empty = await post("/api/stocks/portfolio", { tickers: [] });
  check("empty tickers → 400", empty.status, 400);

  const tooMany = await post("/api/stocks/portfolio", {
    tickers: Array.from({ length: 21 }, (_, i) => `T${i}`),
  });
  check("21 tickers → 400", tooMany.status, 400);
}

async function testCaching() {
  console.log(`\n📋 Caching (second call should be faster)`);
  const t1 = Date.now();
  await get(`/api/stocks/${TEST_TICKER}/summary`);
  const first = Date.now() - t1;

  const t2 = Date.now();
  await get(`/api/stocks/${TEST_TICKER}/summary`);
  const second = Date.now() - t2;

  log("cached response is faster", second < first, `${first}ms → ${second}ms`);

  const { body } = await get("/api/stocks/cache/stats");
  check("cache stats available", body.success, true);
}

async function test404() {
  console.log("\n📋 404 handling");
  const { status, body } = await get("/api/nonexistent");
  check("unknown route → 404", status, 404);
  check("success: false", body.success, false);
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log("🧪 Stock Dashboard Backend — Smoke Tests");
  console.log(`   Server: ${BASE_URL}`);
  console.log(`   Ticker: ${TEST_TICKER}`);

  try {
    await testHealth();
    await testSummary();
    await testFinancials();
    await testBalanceSheet();
    await testPriceHistory();
    await testAllEndpoint();
    await testPortfolio();
    await testCaching();
    await test404();
  } catch (err) {
    console.error("\n💥 Test runner crashed:", err.message);
    console.error("   Is the server running? → npm run dev");
    process.exit(1);
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("🎉 All tests passed!\n");
  } else {
    console.log("⚠️  Some tests failed — check output above.\n");
    process.exit(1);
  }
}

run();