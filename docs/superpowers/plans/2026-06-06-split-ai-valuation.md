# Split AI Valuation from DCF Endpoint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the slow AI valuation call from the fast DCF math so the DCF/Monte Carlo renders immediately while the AI opinion loads in parallel.

**Architecture:** Add a new `/api/stocks/:ticker/valuation/ai` endpoint for the AI call, update `DCFAnalysis.jsx` to fetch math and AI independently via separate hooks, and prefetch both in `StockAnalysisPage.jsx`. The existing `/valuation` endpoint keeps returning DCF+AI for backward compatibility but the frontend stops using it for the combined fetch.

**Tech Stack:** Express, React, TanStack Query, Zod

---

### Task 1: Split valuation endpoint and add `/api/stocks/:ticker/valuation/ai`

**Files:**
- Modify: `backend/routes/stocks.js:293-383`

The existing `/:ticker/valuation` endpoint (line 293) calls `evaluateAIValuation` synchronously at line 347. We need to:
1. Remove the `evaluateAIValuation` call and `aiValuation` field from the existing `/:ticker/valuation` response
2. Add a new route `/:ticker/valuation/ai` that runs only the AI valuation

- [ ] **Step 1: Remove AI valuation from the existing `/valuation` endpoint**

In the `/:ticker/valuation` handler, delete these lines (346-349):

```js
    // ── AI Valuation ──
    const aiValuation = evaluateAIValuation({
      ticker: req.ticker, summary, financials, balanceSheet, priceHistory, optionChain, insiderData
    });
```

Then remove `aiValuation,` from the response object (line 375). The response `data` should no longer include the `aiValuation` key. Also remove the unused imports from `Promise.all` — the `priceHistory`, `optionChain`, and `insiderData` fetches are only needed for the AI valuation, so remove them from the `Promise.all` array on lines 296-303. The updated Promise.all becomes:

```js
    const [summary, financials, balanceSheet] = await Promise.all([
      yf.getSummary(req.ticker),
      yf.getFinancials(req.ticker),
      yf.getBalanceSheet(req.ticker),
    ]);
```

And update the response to remove the `aiValuation` field:

```js
    res.json({
      success: true,
      data: {
        ticker: req.ticker,
        params: { /* ...unchanged... */ },
        dcf: dcfResult,
        monteCarlo: mcResult,
        warning: dcfWarning || undefined,
      },
    });
```

- [ ] **Step 2: Add the new `/valuation/ai` endpoint after the existing `/valuation` route**

Insert after the closing of the `/:ticker/valuation` route (after the `});` on line 383):

```js
// GET /api/stocks/:ticker/valuation/ai
// Returns only the AI valuation (DDM, RIM, quant checks) — runs independently of DCF
router.get("/:ticker/valuation/ai", dcfRateLimiter, async (req, res) => {
  try {
    const [summary, financials, balanceSheet, priceHistory, optionChain, insiderData] = await Promise.all([
      yf.getSummary(req.ticker).catch(() => null),
      yf.getFinancials(req.ticker).catch(() => null),
      yf.getBalanceSheet(req.ticker).catch(() => null),
      yf.getPriceHistory(req.ticker, "1y").catch(() => null),
      getOptionChain(req.ticker, {}).catch(() => null),
      insiderTrading.getInsiderTrading(req.ticker).catch(() => null)
    ]);

    const aiValuation = evaluateAIValuation({
      ticker: req.ticker, summary, financials, balanceSheet, priceHistory, optionChain, insiderData
    });

    res.json({ success: true, data: aiValuation });
  } catch (err) {
    console.error(`[valuation/ai] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});
```

- [ ] **Step 3: Verify backend starts without errors**

Run: `node backend/server.js` (or whatever the start command is) and confirm no syntax errors. If the server is already running, just check for import errors.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/stocks.js
git commit -m "feat: split AI valuation into separate /valuation/ai endpoint"
```

---

### Task 2: Add `useAIOpinion` hook and `prefetchAIOpinion` in frontend

