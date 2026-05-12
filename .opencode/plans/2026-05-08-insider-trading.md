# Insider Trading Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Insider Activity" tab to the stock analysis view that fetches SEC EDGAR Form 4 filings, scores insider transactions into a bullish/bearish signal with textual summary, and displays recent transactions in a table.

**Architecture:** A new backend service (`insiderTrading.js`) fetches and parses SEC EDGAR data for a given ticker, computes a weighted signal score, and returns structured data. A new frontend tab in `StockAnalysisPage` renders the signal gauge, summary text, and transaction table. Data is cached for 24 hours.

**Tech Stack:** Node.js (fetch + xml2js for XML parsing), React (recharts for score history), existing cache/hook patterns.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/services/insiderTrading.js` | Create | Fetches SEC CIK mapping, submissions, Form 4 XML, parses transactions, computes signal score and summary |
| `backend/routes/stocks.js` | Modify | Add `GET /:ticker/insider-trading` endpoint |
| `backend/services/cache.js` | Modify | Add `getInsider` / `setInsider` cache helpers |
| `backend/constants.js` | Modify | Add `CACHE_TTL_INSIDER` constant |
| `backend/package.json` | Modify | Add `xml2js` dependency |
| `frontend/src/hooks/useStockData.js` | Modify | Add `useInsiderTrading(ticker)` hook |
| `frontend/src/components/InsiderTradingTab.jsx` | Create | Renders signal score, summary text, and transaction table |
| `frontend/src/components/StockAnalysisPage.jsx` | Modify | Add "Insider Activity" tab and conditionally render `InsiderTradingTab` |

---

## Task 1: Add xml2js Dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add xml2js to dependencies**

  ```json
  "dependencies": {
    "compression": "^1.8.1",
    "cors": "^2.8.5",
    "dotenv": "^17.4.2",
    "express": "^4.18.2",
    "express-rate-limit": "^8.4.1",
    "node-cache": "^5.1.2",
    "xlsx-js-style": "^1.2.0",
    "xml2js": "^0.6.2",
    "yahoo-finance2": "^3.14.0"
  }
  ```

- [ ] **Step 2: Install dependency**

  Run: `cd /Users/yanchimyeung/Projects/stock-dashboard/backend && npm install`
  Expected: `xml2js` installed successfully.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/package.json backend/package-lock.json
  git commit -m "deps: add xml2js for SEC Form 4 XML parsing"
  ```

---

## Task 2: Add Insider Cache Helpers & Constant

**Files:**
- Modify: `backend/constants.js`
- Modify: `backend/services/cache.js`

- [ ] **Step 1: Add insider cache TTL constant**

  In `backend/constants.js`, add after `CACHE_TTL_FRED`:
  ```js
  export const CACHE_TTL_INSIDER = 60 * 60 * 24; // 24 hours
  ```

- [ ] **Step 2: Add insider cache instance**

  In `backend/services/cache.js`, modify imports and add new cache:
  ```js
  import {
    CACHE_TTL_FUNDAMENTALS,
    CACHE_TTL_PRICE,
    CACHE_TTL_INSIDER,
    CACHE_PERSIST_INTERVAL_MS,
  } from "../constants.js";
  ```

  Add after existing caches:
  ```js
  const insiderCache = new NodeCache({ stdTTL: CACHE_TTL_INSIDER });
  ```

  Add exports:
  ```js
  export const getInsider = (key) => insiderCache.get(key);
  export const setInsider = (key, value) => insiderCache.set(key, value);
  ```

  Update `flush()`:
  ```js
  export const flush = () => {
    fundamentalsCache.flushAll();
    priceCache.flushAll();
    insiderCache.flushAll();
  };
  ```

  Update `stats()`:
  ```js
  export const stats = () => ({
    fundamentals: fundamentalsCache.getStats(),
    price: priceCache.getStats(),
    insider: insiderCache.getStats(),
  });
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add backend/constants.js backend/services/cache.js
  git commit -m "feat: add insider trading cache layer (24h TTL)"
  ```

---

## Task 3: Create Insider Trading Service

