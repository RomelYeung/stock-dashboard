import * as yfModule from "yahoo-finance2";
import { getAiClient } from "./aiClient.js";
import * as cache from "./cache.js";

const yahooFinance = new yfModule.default();

/**
 * Fetch recent news articles for a ticker from Yahoo Finance.
 * @param {string} ticker
 * @returns {Promise<Array>}
 */
export async function getStockNews(ticker) {
  const cacheKey = `news:${ticker}`;
  const cached = cache.getNews(cacheKey);
  if (cached) return cached;

  const results = await yahooFinance.search(ticker, { newsCount: 20 }, { validateResult: false });

  const articles = (results.news || [])
    .slice(0, 15)
    .map((a) => ({
      title: a.title,
      publisher: a.publisher,
      link: a.link,
      publishedAt: a.providerPublishTime
        ? new Date(a.providerPublishTime).toISOString()
        : null,
      thumbnail: a.thumbnail?.resolutions?.[0]?.url || null,
    }))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  cache.setNews(cacheKey, articles);
  return articles;
}

/**
 * Generate AI summary and per-article enrichment using Gemini.
 * @param {string} ticker
 * @param {Array} articles
 * @returns {Promise<{ sentiment: string, summary: string, articles: Array }>}
 */
export async function getNewsAISummary(ticker, articles) {
  const cacheKey = `news-ai:${ticker}`;
  const cached = cache.getNewsSummary(cacheKey);
  if (cached) return cached;

  const fallback = {
    sentiment: "Neutral",
    summary: "AI summary unavailable — Gemini API call failed.",
    articles: articles.map((a) => ({
      ...a,
      sentiment: "Neutral",
      category: "General",
      snippet: "",
    })),
  };

  const topArticles = articles.slice(0, 8);
  const prompt = `You are a financial news analyst. Analyze these recent news articles about ${ticker} and return a JSON object.

Articles:
${topArticles.map((a, i) => `${i + 1}. "${a.title}" — ${a.publisher} (${a.publishedAt})`).join("\n")}

Return ONLY valid JSON with this exact structure:
{
  "sentiment": "Bullish" | "Bearish" | "Neutral",
  "summary": "2-3 sentence summary of the overall news sentiment and key themes",
  "articles": [
    {
      "sentiment": "Bullish" | "Bearish" | "Neutral",
      "category": "Earnings" | "Analyst" | "M&A" | "Regulatory" | "Product" | "Market" | "Insider" | "General",
      "snippet": "One sentence key takeaway from this article"
    }
  ]
}

The articles array must have exactly ${topArticles.length} entries, one per article in order.`;

  try {
    const response = await getAiClient().models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt
    });
    let text = response.text;
    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    const parsed = JSON.parse(text);

    // Merge AI enrichment into full articles list
    const enrichedArticles = articles.map((a, i) => {
      const aiEntry = parsed.articles?.[i];
      return {
        ...a,
        sentiment: aiEntry?.sentiment || "Neutral",
        category: aiEntry?.category || "General",
        snippet: aiEntry?.snippet || "",
      };
    });

    const result = {
      sentiment: parsed.sentiment || "Neutral",
      summary: parsed.summary || "",
      articles: enrichedArticles,
    };

    cache.setNewsSummary(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[news-ai] ${ticker}: JSON parse failed:`, err.message);
    return fallback;
  }
}
