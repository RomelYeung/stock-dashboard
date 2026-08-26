import { parseStringPromise } from "xml2js";
import * as cache from "./cache.js";
import { secLimiter } from "../utils/rateLimiter.js";
import { CACHE_TTL_INSIDER_EMPTY } from "../constants.js";

const SEC_HEADERS = {
  "User-Agent": "StockDashboard/1.0 (contact@example.com)",
};

// Module-level cache for the full company tickers mapping (fetched once per server lifecycle)
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

const ROLE_MULTIPLIERS = {
  CEO: 2.0,
  CFO: 2.0,
  COO: 2.0,
  Chairman: 2.0,
  Director: 1.5,
  Officer: 1.2,
  Other: 1.0,
};

async function getCIK(ticker) {
  const cacheKey = `cik:${ticker}`;
  const cached = cache.getFundamentals(cacheKey);
  if (cached) return cached;

  const entries = await _getCompanyTickers();
  const match = entries.find(
    (entry) => entry.ticker === ticker.toUpperCase()
  );
  if (!match) throw new Error(`Ticker ${ticker} not found in SEC database`);

  const cik = match.cik_str.toString().padStart(10, "0");
  cache.setFundamentals(cacheKey, cik);
  return cik;
}

/**
 * Normalize accession number by stripping dashes and /A suffix
 * @param {string} acc - Raw accession number
 * @returns {string} Normalized accession number
 */
export function normalizeAccession(acc) {
  return acc.replace(/-/g, "").replace(/\/A$/, "");
}

/**
 * Fetch Form 4 filings with pagination support
 * Implements Form 4/A supersession (4/A overwrites original 4)
 * Stops early if enough Form 4s (>10) are found, caps at 3 pages
 * 
 * @param {string} cik - Company CIK number
 * @returns {Promise<Array>} Array of Form 4 filing objects
 */
async function getForm4Filings(cik) {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  await secLimiter.throttle();
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (!res.ok) throw new Error(`SEC submissions failed: ${res.status}`);

  const data = await res.json();
  
  // Use recent filings or fallback to files if available
  const recentFilings = data.filings?.recent || {};
  const additionalFiles = data.filings?.files || [];
  
  // Map to store normalized accession -> filing data
  const filingMap = new Map();
  
  // Process recent filings first
  const forms = recentFilings.form || [];
  const accessionNumbers = recentFilings.accessionNumber || [];
  const filingDates = recentFilings.filingDate || [];
  const primaryDocs = recentFilings.primaryDocument || [];

  let recentForm4Count = 0;
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === "4" || forms[i] === "4/A") {
      const acc = normalizeAccession(accessionNumbers[i]);
      recentForm4Count++;
      filingMap.set(acc, {
        accessionNumber: accessionNumbers[i],
        filingDate: filingDates[i],
        primaryDocument: primaryDocs[i],
        formType: forms[i],
      });
    }
  }
  console.log(`[DEBUG getForm4Filings] recent filings scanned: ${forms.length}, Form 4/4A found in recent: ${recentForm4Count}`);

  // Process paginated files sequentially (up to 3 pages)
  let pagesProcessed = 0;
  const MAX_PAGES = 3;
  const MIN_FORM4S = 40;

  console.log(`[DEBUG getForm4Filings] additionalFiles (paginated) available: ${additionalFiles.length}, will paginate: ${additionalFiles.length > 0 && filingMap.size < MIN_FORM4S}`);

  for (const fileEntry of additionalFiles) {
    if (pagesProcessed >= MAX_PAGES) break;
    if (filingMap.size >= MIN_FORM4S) break;
    
    try {
      await secLimiter.throttle();
      const pageUrl = `https://data.sec.gov/submissions/${fileEntry.name}`;
      const pageRes = await fetch(pageUrl, { headers: SEC_HEADERS });
      if (!pageRes.ok) {
        console.error(`[insider-trading] Failed to fetch paginated page: ${fileEntry.name} (Status: ${pageRes.status})`);
        continue;
      }
      const page = await pageRes.json();
      
      const pageForms = page.form || [];
      const pageAccessions = page.accessionNumber || [];
      const pageDates = page.filingDate || [];
      const pageDocs = page.primaryDocument || [];
      
      for (let i = 0; i < pageForms.length; i++) {
        if (pageForms[i] === "4" || pageForms[i] === "4/A") {
          const acc = normalizeAccession(pageAccessions[i]);
          filingMap.set(acc, {
            accessionNumber: pageAccessions[i],
            filingDate: pageDates[i],
            primaryDocument: pageDocs[i],
            formType: pageForms[i],
          });
        }
      }
      
      pagesProcessed++;
    } catch (err) {
      console.error(`[insider-trading] Error fetching paginated page: ${fileEntry.name} - ${err.message}`);
    }
  }

  console.log(`[DEBUG getForm4Filings] paginated pages processed: ${pagesProcessed}, total unique Form 4/4A after pagination: ${filingMap.size}`);

  // Convert map to array — 4/A entries have already overwritten originals via Map.set()
  const form4s = [];
  for (const [acc, filing] of filingMap) {
    form4s.push({
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      primaryDocument: filing.primaryDocument,
    });
  }
  
  return form4s;
}

