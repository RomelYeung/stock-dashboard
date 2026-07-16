# Phase 3 Exploration Analysis: AI-Powered Strategy Insights

This report contains findings and architectural recommendations for Phase 3 (AI-Powered Strategy Insights) of the Guru Tracker in the Stock Dashboard application.

---

## 1. Gemini/Vertex AI Pipeline implementation for Investor Strategy Summaries

### Required Imports and Configurations (`backend/services/guruAi.js`)
We will initialize the `@google/genai` client using the Vertex AI backend configuration, mirroring the existing implementation patterns in `backend/services/aiFinancialAdviser.js`.

```javascript
import { GoogleGenAI } from "@google/genai";
import prisma from "./db.js";
import { truncateHoldingsForPrompt } from "./sec.js";

const aiStrategyCache = new Map();

// Local cache helper
let aiInstance = null;
function getAiClient() {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || 'dumb-money-dashboard-498800',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });
  }
  return aiInstance;
}

export function clearAiStrategyCache(investorId) {
  if (investorId) {
    aiStrategyCache.delete(investorId);
  } else {
    aiStrategyCache.clear();
  }
}
```

### Implementation Logic for `generateAiStrategySummary`
We fetch the investor's details and their latest filing's holdings, order the holdings by weight (so that truncation preserves high-conviction positions), apply the `truncateHoldingsForPrompt` helper, build the prompt, and execute the model call.

```javascript
export async function generateAiStrategySummary(investorId) {
  // 1. Check cache first
  if (aiStrategyCache.has(investorId)) {
    return {
      strategyText: aiStrategyCache.get(investorId),
      cached: true
    };
  }

  // 2. Fetch investor metadata and latest filings/holdings from Prisma
  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    include: {
      filings: {
        orderBy: { periodOfReport: "desc" },
        take: 1,
        include: {
          holdings: {
            orderBy: { portfolioWeight: "desc" }
          }
        }
      }
    }
  });

  if (!investor) {
    throw new Error(`Investor not found with ID ${investorId}`);
  }

  const latestFiling = investor.filings[0];
  const holdings = latestFiling ? latestFiling.holdings : [];

  // 3. Truncate holdings for the prompt if too long (tokenLimit default = 100)
  const truncatedHoldings = truncateHoldingsForPrompt(holdings, 100);

  // 4. Construct prompt incorporating investor bio, philosophy, and latest holdings
  const holdingsSummaryText = truncatedHoldings.map(h => 
    `- ${h.ticker}: weight ${(h.portfolioWeight * 100).toFixed(2)}%, shares ${h.shares.toLocaleString()}, value $${h.value.toLocaleString()}`
  ).join("\n");

  const prompt = `
Build a comprehensive strategy report for institutional investor ${investor.name} (${investor.fundName || 'N/A'}).

Investor Biography:
${investor.bio || 'N/A'}

Investment Philosophy:
${investor.philosophy || 'N/A'}

Estimated Assets Under Management (AUM): $${investor.currentAum ? investor.currentAum.toLocaleString() : 'N/A'}

Latest Holdings (Period of Report: ${latestFiling ? latestFiling.periodOfReport.toISOString().split("T")[0] : 'N/A'}):
${holdingsSummaryText || 'No recent holdings data available.'}

Please synthesize their philosophy with these holdings. Highlight high-conviction bets and assess their current overall investment strategy.
`;

  try {
    const aiClient = getAiClient();
    const result = await aiClient.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are an elite investment strategist analyzing institutional portfolios. Provide a concise, professional analysis (2-3 paragraphs) of the investor's current strategy, sector exposure, and high-conviction bets based on their latest holdings and philosophy.",
        temperature: 0.2
      }
    });

    const strategyText = result.text || "AI strategy summary could not be generated.";
    aiStrategyCache.set(investorId, strategyText);

    return {
      strategyText,
      cached: false
    };
  } catch (error) {
    console.error(`[generateAiStrategySummary] error for ${investorId}:`, error.message);
    throw new Error("AI service temporarily unavailable");
  }
}
```

---

## 2. Activity Feed AI Summaries Endpoint (`backend/routes/gurus.js`)

### Route Placement
The new endpoint `GET /api/gurus/activity/ai-summary` should be placed right above the reverse lookup route `router.get("/ticker/:ticker", ...)` (before line 111) to avoid conflict with general `:id` parameters.

### Endpoint Implementation
The endpoint computes the activity feed similar to `GET /api/gurus/activity`, extracts the 30 most recent activities, formats them into a prompt list, and generates the summary.

