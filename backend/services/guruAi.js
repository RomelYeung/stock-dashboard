import prisma from "./db.js";
import { truncateHoldingsForPrompt } from "./sec.js";
import { getAiClient } from "./aiClient.js";

// Only include full-portfolio 13F filings; exclude event-driven 13D/13G
const SUPPORTED_13F_TYPES = ["13F-HR", "13F-HR/A"];

const aiStrategyCache = new Map();

export function clearAiStrategyCache(investorId) {
  if (investorId) {
    aiStrategyCache.delete(investorId);
  } else {
    aiStrategyCache.clear();
  }
}

export async function generateAiStrategySummary(investorId) {
  // Check cache first
  if (aiStrategyCache.has(investorId)) {
    return {
      strategyText: aiStrategyCache.get(investorId),
      cached: true
    };
  }

  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    include: {
      filings: {
        where: { type: { in: SUPPORTED_13F_TYPES } },
        orderBy: { periodOfReport: "desc" },
        include: {
          holdings: true
        }
      }
    }
  });

  if (!investor) {
    throw new Error("Investor not found");
  }

  const latestFiling = investor.filings?.[0];
  let holdings = latestFiling ? [...latestFiling.holdings] : [];
  holdings.sort((a, b) => (b.portfolioWeight || 0) - (a.portfolioWeight || 0));

  const truncatedHoldings = truncateHoldingsForPrompt(holdings, 100);

  let holdingsStr = "No holdings data available.";
  if (truncatedHoldings.length > 0) {
    holdingsStr = truncatedHoldings.map(h => `${h.ticker}: ${h.shares} shares, ${(h.portfolioWeight * 100).toFixed(2)}% weight`).join("\n");
  }

  const prompt = `Analyze the investment strategy for investor "${investor.name}" (Fund: "${investor.fundName || "N/A"}") who follows the philosophy "${investor.philosophy || "N/A"}".
Their current top holdings are:
${holdingsStr}

Please provide a cohesive, analytical AI strategy summary of 2-3 sentences.`;

  let strategyText = "";
  try {
    const aiClient = getAiClient();
    const result = await aiClient.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    strategyText = result.text;
  } catch (err) {
    console.error("Gemini AI call failed:", err.message);
    throw new Error("AI service temporarily unavailable");
  }

  if (!strategyText || !strategyText.trim()) {
    throw new Error("AI service temporarily unavailable");
  }

  aiStrategyCache.set(investorId, strategyText);

  return {
    strategyText,
    cached: false
  };
}

