import { getAiClient } from "./aiClient.js";
import * as cache from "./cache.js";

const SEC_HEADERS = {
  "User-Agent": "StockDashboard/1.0 (contact@example.com)",
};

// Module-level cache for the full company tickers mapping (shared with insiderTrading)
let _companyTickersCache = null;
let _companyTickersLoading = null;

async function _getCompanyTickers() {
  if (_companyTickersCache) return _companyTickersCache;
  if (_companyTickersLoading) return _companyTickersLoading;

  _companyTickersLoading = (async () => {
    try {
      const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: SEC_HEADERS,
      });
      if (!res.ok) throw new Error(`SEC ticker mapping failed: ${res.status}`);
      const data = await res.json();
      _companyTickersCache = Object.values(data);
      return _companyTickersCache;
    } finally {
      _companyTickersLoading = null;
    }
  })();

  return _companyTickersLoading;
}

async function getCIK(ticker) {
  const entries = await _getCompanyTickers();
  const match = entries.find(
    (entry) => entry.ticker === ticker.toUpperCase()
  );
  if (!match) throw new Error(`Ticker ${ticker} not found in SEC database`);
  return match.cik_str.toString().padStart(10, "0");
}

/**
 * Fetch recent 8-K filings for a ticker from SEC EDGAR.
 * Returns the latest N filings with their metadata.
 */
async function getRecent8KFilings(cik, count = 5) {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (!res.ok) throw new Error(`SEC submissions failed: ${res.status}`);

  const data = await res.json();
  const filings = data.filings?.recent || {};
  const forms = filings.form || [];
  const accessionNumbers = filings.accessionNumber || [];
  const filingDates = filings.filingDate || [];
  const primaryDocs = filings.primaryDocument || [];

  const results = [];
  for (let i = 0; i < forms.length && results.length < count; i++) {
    if (forms[i] === "8-K" || forms[i] === "8-K/A") {
      results.push({
        accessionNumber: accessionNumbers[i],
        filingDate: filingDates[i],
        primaryDocument: primaryDocs[i],
        isAmendment: forms[i] === "8-K/A",
      });
    }
  }
  return results;
}

/**
 * Extract the text content from an 8-K filing.
 * Prioritizes Exhibit 99.1 (press release with guidance) over the primary document.
 */
async function fetchFilingContent(cik, filing) {
  const cikNum = parseInt(cik);
  const acc = filing.accessionNumber.replace(/-/g, "");

  // Fetch the filing directory listing
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/index.json`;
  const idxRes = await fetch(indexUrl, { headers: SEC_HEADERS });
  if (!idxRes.ok) return null;
  const idx = await idxRes.json();
  const files = idx.directory?.item || [];

  // Filter to .htm/.html content files, excluding boilerplate (index pages, XBRL viewers, R*.htm)
  const primaryDoc = filing.primaryDocument;
  const contentFiles = files.filter((f) => {
    const name = f.name;
    if (!name.endsWith(".htm") && !name.endsWith(".html")) return false;
    if (name.includes("-index")) return false;       // index pages
    if (/^R\d+\.htm$/i.test(name)) return false;     // XBRL viewer pages
    return true;
  });

  if (contentFiles.length === 0) return null;

  // Pick the largest .htm file that ISN'T the primary 8-K document.
  // The press release / Exhibit 99.1 is almost always the largest file.
  const nonPrimary = contentFiles.filter((f) => f.name !== primaryDoc);
  const candidates = nonPrimary.length > 0 ? nonPrimary : contentFiles;
  const targetFile = candidates.reduce((best, f) =>
    (parseInt(f.size) || 0) > (parseInt(best.size) || 0) ? f : best
  );

  const fileUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${targetFile.name}`;
  const res = await fetch(fileUrl, { headers: SEC_HEADERS });
  if (!res.ok) return null;
  return res.text();
}

/**
 * Strip HTML tags and clean up SEC filing text for AI processing.
 */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect which 8-K items are present in the text.
 */
function detectItems(text) {
  if (!text) return [];
  const items = [];
  const itemPatterns = [
    { code: "2.02", name: "Results of Operations and Financial Condition" },
    { code: "7.01", name: "Regulation FD Disclosure" },
    { code: "8.01", name: "Other Events" },
    { code: "9.01", name: "Financial Statements and Exhibits" },
  ];

  for (const pattern of itemPatterns) {
    // Match just the item number (e.g. "Item 2.02") — don't require the full legal name
    const regex = new RegExp(
      `item\\s+${pattern.code.replace(".", "\\.")}\\.?\\b`,
      "i"
    );
    if (regex.test(text)) {
      items.push({ code: pattern.code, name: pattern.name });
    }
  }
  return items;
}