async function getRawXmlUrl(cik, acc, primaryDoc) {
  const cikNum = parseInt(cik);
  const filename = primaryDoc.split("/").pop();
  const directUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${filename}`;
  const head = await fetch(directUrl, { method: "HEAD", headers: SEC_HEADERS });
  if (head.ok && head.headers.get("content-type")?.includes("xml")) {
    return directUrl;
  }
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/index.json`;
  const idxRes = await fetch(indexUrl, { headers: SEC_HEADERS });
  if (!idxRes.ok) return null;
  const idx = await idxRes.json();
  const files = idx.directory?.item || [];
  const xmlFile = files.find((f) => f.name.endsWith(".xml"));
  if (!xmlFile) return null;
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${xmlFile.name}`;
}

async function parseForm4(cik, filing) {
  const acc = normalizeAccession(filing.accessionNumber);
  const url = await getRawXmlUrl(cik, acc, filing.primaryDocument);
  if (!url) return null;
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

  // Map SEC Form 4 transaction codes to human-readable activity types.
  // P/S are open-market buy/sell; M/F/G/A are also genuine insider events
  // (RSU vesting, tax-withholding sales, gifts, awards) and must be shown.
  const TX_TYPE = {
    P: "Buy",
    S: "Sell",
    M: "Exercise",
    F: "TaxWithhold",
    G: "Gift",
    A: "Award",
  };

  for (const tx of txList) {
    const transCode = tx?.transactionCoding?.transactionCode;
    if (!transCode || !TX_TYPE[transCode]) continue;

    const shares = parseFloat(tx?.transactionAmounts?.transactionShares?.value || 0);
    const price = parseFloat(tx?.transactionAmounts?.transactionPricePerShare?.value || 0);
    const value = shares * price;

    transactions.push({
      type: TX_TYPE[transCode],
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
      const base = tx.type === "Buy" ? 2.0 : -0.5;
      score += base * dollarWeight * roleMult * decay;
    }
  }

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
  const allBuys = insiders.filter((i) => i.buyCount > 0);
  const allSells = insiders.filter((i) => i.sellCount > 0);
  const totalBuyValue = recentBuys.reduce((s, i) => s + i.totalValue, 0);
  const totalSellValue = recentSells.reduce((s, i) => s + i.totalValue, 0);
  const totalAllBuyValue = allBuys.reduce((s, i) => s + i.totalValue, 0);
  const totalAllSellValue = allSells.reduce((s, i) => s + i.totalValue, 0);

  const topBuyer = recentBuys.sort((a, b) => b.totalValue - a.totalValue)[0];
  const topSeller = recentSells.sort((a, b) => b.totalValue - a.totalValue)[0];

  const hasRecent = recentBuys.length > 0 || recentSells.length > 0;

  if (score > 50) {
    if (hasRecent) {
      const count = recentBuys.length;
      const valueStr = formatValue(totalBuyValue);
      return `${label}: ${count} insider${count > 1 ? "s" : ""} purchased ${valueStr} in shares over the past 30 days${topBuyer ? `, led by the ${topBuyer.role}` : ""}.`;
    }
    const count = allBuys.length;
    const valueStr = formatValue(totalAllBuyValue);
    return `${label}: ${count} insider${count > 1 ? "s" : ""} purchased ${valueStr} overall — none in the past 30 days.`;
  }
  if (score > 10) {
    if (hasRecent) {
      const count = recentBuys.length;
      const valueStr = formatValue(totalBuyValue);
      return `${label}: ${count} insider${count > 1 ? "s" : ""} purchased ${valueStr} in shares over the past 30 days.`;
    }
    const count = allBuys.length;
    const valueStr = formatValue(totalAllBuyValue);
    return `${label}: ${count} insider${count > 1 ? "s" : ""} purchased ${valueStr} overall — none in the past 30 days.`;
  }
  if (score >= -10) {
    if (!hasRecent) {
      if (insiders.length === 0) {
        return `${label}: No insider transactions found.`;
      }
      return `${label}: No recent insider transactions — past activity was mixed.`;
    }
    return `${label}: Mixed activity with ${formatValue(totalBuyValue)} in purchases and ${formatValue(totalSellValue)} in sales over the past 30 days.`;
  }
  if (score >= -50) {
    if (hasRecent) {
      const count = recentSells.length;
      const valueStr = formatValue(totalSellValue);
      return `${label}: ${count} insider${count > 1 ? "s" : ""} sold ${valueStr} in shares over the past 30 days${topSeller ? `, led by the ${topSeller.role}` : ""}.`;
    }
    const count = allSells.length;
    const valueStr = formatValue(totalAllSellValue);
    return `${label}: ${count} insider${count > 1 ? "s" : ""} sold ${valueStr} overall — none in the past 30 days.`;
  }
  if (hasRecent) {
    const count = recentSells.length;
    const valueStr = formatValue(totalSellValue);
    return `${label}: Heavy selling — ${count} insider${count > 1 ? "s" : ""} sold ${valueStr} in shares over the past 30 days with no buying activity.`;
  }
  const count = allSells.length;
  const valueStr = formatValue(totalAllSellValue);
  return `${label}: Heavy selling — ${count} insider${count > 1 ? "s" : ""} sold ${valueStr} overall${allBuys.length > 0 ? ` with only ${formatValue(totalAllBuyValue)} in buys` : ""}.`;
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

  try {
    const cik = await getCIK(ticker);
    const filings = await getForm4Filings(cik);

    const insiders = [];
    const BATCH_SIZE = 3;
    let parseSuccess = 0;
    let parseNull = 0;
    let parseError = 0;
    for (let i = 0; i < filings.length; i += BATCH_SIZE) {
      const batch = filings.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (filing) => {
          try {
            const parsed = await parseForm4(cik, filing);
            if (parsed && parsed.transactions.length > 0) {
              parseSuccess++;
              return parsed;
            }
            parseNull++;
            return null;
          } catch (err) {
            parseError++;
            console.error(`[insider-trading] Failed to parse ${filing.accessionNumber}:`, err.message);
          }
          return null;
        })
      );
      for (const result of results) {
        if (result) insiders.push(result);
      }
      if (insiders.length >= 10) break;
    }
    console.log(`[DEBUG getInsiderTrading] filings: ${filings.length}, parseSuccess: ${parseSuccess}, parseNull: ${parseNull}, parseError: ${parseError}, insiders: ${insiders.length}`);
  
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

    // Cache empty results with shorter TTL
    const cacheTtl = insiders.length === 0 ? CACHE_TTL_INSIDER_EMPTY : undefined;
    cache.setInsider(cacheKey, result, cacheTtl);
    return result;
  } catch (err) {
    // Do NOT cache errors - let them propagate so next request can retry
    throw err;
  }
}