```javascript
// In-memory cache for feed summary
let activityFeedSummaryCache = null;

export function clearActivityFeedSummaryCache() {
  activityFeedSummaryCache = null;
}

// Route definition
router.get("/activity/ai-summary", authenticate, async (req, res) => {
  if (activityFeedSummaryCache) {
    return res.json({
      success: true,
      data: activityFeedSummaryCache,
      cached: true
    });
  }

  try {
    const investors = await prisma.investor.findMany({
      include: {
        filings: {
          orderBy: { periodOfReport: "desc" },
          include: { holdings: true }
        }
      }
    });

    const activities = [];
    for (const inv of investors) {
      const filings = inv.filings;
      for (let i = 0; i < filings.length; i++) {
        const currFiling = filings[i];
        const prevFiling = filings[i + 1];
        const prevHoldings = prevFiling ? prevFiling.holdings : [];
        const diffs = calculateQoQ(prevHoldings, currFiling.holdings);
        for (const diff of diffs) {
          const currHolding = currFiling.holdings.find(h => h.ticker === diff.ticker);
          const weight = currHolding ? currHolding.portfolioWeight : 0;
          activities.push({
            date: currFiling.date.toISOString().split("T")[0],
            name: inv.name,
            fundName: inv.fundName,
            ticker: diff.ticker,
            change: diff.change,
            sharesDiff: diff.sharesDiff,
            valueDiff: diff.valueDiff,
            weight
          });
        }
      }
    }

    // Sort by date descending
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Limit to latest 30 transactions to prevent token overflow
    const latestActivities = activities.slice(0, 30);

    const activitiesText = latestActivities.map(a =>
      `- ${a.date}: ${a.name} (${a.fundName || 'N/A'}) ${a.change} ${a.ticker} (Weight: ${(a.weight * 100).toFixed(2)}%, Value change: $${(a.valueDiff / 1e6).toFixed(2)}M)`
    ).join("\n");

    const prompt = `
Analyze the following list of recent transaction activities from institutional investors (gurus) and generate a cohesive, concise summary (3-4 sentences max) of the overall market trends, which sectors or stocks are being heavily bought or sold, and any notable thematic shifts in investor behavior:

${activitiesText}
`;

    const { GoogleGenAI } = await import("@google/genai");
    const aiClient = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || 'dumb-money-dashboard-498800',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });

    const result = await aiClient.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are an expert market strategist summarizing institutional investor activity feeds.",
        temperature: 0.3
      }
    });

    const summaryText = result.text || "No activity summary could be generated.";
    activityFeedSummaryCache = summaryText;

    res.json({
      success: true,
      data: summaryText,
      cached: false
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

*Note: Whenever a new manual sync is performed (in POST `/api/gurus/sync`), `clearActivityFeedSummaryCache()` should be invoked to invalidate the cached feed analysis.*

---

## 3. Tabbed UI Interface for `frontend/src/components/GuruDetail.jsx`

Instead of rendering all sections vertically, we refactor the detail view to use a horizontal tab system.

### State & Navigation Implementation
```javascript
const [activeTab, setActiveTab] = useState("holdings");

const tabs = [
  { id: "holdings", label: "Holdings" },
  { id: "history", label: "History & Timeline" },
  { id: "overlap", label: "Overlap Analysis" },
  { id: "aiStrategy", label: "AI Strategy" }
];
```

### Hook Lazy Fetching
Optimize query loading by only passing the guru `id` when the "AI Strategy" tab is active. This avoids query trigger overhead when looking at other tabs.

```javascript
const { data: aiStrategy, isLoading: aiLoading, error: aiError } = useGuruAiStrategy(
  userRole !== "GUEST" && activeTab === "aiStrategy" ? id : null
);
```

### Component Render Structure
We group components by tab and render them conditionally:

```jsx
{/* Render Profile Card (Stays permanent at top) */}
<div style={styles.profileCard}>...</div>

{/* Tab Navigation */}
<div style={styles.tabContainer}>
  {tabs.map(tab => (
    <button
      key={tab.id}
      style={activeTab === tab.id ? styles.activeTabBtn : styles.tabBtn}
      onClick={() => setActiveTab(tab.id)}
    >
      {tab.label}
    </button>
  ))}
</div>

{/* Tab Contents */}
<div style={styles.tabContent}>
  {activeTab === "holdings" && (
    <>
      {/* Concentration & Allocation Row */}
      <div style={styles.analyticsRow}>...</div>
      {/* Holdings Table */}
      <div style={styles.sectionCard}>...</div>
    </>
  )}

  {activeTab === "history" && (
    <GuruTimeline history={historyData?.history} userRole={userRole} />
  )}

  {activeTab === "overlap" && (
    <GuruHeatmap gurus={gurus} currentGuruId={id} onSelectGuru={onSelectGuru} />
  )}

  {activeTab === "aiStrategy" && (
    <div style={styles.sectionCard}>
      <div style={styles.cardTitle}>AI STRATEGY INSIGHTS</div>
      {userRole === "GUEST" ? (
        <div style={styles.upgradeOverlay}>
          <div style={styles.lockIcon}>🔒</div>
          <h3>Premium Feature: AI Strategy Analyst Report</h3>
          <p>Access Gemini's deep strategy analysis and risk profiles for this fund.</p>
          <a href="/login" style={styles.upgradeBtn}>
            Sign in to Unlock AI Report
          </a>
        </div>
      ) : aiLoading ? (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <span>Analyzing filings & generating strategy summary...</span>
        </div>
      ) : aiError ? (
        <div style={styles.errorText}>
          AI analysis is temporarily unavailable. Please try again later.
        </div>
      ) : (
        <div style={styles.aiReport}>
          <p style={styles.aiText}>{aiStrategy || "No report available for this investor."}</p>
        </div>
      )}
    </div>
  )}
