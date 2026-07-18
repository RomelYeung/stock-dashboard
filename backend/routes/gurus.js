import { Router } from "express";
import prisma from "../services/db.js";
import { syncInvestor, calculateQoQ } from "../services/sec.js";
import { generateAiStrategySummary, clearAiStrategyCache } from "../services/guruAi.js";
import { getAiClient } from "../services/aiClient.js";

const router = Router();
const syncRequestTimes = new Map();
let activityFeedAiSummaryCache = null;

// Only include full-portfolio 13F filings; exclude event-driven 13D/13G
const SUPPORTED_13F_TYPES = ["13F-HR", "13F-HR/A"];

export function resetSyncRequestTimes() {
  syncRequestTimes.clear();
}

export function clearActivityFeedAiSummaryCache() {
  activityFeedAiSummaryCache = null;
}

// Authentication middleware supporting HTTP cookies and Authorization header (for E2E tests)
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  const token = authHeader || cookieToken;

  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized: No token provided" });
  }
  if (token === "guest-token") {
    return res.status(403).json({ success: false, error: "Forbidden: Guest access restricted" });
  }

  if (token !== "user-token" && token !== "admin-token") {
    try {
      const { verifyToken } = await import("../services/auth.js");
      const payload = verifyToken(token);
      if (!payload) {
        return res.status(401).json({ success: false, error: "Invalid or expired token." });
      }
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, email: true, role: true }
      });
      if (!user) {
        return res.status(401).json({ success: false, error: "User no longer exists." });
      }
      req.user = user;
    } catch (e) {
      return res.status(401).json({ success: false, error: "Authentication failed." });
    }
  } else {
    // E2E test mock tokens
    req.user = {
      id: "mock-user-id",
      role: token === "admin-token" ? "ADMIN" : "USER"
    };
  }
  next();
};

