import { getFinancials, getSummary } from "./yahoofinance.js";
import { getComparables } from "./comparables.js";
import { getAiClient } from "./aiClient.js";
import * as cache from "./cache.js";

export async function getEarningsSentiment(ticker) {
  const cacheKey = `earnings-sentiment:${ticker}`;
  const cached = cache.getComparables(cacheKey); // Using comparables cache TTL
  if (cached) return cached;

  const [summary, financials] = await Promise.all([
    getSummary(ticker),
    getFinancials(ticker)
  ]);

  if (!financials) {
    throw new Error(`Financial data unavailable for ${ticker}`);
  }

  const epsSurprises = financials.epsSurprises || [];
  const estimates = financials.estimates || {};
  const annualIncome = financials.annualIncome || [];
  const currentPrice = summary?.currentPrice || "Unknown";

  try {

    const prompt = `
You are an expert forensic accountant and financial analyst.
Analyze the following earnings data for ${ticker}.

Current Price: ${currentPrice}

EPS Surprises (last 4 quarters):
${JSON.stringify(epsSurprises, null, 2)}

Forward Estimates:
${JSON.stringify(estimates, null, 2)}

Recent Annual Income Statements:
${JSON.stringify(annualIncome, null, 2)}

Your task:
1. USE YOUR GOOGLE SEARCH TOOL to find the most recent earnings call transcript summary, management commentary, and recent financial news for ${ticker}.
2. Dig deep into both the quantitative data provided and the qualitative data you found online.
3. Look for red flags such as non-recurring revenue boosting net income, divergence between operating cash flow and net income (a sign of financial manipulation), sudden margin deteriorations, or management changing their tone.
4. Assess the trajectory of earnings surprises and forward estimates against management's latest forward guidance.
5. Provide a highly analytical summary (3-4 sentences max) highlighting any quantitative nuances, manipulation risks, or underlying strengths based on your search and the data.
6. Assign a score of either "Bullish", "Bearish", or "Neutral".

Format your response exactly as JSON. Do NOT use double quotes inside the summary text.
{
  "score": "Bullish", // or Bearish, Neutral
  "summary": "Your brief, deep-dive forensic summary here."
}
`;

    const result = await getAiClient().models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    const text = result.text;
    
    // Robustly extract JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in response");
    
    const parsed = JSON.parse(jsonMatch[0]);
    const sentiment = {
      score: parsed.score || "Neutral",
      summary: parsed.summary || "Unable to parse AI summary.",
    };
    
    cache.setComparables(cacheKey, sentiment);
    return sentiment;
  } catch (error) {
    console.error(`[generateEarningsSentiment] error:`, error.message);
    return {
      score: "Neutral",
      summary: "AI analysis failed to generate.",
    };
  }
}

export async function getEarningsInsights(ticker) {
  const cacheKey = `earnings-insights-v2:${ticker}`;
  const cached = cache.getComparables(cacheKey); // Reuse comparables cache TTL
  if (cached) return cached;

  try {
    const [summary, financials, comparablesData] = await Promise.all([
      getSummary(ticker),
      getFinancials(ticker),
      getComparables(ticker).catch(() => null),
    ]);

    if (!financials) {
      throw new Error(`Financial data unavailable for ${ticker}`);
    }

    const epsSurprises = financials.epsSurprises || [];
    const estimates = financials.estimates || {};

    const result = {
      ticker,
      epsSurprises,
      estimates,
      annualIncome: financials.annualIncome || [],
      quarterlyIncome: financials.quarterlyIncome || [],
      peers: comparablesData?.peers || [],
      earningsDate: summary?.earningsDate || null,
      recommendationTrend: financials.recommendationTrend || [],
      upgradesDowngrades: financials.upgradesDowngrades || [],
    };

    cache.setComparables(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`[getEarningsInsights] error for ${ticker}:`, error.message);
    throw error;
  }
}

// Trigger nodemon restart for .env changes