/**
 * Use Gemini AI to extract forward-looking statements and guidance figures from SEC filing text.
 * Falls back to empty arrays if AI is unavailable or fails.
 */
async function extractGuidanceWithAi(html) {
  if (!html) return null;

  // Strip HTML and truncate to avoid token limits
  const text = stripHtml(html);
  const truncated = text.slice(0, 30000);

  try {
    const ai = getAiClient();

    const prompt = `You are a financial analyst analyzing an SEC 8-K filing. Extract forward-looking statements and financial guidance from this document.

Return ONLY a JSON object with no explanation text. Do NOT use markdown code fences.

Required JSON format:
{
  "forwardLooking": ["exact quote 1", "exact quote 2"],
  "guidanceSnippets": ["Q3 Revenue $10B", "EPS $1.50"]
}

Rules:
- forwardLooking: Extract verbatim sentences that contain future projections, expectations, forecasts, or outlook statements (e.g., "we expect Q4 revenue to be...", "the company anticipates..."). Use direct quotes, do not paraphrase.
- guidanceSnippets: Extract specific financial figures with context (e.g., "Q3 Revenue $10B", "FY2025 EPS guidance $4.50-$4.75"). Include the metric, time period, and value.
- If no guidance is found, return empty arrays for both fields.
- Do NOT include legal safe harbor disclaimers or boilerplate cautionary language.
- Do NOT fabricate figures not present in the text.

SEC 8-K FILING TEXT:
${truncated}`;

    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt
    });
    const responseText = result.text;

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[sec-guidance] No JSON in AI response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      forwardLooking: Array.isArray(parsed.forwardLooking) ? parsed.forwardLooking.slice(0, 10) : [],
      guidanceSnippets: Array.isArray(parsed.guidanceSnippets) ? parsed.guidanceSnippets.slice(0, 10) : [],
    };
  } catch (err) {
    console.error(`[sec-guidance] AI extraction failed:`, err.message);
    return null;
  }
}

/**
 * Main entry point: get 8-K guidance data for a ticker.
 */
export async function getSecGuidance(ticker) {
  const cacheKey = `sec-guidance:${ticker}`;
  const cached = cache.getInsider(cacheKey); // Reuse insider TTL (24h)
  if (cached) return cached;

  const cik = await getCIK(ticker);
  const filings = await getRecent8KFilings(cik, 5);

  if (filings.length === 0) {
    const result = {
      ticker,
      filings: [],
      summary: "No recent 8-K filings found.",
      lastUpdated: new Date().toISOString(),
    };
    cache.setInsider(cacheKey, result);
    return result;
  }

  // Fetch and parse each filing (limit 3 to stay under SEC rate limits)
  const parsedFilings = [];
  for (const filing of filings.slice(0, 3)) {
    try {
      const html = await fetchFilingContent(cik, filing);
      const plainText = html ? stripHtml(html) : null;
      const items = detectItems(plainText);
      const aiResult = await extractGuidanceWithAi(html);

      parsedFilings.push({
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        isAmendment: filing.isAmendment,
        items,
        guidanceSnippets: aiResult?.guidanceSnippets || [],
        forwardLooking: aiResult?.forwardLooking || [],
        hasContent: html !== null,
      });

      // Respect SEC rate limits: 10 req/sec max
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.error(`[sec-guidance] Failed to parse ${filing.accessionNumber}:`, err.message);
    }
  }

  // Drop filings with no useful content (no items, no guidance, no forward-looking)
  const usefulFilings = parsedFilings.filter(
    (f) => f.items.length > 0 || f.forwardLooking.length > 0 || f.guidanceSnippets.length > 0
  );

  // Build a summary
  const allItems = usefulFilings.flatMap((f) => f.items);
  const itemCodes = [...new Set(allItems.map((i) => i.code))];
  const hasGuidance = usefulFilings.some((f) => f.forwardLooking.length > 0);

  let summary;
  if (hasGuidance) {
    summary = `Found forward-looking guidance in ${usefulFilings.length} recent 8-K filing(s).`;
  } else if (itemCodes.length > 0) {
    summary = `Recent 8-K filings contain Items ${itemCodes.join(", ")} but no explicit forward-looking guidance text.`;
  } else {
    summary = `Fetched ${parsedFilings.length} recent 8-K filing(s) with limited structured content.`;
  }

  const result = {
    ticker,
    filings: usefulFilings,
    itemCodes,
    summary,
    lastUpdated: new Date().toISOString(),
  };

  cache.setInsider(cacheKey, result);
  return result;
}