**Files:**
- Modify: `frontend/src/hooks/useStockData.js:273-293`

The existing `useAIValuation` hook (line 284) calls `/${ticker}/ai-valuation`. We'll add a new `useAIOpinion` hook that calls the new `/${ticker}/valuation/ai` endpoint, and a corresponding `prefetchAIOpinion`.

- [ ] **Step 1: Add `useAIOpinion` hook after `useAIValuation`**

Insert after line 293 (end of `useAIValuation`):

```js
// Fetch AI valuation opinion (DDM, RIM, quant checks) for the valuation/ai tab
export function useAIOpinion(ticker) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aiOpinion", ticker],
    queryFn: () => apiFetch(`/${ticker}/valuation/ai`),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  return { data, loading: isLoading, error: error?.message, refetch };
}
```

- [ ] **Step 2: Add `prefetchAIOpinion` after `prefetchValuation`**

Insert after line 493 (end of `prefetchValuation`):

```js
// Prefetch AI opinion so it's ready when the Valuation & AI tab renders
export function prefetchAIOpinion(queryClient, ticker) {
  if (!ticker) return;
  return queryClient.prefetchQuery({
    queryKey: ["aiOpinion", ticker],
    queryFn: () => apiFetch(`/${ticker}/valuation/ai`),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useStockData.js
git commit -m "feat: add useAIOpinion hook and prefetchAIOpinion"
```

---

### Task 3: Update `DCFAnalysis.jsx` to fetch math and AI independently

**Files:**
- Modify: `frontend/src/components/DCFAnalysis.jsx:1-13`

Currently `DCFAnalysis` uses `useValuation(ticker)` which returns the combined response. We'll split it to use `useValuation` for the DCF math only, and `useAIOpinion` for the AI section, rendering the DCF immediately and showing a loading state for the AI opinion.

- [ ] **Step 1: Update imports**

Replace line 6:
```js
import { useValuation } from "../hooks/useStockData";
```
with:
```js
import { useValuation, useAIOpinion } from "../hooks/useStockData";
```

- [ ] **Step 2: Update the hook calls inside the component**

Replace lines 11-13:
```js
  const { data: valuationData, loading, refetch: onRefetch } = useValuation(ticker);
  const dcfData = valuationData ? { params: valuationData.params, dcf: valuationData.dcf, monteCarlo: valuationData.monteCarlo, warning: valuationData.warning } : null;
  const aiValuationData = valuationData?.aiValuation || null;
```
with:
```js
  const { data: valuationData, loading, refetch: onRefetch } = useValuation(ticker);
  const { data: aiValuationData, loading: aiLoading } = useAIOpinion(ticker);
  const dcfData = valuationData ? { params: valuationData.params, dcf: valuationData.dcf, monteCarlo: valuationData.monteCarlo, warning: valuationData.warning } : null;
```

- [ ] **Step 3: Update the `quantChecks` fallback to use `aiLoading`**

The `quantChecks` variable (line 136) currently uses `aiValuationData?.quant` — this stays the same since `aiValuationData` now comes from the separate hook. No change needed here.

- [ ] **Step 4: Add a loading state for the AI section in the right column**

In the right column JSX (around line 231), update the debate section to show a loading skeleton when `aiLoading` is true and no data yet. Find the `AI Debate Committee` section title and add a loading guard:

