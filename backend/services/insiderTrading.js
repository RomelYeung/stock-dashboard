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
  const acc = filing.accessionNumber.replace(/-/g, "");
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