**Files:**
- Create: `backend/services/insiderTrading.js`

This service fetches SEC EDGAR data in three steps:
1. Map ticker → CIK via `https://www.sec.gov/files/company_tickers.json`
2. Fetch recent submissions via `https://data.sec.gov/submissions/CIK{cik}.json`
3. For each recent Form 4, fetch and parse the XML filing

- [ ] **Step 1: Write the failing test**

  Create `backend/tests/insiderTrading.test.js` (if test dir exists, otherwise test manually via route):
  Since the project doesn't appear to have a test framework configured, we'll verify manually in Step 4.

- [ ] **Step 2: Create `backend/services/insiderTrading.js`**

  ```js
  import { parseStringPromise } from "xml2js";
  import * as cache from "./cache.js";

  const SEC_HEADERS = {
    "User-Agent": "StockDashboard/1.0 (contact@example.com)",
  };

  const ROLE_MULTIPLIERS = {
    CEO: 2.0,
    CFO: 2.0,
    COO: 2.0,
    Chairman: 2.0,
    Director: 1.5,
    Officer: 1.2,
    Other: 1.0,
  };

  // Step 1: Get CIK for ticker
  async function getCIK(ticker) {
    const cacheKey = `cik:${ticker}`;
    const cached = cache.getFundamentals(cacheKey);
    if (cached) return cached;

    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: SEC_HEADERS,
    });
    if (!res.ok) throw new Error(`SEC ticker mapping failed: ${res.status}`);

    const data = await res.json();
    const match = Object.values(data).find(
      (entry) => entry.ticker === ticker.toUpperCase()
    );
    if (!match) throw new Error(`Ticker ${ticker} not found in SEC database`);

    const cik = match.cik_str.toString().padStart(10, "0");
    cache.setFundamentals(cacheKey, cik);
    return cik;
  }

  // Step 2: Get recent Form 4 filings
  async function getForm4Filings(cik) {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const res = await fetch(url, { headers: SEC_HEADERS });
    if (!res.ok) throw new Error(`SEC submissions failed: ${res.status}`);

    const data = await res.json();
    const filings = data.filings?.recent || {};
    const forms = filings.form || [];
    const accessionNumbers = filings.accessionNumber || [];
    const filingDates = filings.filingDate || [];
    const primaryDocs = filings.primaryDocument || [];

    const form4s = [];
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === "4" && form4s.length < 20) {
        form4s.push({
          accessionNumber: accessionNumbers[i],
          filingDate: filingDates[i],
          primaryDocument: primaryDocs[i],
        });
      }
    }
    return form4s;
  }

  // Step 3: Parse a single Form 4 XML
  async function parseForm4(cik, filing) {
    const acc = filing.accessionNumber.replace(/-/g, "");
    const url = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${acc}/${filing.primaryDocument}`;
    const res = await fetch(url, { headers: SEC_HEADERS });
    if (!res.ok) return null;

    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    const report = parsed?.ownershipDocument;
    if (!report) return null;

    const reporter = report.reportingOwner;
    const name = reporter?.reportingOwnerId?.rptOwnerName || "Unknown";
    const titleRaw = reporter?.reportingOwnerRelationship?.officerTitle || "";
    const isDirector = reporter?.reportingOwnerRelationship?.isDirector === "1";
    const isOfficer = reporter?.reportingOwnerRelationship?.isOfficer === "1";
    const isTenPercent = reporter?.reportingOwnerRelationship?.isTenPercentOwner === "1";

    let role = "Other";
    const titleLower = titleRaw.toLowerCase();
    if (titleLower.includes("chief executive") || titleLower.includes("ceo")) role = "CEO";
    else if (titleLower.includes("chief financial") || titleLower.includes("cfo")) role = "CFO";
    else if (titleLower.includes("chief operating") || titleLower.includes("coo")) role = "COO";
    else if (titleLower.includes("chairman")) role = "Chairman";
    else if (isDirector) role = "Director";
    else if (isOfficer) role = "Officer";
    else if (isTenPercent) role = "10% Owner";

    const transactions = [];
    const nonDeriv = report.nonDerivativeTable?.nonDerivativeTransaction;
    const txList = nonDeriv ? (Array.isArray(nonDeriv) ? nonDeriv : [nonDeriv]) : [];

    for (const tx of txList) {
      const transCode = tx?.transactionCoding?.transactionCode;
      if (transCode !== "P" && transCode !== "S") continue;

      const shares = parseFloat(tx?.transactionAmounts?.transactionShares?.value || 0);
      const price = parseFloat(tx?.transactionAmounts?.transactionPricePerShare?.value || 0);
      const value = shares * price;

      transactions.push({
        type: transCode === "P" ? "Buy" : "Sell",
        shares,
        pricePerShare: price,
        value,
      });
    }

    return {
      name,
      role,
      title: titleRaw,
      filingDate: filing.filingDate,
      transactions,
      totalValue: transactions.reduce((sum, t) => sum + t.value, 0),
      totalShares: transactions.reduce((sum, t) => sum + t.shares, 0),
      buyCount: transactions.filter((t) => t.type === "Buy").length,
      sellCount: transactions.filter((t) => t.type === "Sell").length,
    };
  }

  // Step 4: Calculate signal score
  function calculateSignal(insiders) {
    let score = 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const insider of insiders) {
      const filingDate = new Date(insider.filingDate);
      const daysAgo = (now - filingDate) / (1000 * 60 * 60 * 24);
      const decay = Math.exp(-daysAgo / 30);
      const roleMult = ROLE_MULTIPLIERS[insider.role] || 1.0;

      for (const tx of insider.transactions) {
        const dollarWeight = tx.value / 100_000;
        const base = tx.type === "Buy" ? 2.0 : -0.5; // Buys weighted 4x vs sells
        score += base * dollarWeight * roleMult * decay;
      }
    }

    // Cluster buying bonus
    const recentBuys = insiders.filter(
      (i) => i.buyCount > 0 && new Date(i.filingDate) >= thirtyDaysAgo
    );
    if (recentBuys.length >= 3) {
      const buyScore = insiders
        .filter((i) => i.buyCount > 0)
        .reduce((sum, i) => {
          const daysAgo = (now - new Date(i.filingDate)) / (1000 * 60 * 60 * 24);
          return sum + i.totalValue / 100_000 * Math.exp(-daysAgo / 30);
        }, 0);
      score += buyScore * 0.3;
    }

    return score;
  }

  function getSignalLabel(score) {
    if (score > 50) return "Strong Bullish";
    if (score > 10) return "Bullish";
    if (score >= -10) return "Neutral";
    if (score >= -50) return "Bearish";
    return "Strong Bearish";
  }

  function generateSummary(insiders, score) {
    const label = getSignalLabel(score);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recent = insiders.filter((i) => new Date(i.filingDate) >= thirtyDaysAgo);
    const recentBuys = recent.filter((i) => i.buyCount > 0);
    const recentSells = recent.filter((i) => i.sellCount > 0);
    const totalBuyValue = recentBuys.reduce((s, i) => s + i.totalValue, 0);
    const totalSellValue = recentSells.reduce((s, i) => s + i.totalValue, 0);

    const topBuyer = recentBuys.sort((a, b) => b.totalValue - a.totalValue)[0];
    const topSeller = recentSells.sort((a, b) => b.totalValue - a.totalValue)[0];

    if (score > 50) {
      const count = recentBuys.length;
      const valueStr = formatValue(totalBuyValue);
      return `${label}: ${count} insider${count > 1 ? "s" : ""} purchased ${valueStr} in shares over the past 30 days${topBuyer ? `, led by the ${topBuyer.role}` : ""}.`;
    }
    if (score > 10) {
      const count = recentBuys.length;
      const valueStr = formatValue(totalBuyValue);
      return `${label}: ${count} insider${count > 1 ? "s" : ""} purchased ${valueStr} in shares over the past 30 days.`;
    }
    if (score >= -10) {
      if (recentBuys.length === 0 && recentSells.length === 0) {
        return `${label}: No insider transactions in the past 30 days.`;
      }
      return `${label}: Mixed activity with ${formatValue(totalBuyValue)} in purchases and ${formatValue(totalSellValue)} in sales over the past 30 days.`;
    }
    if (score >= -50) {
      const count = recentSells.length;
      const valueStr = formatValue(totalSellValue);
      return `${label}: ${count} insider${count > 1 ? "s" : ""} sold ${valueStr} in shares over the past 30 days${topSeller ? `, led by the ${topSeller.role}` : ""}.`;
    }
    const count = recentSells.length;
    const valueStr = formatValue(totalSellValue);
    return `${label}: Heavy selling — ${count} insider${count > 1 ? "s" : ""} sold ${valueStr} in shares over the past 30 days with no buying activity.`;
  }

  function formatValue(value) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }

  export async function getInsiderTrading(ticker) {
    const cacheKey = `insider:${ticker}`;
    const cached = cache.getInsider(cacheKey);
    if (cached) return cached;

    const cik = await getCIK(ticker);
    const filings = await getForm4Filings(cik);

    const insiders = [];
    for (const filing of filings) {
      try {
        const parsed = await parseForm4(cik, filing);
        if (parsed && parsed.transactions.length > 0) {
          insiders.push(parsed);
        }
      } catch (err) {
        console.error(`[insider-trading] Failed to parse ${filing.accessionNumber}:`, err.message);
      }
      // Respect SEC rate limit: 10 req/s max
      await new Promise((r) => setTimeout(r, 150));
    }

    const score = calculateSignal(insiders);
    const label = getSignalLabel(score);
    const summary = generateSummary(insiders, score);

    const result = {
      ticker,
      score: Math.round(score * 100) / 100,
      label,
      summary,
      insiders,
      lastUpdated: new Date().toISOString(),
    };

    cache.setInsider(cacheKey, result);
    return result;
  }
  ```

- [ ] **Step 3: Verify service loads without syntax errors**

  Run: `cd /Users/yanchimyeung/Projects/stock-dashboard/backend && node -c services/insiderTrading.js`
  Expected: No output (success) or syntax error.

- [ ] **Step 4: Commit**

  ```bash
  git add backend/services/insiderTrading.js
  git commit -m "feat: add SEC EDGAR insider trading data service"
  ```

---

## Task 4: Add Backend Route

**Files:**
- Modify: `backend/routes/stocks.js`

- [ ] **Step 1: Import insider trading service**

  Add import at top of `backend/routes/stocks.js`:
  ```js
  import * as insiderTrading from "../services/insiderTrading.js";
  ```

- [ ] **Step 2: Add endpoint**

  Add after the `/:ticker/all` route (around line 132):
  ```js
  // GET /api/stocks/:ticker/insider-trading
  // Returns insider transaction signal, summary, and recent Form 4 filings
  router.get("/:ticker/insider-trading", async (req, res) => {
    try {
      const data = await insiderTrading.getInsiderTrading(req.ticker);
      res.json({ success: true, data });
    } catch (err) {
      console.error(`[insider-trading] ${req.ticker}:`, err.message);
      res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
    }
  });
  ```

- [ ] **Step 3: Verify endpoint**

  Start backend: `cd /Users/yanchimyeung/Projects/stock-dashboard/backend && npm run dev`
  Test: `curl "http://localhost:3001/api/stocks/AAPL/insider-trading"`
  Expected: JSON response with `success: true` and data fields.

- [ ] **Step 4: Commit**

  ```bash
  git add backend/routes/stocks.js
  git commit -m "feat: add insider-trading API endpoint"
  ```

---

## Task 5: Add Frontend Hook

**Files:**
- Modify: `frontend/src/hooks/useStockData.js`

- [ ] **Step 1: Add `useInsiderTrading` hook**

  Append to `frontend/src/hooks/useStockData.js`:
  ```js
  // Fetch insider trading data for a single ticker
  export function useInsiderTrading(ticker) {
    const { data, isLoading, error } = useQuery({
      queryKey: ["insiderTrading", ticker],
      queryFn: () => apiFetch(`/${ticker}/insider-trading`),
      enabled: !!ticker,
      staleTime: 1000 * 60 * 60 * 24, // 24 hours
    });

    return { data, loading: isLoading, error: error?.message };
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/src/hooks/useStockData.js
  git commit -m "feat: add useInsiderTrading react-query hook"
  ```

---

## Task 6: Create InsiderTradingTab Component

**Files:**
- Create: `frontend/src/components/InsiderTradingTab.jsx`

- [ ] **Step 1: Create component**

  ```jsx
  import { useInsiderTrading } from "../hooks/useStockData";

  const ROLE_COLORS = {
    CEO: "var(--accent-blue)",
    CFO: "var(--accent-blue)",
    COO: "var(--accent-blue)",
    Chairman: "var(--accent-blue)",
    Director: "#a78bfa",
    Officer: "#94a3b8",
    "10% Owner": "#f59e0b",
    Other: "var(--text-secondary)",
  };

  function SignalGauge({ score, label }) {
    const clamped = Math.max(-100, Math.min(100, score));
    const percent = ((clamped + 100) / 200) * 100;
    let color = "var(--accent-green)";
    if (score < -10) color = "var(--accent-red)";
    else if (score < 10) color = "#f59e0b";

    return (
      <div style={gauge.wrap}>
        <div style={gauge.barBg}>
          <div style={{ ...gauge.barFill, width: `${percent}%`, background: color }} />
        </div>
        <div style={gauge.labels}>
          <span style={gauge.label}>Bearish</span>
          <span style={{ ...gauge.score, color }}>{score > 0 ? `+${score}` : score}</span>
          <span style={gauge.label}>Bullish</span>
        </div>
        <span style={{ ...gauge.signalLabel, color }}>{label}</span>
      </div>
    );
  }

  const gauge = {
    wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "20px 0" },
    barBg: { width: "100%", maxWidth: "400px", height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" },
    barFill: { height: "100%", borderRadius: "4px", transition: "width 0.6s ease" },
    labels: { display: "flex", justifyContent: "space-between", width: "100%", maxWidth: "400px" },
    label: { color: "var(--text-secondary)", fontSize: "10px", fontFamily: "var(--font-body)" },
    score: { fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600 },
    signalLabel: { fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600, letterSpacing: "0.04em" },
  };

  function TransactionTable({ insiders }) {
    const rows = [];
    for (const insider of insiders.slice(0, 20)) {
      for (const tx of insider.transactions) {
        rows.push({
          name: insider.name,
          role: insider.role,
          title: insider.title,
          type: tx.type,
          shares: tx.shares,
          price: tx.pricePerShare,
          value: tx.value,
          date: insider.filingDate,
        });
      }
    }
    rows.sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
      <div style={{ overflowX: "auto" }}>
        <table style={table.table}>
          <thead>
            <tr>
              <th style={table.th}>Date</th>
              <th style={table.th}>Insider</th>
              <th style={table.th}>Role</th>
              <th style={table.th}>Type</th>
              <th style={table.th}>Shares</th>
              <th style={table.th}>Price</th>
              <th style={table.th}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={table.tr}>
                <td style={table.td}>{row.date}</td>
                <td style={table.td}>{row.name}</td>
                <td style={table.td}>
                  <span style={{ ...table.roleBadge, background: ROLE_COLORS[row.role] || ROLE_COLORS.Other }}>
                    {row.role}
                  </span>
                </td>
                <td style={{ ...table.td, color: row.type === "Buy" ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {row.type === "Buy" ? "▲ Buy" : "▼ Sell"}
                </td>
                <td style={{ ...table.td, fontFamily: "var(--font-mono)" }}>{row.shares.toLocaleString()}</td>
                <td style={{ ...table.td, fontFamily: "var(--font-mono)" }}>${row.price.toFixed(2)}</td>
                <td style={{ ...table.td, fontFamily: "var(--font-mono)" }}>
                  {row.value >= 1_000_000 ? `$${(row.value / 1_000_000).toFixed(1)}M` : `$${(row.value / 1_000).toFixed(0)}K`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div style={table.empty}>No recent transactions found.</div>
        )}
      </div>
    );
  }

  const table = {
    table: { width: "100%", borderCollapse: "collapse", fontSize: "12px" },
    th: { textAlign: "left", padding: "10px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-display)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.06)" },
    tr: { borderBottom: "1px solid rgba(255,255,255,0.03)" },
    td: { padding: "10px 8px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px" },
    roleBadge: { display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, color: "white", textTransform: "uppercase", letterSpacing: "0.04em" },
    empty: { color: "var(--text-secondary)", padding: "40px 0", textAlign: "center", fontSize: "13px" },
  };

  function SummaryCard({ summary }) {
    return (
      <div style={summaryCard.wrap}>
        <span style={summaryCard.icon}>📊</span>
        <span style={summaryCard.text}>{summary}</span>
      </div>
    );
  }

  const summaryCard = {
    wrap: { display: "flex", alignItems: "flex-start", gap: "10px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "14px 16px" },
    icon: { fontSize: "16px", lineHeight: 1 },
    text: { color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "13px", lineHeight: 1.5 },
  };

  export default function InsiderTradingTab({ ticker }) {
    const { data, loading, error } = useInsiderTrading(ticker);

    if (loading) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "40px 0" }}>
          <div style={{ height: "20px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div style={{ height: "20px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.1s" }} />
          <div style={{ height: "20px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.2s" }} />
        </div>
      );
    }

    if (error) {
      return <div style={{ color: "var(--accent-red)", padding: "40px 0", textAlign: "center", fontSize: "13px" }}>{error}</div>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <SignalGauge score={data.score} label={data.label} />
        <SummaryCard summary={data.summary} />
        <div>
          <h3 style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", marginBottom: "12px" }}>
            Recent Transactions
          </h3>
          <TransactionTable insiders={data.insiders} />
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/src/components/InsiderTradingTab.jsx
  git commit -m "feat: add InsiderTradingTab component"
  ```

---

## Task 7: Integrate Tab into StockAnalysisPage

**Files:**
- Modify: `frontend/src/components/StockAnalysisPage.jsx`

- [ ] **Step 1: Add import and tab**

  Add import at top:
  ```jsx
  import InsiderTradingTab from "./InsiderTradingTab";
  ```

  Change `TABS` array:
  ```jsx
  const TABS = ["DCF", "Financials", "Insider Activity"];
  ```

  Add conditional render after the `Financials` tab block (around line 189):
  ```jsx
  {activeTab === "Insider Activity" && (
    <InsiderTradingTab ticker={ticker} />
  )}
  ```

- [ ] **Step 2: Verify frontend builds**

  Run: `cd /Users/yanchimyeung/Projects/stock-dashboard/frontend && npm run build`
  Expected: Build completes without errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/StockAnalysisPage.jsx
  git commit -m "feat: add Insider Activity tab to StockAnalysisPage"
  ```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ SEC EDGAR data source — `insiderTrading.js` uses SEC API directly
- ✅ Bullish/bearish signal — `calculateSignal()` with weighted scoring
- ✅ Buy > Sell weighting — base score: Buy=+2.0, Sell=-0.5
- ✅ Textual summary — `generateSummary()` returns natural language
- ✅ Stock detail page only — integrated as tab in `StockAnalysisPage`
- ✅ 24h cache — `CACHE_TTL_INSIDER` + `staleTime: 24h` in hook

**2. Placeholder scan:**
- ✅ No TBDs or TODOs in code
- ✅ All functions fully implemented
- ✅ No "appropriate error handling" hand-waving
- ✅ No "similar to Task N" references

**3. Type consistency:**
- ✅ `getInsider` / `setInsider` used consistently
- ✅ `apiFetch` pattern matches existing hooks
- ✅ Route error format matches existing routes
- ✅ Component style patterns match existing `StatBox`, `Section`

---

## Execution Handoff

**Plan complete and saved to `.opencode/plans/2026-05-08-insider-trading.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