</div>
```

---

## 4. Activity Feed AI Summary in `frontend/src/components/GurusTab.jsx`

### Query Hook in `frontend/src/hooks/useGuruData.js`
Create a hook to fetch the activity feed AI summary:

```javascript
export function useGuruActivityAiSummary(enabled = true) {
  return useQuery({
    queryKey: ["guruActivityAiSummary"],
    queryFn: async () => {
      const res = await fetch("/api/gurus/activity/ai-summary");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Upgrade required");
        throw new Error("Failed to fetch AI activity summary");
      }
      const json = await res.json();
      return json.data;
    },
    enabled
  });
}
```

### GurusTab Rendering
In `GurusTab.jsx`, trigger the fetch if the user is authenticated (role is not `GUEST`):

```javascript
const { data: aiSummary, isLoading: aiSummaryLoading, error: aiSummaryError } = useGuruActivityAiSummary(
  user?.role !== "GUEST"
);
```

Render the summary card at the top of the Combined Activity Feed section, above the filter chips:

```jsx
<div style={styles.feedSection}>
  <h2 style={styles.sectionTitle}>Combined Activity Feed</h2>

  {/* AI Market Activity Summary */}
  {user?.role === "GUEST" ? (
    <div style={styles.aiSummaryCard}>
      <div style={styles.aiSummaryHeader}>
        <span style={styles.aiSummaryTitle}>✨ AI Market Activity Summary</span>
        <span style={styles.aiSummaryBadge}>Premium</span>
      </div>
      <div style={styles.upgradeWall}>
        <span>🔒 Unlock AI-powered activity summaries to spot market trends instantly.</span>
        <a href="/login" style={styles.upgradeLink}>Sign In / Upgrade</a>
      </div>
    </div>
  ) : aiSummaryLoading ? (
    <div style={styles.aiSummaryCard}>
      <div style={styles.spinner} />
      <span>Analyzing recent guru transactions...</span>
    </div>
  ) : aiSummaryError ? (
    <div style={styles.aiSummaryCard}>
      <span style={styles.errorText}>AI summary temporarily unavailable.</span>
    </div>
  ) : (
    <div style={styles.aiSummaryCard}>
      <div style={styles.aiSummaryHeader}>
        <span style={styles.aiSummaryTitle}>✨ AI Market Activity Summary</span>
      </div>
      <p style={styles.aiSummaryText}>{aiSummary}</p>
    </div>
  )}

  {/* Chips Filter */}
  <div style={styles.chipsContainer}>
    {activeChips.map((chip) => (
      ...
```

---

## 5. Test Commands and Test Verification Recommendations

### Exact Test Commands

- **Backend tests** (using Jest):
  - Execution command: `npm test` (executed in `/Users/yanchimyeung/Projects/stock-dashboard/backend`)
- **Frontend tests** (using Vitest):
  - Execution command: `npx vitest run` (executed in `/Users/yanchimyeung/Projects/stock-dashboard/frontend`)

### Recommendations for New Unit/E2E Tests

1. **Backend Integration & E2E tests** (in `/Users/yanchimyeung/Projects/stock-dashboard/backend/routes/__tests__/gurus.e2e.test.js`):
   - **Endpoint Test**: Ensure `GET /api/gurus/activity/ai-summary` successfully returns a text summary when logged in.
   - **Auth Gate Test**: Ensure `guest-token` headers result in a 403 Forbidden response.
   - **Caching Test**: Ensure subsequent calls return `cached: true` and that invoking sync invalidates the cache.
   - **Truncation Validation**: Add unit assertions validating that `truncateHoldingsForPrompt` respects the token constraints and preserves critical data.

2. **Frontend UI tests** (in `/Users/yanchimyeung/Projects/stock-dashboard/frontend/src/hooks/__tests__/useGuruData.e2e.test.js`):
   - **Tab State Transition Test**: Validate that clicking the "AI Strategy" tab sets `activeTab` to `"aiStrategy"` and initiates fetching only at that moment.
   - **Gated Upgrade Wall Component Test**: Assert that guest users are correctly shown the upgrade wall overlay, and the endpoint call hook remains disabled (`enabled: false`).