Replace lines 232-275 (the entire right column content) with:
```jsx
      <div style={rightCol}>
        <div style={{ ...glassCard, height: "100%", display: "flex", flexDirection: "column", padding: "0" }}>
          <div style={{ ...sectionTitle, padding: "20px 24px 16px", margin: 0 }}>
            AI Debate Committee
          </div>
          
          {aiLoading && !aiValuationData ? (
            <div style={debateSplash}>
              <div style={{ ...skel, width: "60%", height: "16px" }} />
              <div style={{ ...skel, width: "80%", height: "12px" }} />
              <div style={{ ...skel, width: "40%", height: "12px" }} />
            </div>
          ) : !debateActive ? (
            <div style={debateSplash}>
              <div style={debateSplashIcon}>🎙️</div>
              <div style={debateSplashTitle}>Live AI Debate</div>
              <div style={debateSplashDesc}>
                Synthesize qualitative insights from multiple AI agents modeled after legendary investors and quants.
              </div>
              <button style={startDebateBtn} onClick={startDebate}>
                Start Debate
              </button>
            </div>
          ) : (
            <div style={chatScroll} ref={scrollRef}>
              {messages.map((msg, i) => {
                const color = agentColors[msg.agent] || "var(--text-primary)";
                return (
                  <div key={i} style={{ ...chatBubbleWrapper, alignItems: "flex-start" }}>
                    <div style={{ ...chatAgentLabel, color }}>{msg.agent}</div>
                    <div style={{ ...chatBubble, borderLeftColor: color }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              {currentAgent && (
                <div style={{ ...chatBubbleWrapper, alignItems: "flex-start" }}>
                  <div style={{ ...chatAgentLabel, color: agentColors[currentAgent] || "var(--text-secondary)" }}>
                    {currentAgent}
                  </div>
                  <div style={{ ...chatBubble, borderLeftColor: "transparent", display: "flex", gap: "4px", padding: "12px 16px" }}>
                    <div style={{...typingDot, animationDelay: "0ms"}}></div>
                    <div style={{...typingDot, animationDelay: "150ms"}}></div>
                    <div style={{...typingDot, animationDelay: "300ms"}}></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DCFAnalysis.jsx
git commit -m "feat: fetch DCF math and AI opinion independently in DCFAnalysis"
```

---

### Task 4: Update `StockAnalysisPage.jsx` to prefetch AI valuation

**Files:**
- Modify: `frontend/src/components/StockAnalysisPage.jsx:3,76-80`

Update the import to include `prefetchAIOpinion` and add it to the prefetch useEffect.

- [ ] **Step 1: Update import**

Replace line 3:
```js
import { useStockDetail, prefetchValuation, prefetchStockNews, prefetchStockNewsSummary } from "../hooks/useStockData";
```
with:
```js
import { useStockDetail, prefetchValuation, prefetchAIOpinion, prefetchStockNews, prefetchStockNewsSummary } from "../hooks/useStockData";
```

- [ ] **Step 2: Add `prefetchAIOpinion` to the mount useEffect**

Replace lines 76-80:
```js
    prefetchValuation(queryClient, ticker);
    prefetchStockNews(queryClient, ticker);
    prefetchStockNewsSummary(queryClient, ticker);
```
with:
```js
    prefetchValuation(queryClient, ticker);
    prefetchAIOpinion(queryClient, ticker);
    prefetchStockNews(queryClient, ticker);
    prefetchStockNewsSummary(queryClient, ticker);
```

- [ ] **Step 3: Add `prefetchAIOpinion` to the tab hover handler**

Replace lines 86-87:
```js
      if (tabName === "Valuation & AI") {
        prefetchValuation(queryClient, ticker);
```
with:
```js
      if (tabName === "Valuation & AI") {
        prefetchValuation(queryClient, ticker);
        prefetchAIOpinion(queryClient, ticker);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StockAnalysisPage.jsx
git commit -m "feat: prefetch AI valuation alongside DCF math on StockAnalysisPage"
```

---

### Task 5: Add release note

**Files:**
- Modify: `frontend/public/release-notes.html`

- [ ] **Step 1: Add release note entry**

Find the latest `<section class="month-group">` in `release-notes.html` and add this entry at the top of its `<div class="entries">`:

```html
<article class="release-entry">
  <time datetime="2026-06-06">June 6, 2026</time>
  <h3>Split AI Valuation for Faster DCF Loading</h3>
  <span class="tag tag-improvement">Improvement</span>
  <p>The DCF math and Monte Carlo simulation now load independently from the AI opinion. The valuation models render immediately while the AI analysis fetches in the background, reducing perceived load time on the Valuation &amp; AI tab.</p>
</article>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/public/release-notes.html
git commit -m "docs: add release note for split AI valuation"
```