// 1. GET /api/gurus - Retrieve all curated/user-added investors
router.get("/", async (req, res) => {
  try {
    const gurus = await prisma.investor.findMany({
      orderBy: { name: "asc" }
    });
    res.json({ success: true, data: gurus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1.5 GET /api/gurus/activity/ai-summary - AI-generated summary of combined activities
router.get("/activity/ai-summary", authenticate, async (req, res) => {
  if (req.headers["x-simulate-ai-failure"] === "true") {
    return res.status(503).json({ success: false, error: "AI service temporarily unavailable" });
  }

  if (activityFeedAiSummaryCache) {
    return res.json({
      success: true,
      data: activityFeedAiSummaryCache,
      cached: true
    });
  }

  try {
    const investors = await prisma.investor.findMany({
      include: {
        filings: {
          where: { type: { in: SUPPORTED_13F_TYPES } },
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
          const currHolding = currFiling.holdings.find(h => h.ticker === diff.ticker && (h.optionType || "none").toLowerCase() === (diff.optionType || "none").toLowerCase());
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

    // Take top 30
    const topActivities = activities.slice(0, 30);

    const activitiesStr = topActivities.map(a => 
      `Date: ${a.date}, Investor: ${a.name} (${a.fundName}), Ticker: ${a.ticker}, Change: ${a.change}, Weight: ${(a.weight * 100).toFixed(2)}%`
    ).join("\n");

    const prompt = `Analyze the following combined recent activity feed of major investors (top 30 activities):
${activitiesStr || "No activities recorded."}

Please generate a cohesive, concise executive AI summary (2-3 sentences) identifying major trends, clusters of buys/sells, or significant sentiment shifts across these investors.`;

    let summaryText = "";
    try {
      const aiClient = getAiClient();
      const result = await aiClient.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      summaryText = result.text;
    } catch (err) {
      console.error("Gemini call for activity summary failed:", err.message);
      throw new Error("AI service temporarily unavailable");
    }

    if (!summaryText || !summaryText.trim()) {
      throw new Error("AI service temporarily unavailable");
    }

    activityFeedAiSummaryCache = summaryText;

    res.json({
      success: true,
      data: activityFeedAiSummaryCache,
      cached: false
    });
  } catch (err) {
    return res.status(503).json({ success: false, error: err.message });
  }
});

// 2. GET /api/gurus/activity - Combined activity feed across all investors
router.get("/activity", async (req, res) => {
  try {
    const investors = await prisma.investor.findMany({
      include: {
        filings: {
          where: { type: { in: SUPPORTED_13F_TYPES } },
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
          const currHolding = currFiling.holdings.find(h => h.ticker === diff.ticker && (h.optionType || "none").toLowerCase() === (diff.optionType || "none").toLowerCase());
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
    res.json({ success: true, data: activities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET /api/gurus/ticker/:ticker - Reverse lookup holdings for a ticker
router.get("/ticker/:ticker", async (req, res) => {
  const { ticker } = req.params;
  try {
    const holdings = await prisma.holding.findMany({
      where: { ticker: ticker.toUpperCase() },
      include: {
        filing: {
          include: { investor: true }
        }
      }
    });

    const allResults = holdings.map(h => {
      const filing = h.filing;
      const investor = filing.investor;
      const date = new Date(filing.periodOfReport);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const quarter = `${year}-Q${Math.floor(month / 3) + 1}`;

      return {
        guruId: investor.id,
        guruName: investor.name,
        fundName: investor.fundName,
        quarter,
        shares: h.shares,
        value: h.value,
        weight: h.portfolioWeight,
        _periodDate: date
      };
    });

    // Keep only the most recent quarter per investor
    const latestByGuru = new Map();
    for (const r of allResults) {
      const existing = latestByGuru.get(r.guruId);
      if (!existing || r._periodDate > existing._periodDate) {
        latestByGuru.set(r.guruId, r);
      }
    }
    const results = [...latestByGuru.values()].map(({ _periodDate, ...rest }) => rest);

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/gurus/:id/holdings - Get holdings for investor and quarter
router.get("/:id/holdings", async (req, res) => {
  const { id } = req.params;
  const { quarter } = req.query;

  try {
    const investor = await prisma.investor.findUnique({
      where: { id }
    });
    if (!investor) {
      return res.status(404).json({ success: false, error: "Investor not found" });
    }

    let startDate, endDate;
    if (quarter) {
      const quarterRegex = /^\d{4}-Q[1-4]$/;
      if (!quarterRegex.test(quarter)) {
        return res.status(400).json({ success: false, error: "Invalid quarter format" });
      }

      const [yearStr, qStr] = quarter.split("-Q");
      const year = parseInt(yearStr, 10);
      if (qStr === "1") {
        startDate = new Date(Date.UTC(year, 0, 1));
        endDate = new Date(Date.UTC(year, 2, 31, 23, 59, 59, 999));
      } else if (qStr === "2") {
        startDate = new Date(Date.UTC(year, 3, 1));
        endDate = new Date(Date.UTC(year, 5, 30, 23, 59, 59, 999));
      } else if (qStr === "3") {
        startDate = new Date(Date.UTC(year, 6, 1));
        endDate = new Date(Date.UTC(year, 8, 30, 23, 59, 59, 999));
      } else if (qStr === "4") {
        startDate = new Date(Date.UTC(year, 9, 1));
        endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      }
    }

    const filings = await prisma.filing.findMany({
      where: {
        investorId: id,
        type: { in: SUPPORTED_13F_TYPES },
        ...(quarter ? {
          periodOfReport: {
            gte: startDate,
            lte: endDate
          }
        } : {})
      },
      include: { holdings: true },
      orderBy: { periodOfReport: "desc" }
    });

    let holdings = filings.length > 0 ? filings[0].holdings : [];

    // Aggregate by (ticker, optionType) to deduplicate multiple rows per ticker
    if (holdings.length > 0) {
      const aggregatedMap = new Map();
      for (const h of holdings) {
        const key = `${h.ticker}-${(h.optionType || "none").toLowerCase()}`;
        if (!aggregatedMap.has(key)) {
          // Preserve original row fields (id, filingId, createdAt) from first row
          aggregatedMap.set(key, {
            ...h,
            _isAggregated: false,
            _rowCount: 1
          });
        } else {
          const existing = aggregatedMap.get(key);
          existing.shares += h.shares;
          existing.value += h.value;
          existing._rowCount += 1;
          existing._isAggregated = true;
        }
      }
      const aggregated = [...aggregatedMap.values()];

      // Recompute totalValue and portfolioWeight from aggregated holdings
      const totalValue = aggregated.reduce((sum, h) => sum + h.value, 0);
      for (const h of aggregated) {
        h.portfolioWeight = totalValue > 0 ? h.value / totalValue : 0;
        h.convictionScore = h.portfolioWeight * 10;
      }

      holdings = aggregated;
    }

    res.json({ success: true, data: holdings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. GET /api/gurus/:id/history - 8-quarter history and QoQ differences
router.get("/:id/history", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const investor = await prisma.investor.findUnique({
      where: { id }
    });
    if (!investor) {
      return res.status(404).json({ success: false, error: "Investor not found" });
    }

    const filings = await prisma.filing.findMany({
      where: { investorId: id, type: { in: SUPPORTED_13F_TYPES } },
      orderBy: { periodOfReport: "desc" },
      take: 20,
      include: { holdings: true }
    });

    const history = filings.map((filing, index) => {
      const prevFiling = filings[index + 1];
      const prevHoldings = prevFiling ? prevFiling.holdings : [];
      const diffs = calculateQoQ(prevHoldings, filing.holdings);
      return {
        ...filing,
        qoqDifferences: diffs
      };
    });

    res.json({ success: true, data: { history } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. GET /api/gurus/:id/ai-strategy - AI-generated strategy
router.get("/:id/ai-strategy", authenticate, async (req, res) => {
  const { id } = req.params;

  if (req.headers["x-simulate-ai-failure"] === "true") {
    return res.status(503).json({ success: false, error: "AI service temporarily unavailable" });
  }

  try {
    const result = await generateAiStrategySummary(id);
    res.json({
      success: true,
      data: result.strategyText,
      cached: result.cached
    });
  } catch (err) {
    if (err.message.includes("unavailable")) {
      return res.status(503).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. POST /api/gurus/sync - Manual sync trigger
router.post("/sync", authenticate, async (req, res) => {
  const { CIK } = req.body;
  if (!CIK || CIK.length !== 10 || !/^\d+$/.test(CIK)) {
    return res.status(400).json({ success: false, error: "Invalid CIK code" });
  }

  const now = Date.now();
  const lastSyncTime = syncRequestTimes.get(CIK) || 0;
  if (now - lastSyncTime < 2000) {
    return res.status(429).json({ success: false, error: "Rate limit exceeded" });
  }
  syncRequestTimes.set(CIK, now);

  activityFeedAiSummaryCache = null;

  syncInvestor(CIK)
    .then(async () => {
      console.log(`[sync] Successfully synced investor CIK: ${CIK}`);
      const investor = await prisma.investor.findUnique({ where: { CIK } });
      if (investor) {
        clearAiStrategyCache(investor.id);
      }
    })
    .catch(err => {
      console.error(`[sync] Failed to sync investor CIK: ${CIK}:`, err.message);
    });

  res.status(202).json({ success: true, message: "Sync process initiated" });
});

export default router;
