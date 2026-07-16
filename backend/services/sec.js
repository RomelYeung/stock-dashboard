import prisma from "./db.js";
import { searchTickers } from "./yahoofinance.js";
import xml2js from "xml2js";
import cron from "node-cron";

const SEC_HEADERS = {
  "User-Agent": "StockDashboard/1.0 (contact@example.com)",
};

export const CURATED_INVESTORS = [
  { CIK: "0001067983", name: "Warren Buffett", fundName: "Berkshire Hathaway Inc", philosophy: "Value Investing", tags: ["value", "long-term", "legendary"] },
  { CIK: "0001350694", name: "Ray Dalio", fundName: "Bridgewater Associates", philosophy: "Macro", tags: ["macro", "diversified"] },
  { CIK: "0001336528", name: "Bill Ackman", fundName: "Pershing Square", philosophy: "Concentrated Value", tags: ["value", "activist"] },
  { CIK: "0001656456", name: "David Tepper", fundName: "Appaloosa LP", philosophy: "Opportunistic", tags: ["distressed", "tech"] },
  { CIK: "0000949509", name: "Howard Marks", fundName: "Oaktree Capital Management", philosophy: "Distressed Debt", tags: ["debt", "value"] },
  { CIK: "0001649339", name: "Michael Burry", fundName: "Scion Asset Management, LLC", philosophy: "Contrarian / Value", tags: ["contrarian", "short", "macro"] },
  { CIK: "0001061768", name: "Seth Klarman", fundName: "Baupost Group", philosophy: "Deep Value", tags: ["value", "margin-of-safety"] },
  { CIK: "0001536411", name: "Stanley Druckenmiller", fundName: "Duquesne Family Office", philosophy: "Growth / Macro", tags: ["macro", "growth"] },
  { CIK: "0001709323", name: "Li Lu", fundName: "Himalaya Capital", philosophy: "Value Growth", tags: ["china", "growth"] },
  { CIK: "0001569205", name: "Terry Smith", fundName: "Fundsmith", philosophy: "Quality Growth", tags: ["quality", "moat"] },
  { CIK: "0001167483", name: "Chase Coleman", fundName: "Tiger Global", philosophy: "Growth & Tech", tags: ["growth", "venture"] }
];

const LOCAL_CUSIP_MAP = {
  "037833100": "AAPL",
  "594918104": "MSFT",
  "023135106": "AMZN",
  "30231G102": "XOM",
  "459200101": "IBM",
  "02079K305": "GOOGL",
  "02079K107": "GOOG",
  "30303M102": "META",
  "88160R101": "TSLA",
  "67066G104": "NVDA",
  "060505104": "BAC",
  "191216100": "KO",
  "254687106": "DIS",
  "607059109": "MS",
  "46625H100": "JPM",
  "92826C839": "V",
  "57636Q104": "MA",
  "717081103": "PFE",
  "478160104": "JNJ",
  "742718109": "PG",
};

// 1. SEC EDGAR API Client Rate Limiter (Max 10 requests/sec)
class RateLimiter {
  constructor(limitPerSec) {
    this.delay = 1000 / limitPerSec;
    this.lastCall = 0;
  }

  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.delay) {
      const waitTime = this.delay - elapsed;
      this.lastCall = now + waitTime;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
      this.lastCall = now;
    }
  }
}

const secLimiter = new RateLimiter(10);

// Helper to look up values inside parsed XML with casing options
function getVal(obj, ...keys) {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
    const lowerKey = key.toLowerCase();
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === lowerKey) {
        return obj[k];
      }
    }
  }
  return undefined;
}

// F1.1: Parse 13F XML filings to extract holdings
export async function parse13Fxml(xmlString) {
  if (!xmlString || typeof xmlString !== "string" || !xmlString.trim()) {
    throw new Error("Malformed XML: empty content");
  }
  const parser = new xml2js.Parser({
    explicitArray: false,
    tagNameProcessors: [xml2js.processors.stripPrefix]
  });
  try {
    const result = await parser.parseStringPromise(xmlString);
    let infoTableRoot = getVal(result, "informationTable", "InfoTable");
    if (!infoTableRoot) {
      infoTableRoot = result;
    }
    if (!infoTableRoot) return [];

    let infoEntries = getVal(infoTableRoot, "infoTable", "InfoTable");
    if (!infoEntries) {
      infoEntries = getVal(result, "infoTable", "InfoTable");
    }
    if (!infoEntries) return [];

    if (!Array.isArray(infoEntries)) {
      infoEntries = [infoEntries];
    }

    return infoEntries.map(entry => {
      const sharesInfo = getVal(entry, "shrsOrPrnAmt", "ShrsOrPrnAmt");
      const sharesVal = getVal(sharesInfo, "sshPrnamt", "SshPrnamt", "sshLevel", "SshLevel");
      const companyName = getVal(entry, "nameOfIssuer", "NameOfIssuer");
      const cusip = getVal(entry, "cusip", "Cusip", "CUSIP");
      const value = getVal(entry, "value", "Value");
      const optionTypeVal = getVal(entry, "putCall", "PutCall");

      return {
        companyName: companyName || "",
        cusip: cusip || "",
        CUSIP: cusip || "",
        shares: parseFloat(sharesVal || 0),
        value: parseFloat(value || 0),
        optionType: (optionTypeVal || "none").toLowerCase()
      };
    });
  } catch (err) {
    throw new Error("Malformed XML: " + err.message);
  }
}

// F1.2: Parse 13D/13G filings
export function parse13D_G(filingData) {
  const is13D = filingData.type === "13D";
  const is13G = filingData.type === "13G";
  if (!is13D && !is13G) {
    throw new Error("Invalid filing type");
  }

  let convictionScore = is13D ? 8.5 : 5.0;
  if (filingData.percentOfClass > 10) {
    convictionScore += 1.5;
  }

  return {
    eventType: filingData.eventType || (is13D ? "Acquisition" : "Statement"),
    date: new Date(filingData.date),
    convictionScore
  };
}

// F1.3: CUSIP-to-ticker mapping helper (synchronous for tests)
export function translateCusipToTicker(cusip, localCache = {}, fallbackFetcher = null) {
  if (localCache[cusip]) {
    return localCache[cusip];
  }
  if (fallbackFetcher) {
    const fallbackTicker = fallbackFetcher(cusip);
    if (fallbackTicker) return fallbackTicker;
  }
  return LOCAL_CUSIP_MAP[cusip] || null;
}

// Asynchronous CUSIP translation with DB caching and Yahoo Finance lookup
export async function resolveCusipToTicker(cusip) {
  if (!cusip) return null;

  // 1. Check DB cache
  try {
    const mapped = await prisma.cusipMapping.findUnique({
      where: { CUSIP: cusip }
    });
    if (mapped) return mapped.ticker;
  } catch (err) {
    console.error(`DB mapping lookup failed for CUSIP ${cusip}:`, err.message);
  }

  // 2. Check local hardcoded fallback map
  if (LOCAL_CUSIP_MAP[cusip]) {
    return LOCAL_CUSIP_MAP[cusip];
  }

  // 3. Fallback to Yahoo Finance Search
  try {
    const quotes = await searchTickers(cusip);
    if (quotes && quotes.length > 0) {
      const symbol = quotes[0].symbol;
      const companyName = quotes[0].shortname || quotes[0].longname || "";
      if (symbol) {
        // Upsert in database
        try {
          await prisma.cusipMapping.upsert({
            where: { CUSIP: cusip },
            update: { ticker: symbol, companyName },
            create: { CUSIP: cusip, ticker: symbol, companyName }
          });
        } catch (dbErr) {
          console.error(`Failed to upsert CUSIP mapping for ${cusip}:`, dbErr.message);
        }
        return symbol;
      }
    }
  } catch (err) {
    console.error(`Yahoo Finance lookup failed for CUSIP ${cusip}:`, err.message);
  }

  return null;
}

// F1.5: Calculate QoQ position differences
export function calculateQoQ(prevHoldings, currentHoldings) {
  const diffs = [];
  
  // Aggregate by ticker + optionType to handle multiple rows per ticker
  const aggregate = (holdings) => {
    const map = new Map();
    for (const h of holdings) {
      const key = `${h.ticker}-${(h.optionType || "none").toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, { ...h });
      } else {
        const existing = map.get(key);
        existing.shares += h.shares;
        existing.value += h.value;
      }
    }
    return map;
  };

  const prevMap = aggregate(prevHoldings);
  const currMap = aggregate(currentHoldings);

  for (const [key, curr] of currMap) {
    const prev = prevMap.get(key);
    if (!prev) {
      diffs.push({ ticker: curr.ticker, optionType: curr.optionType, change: "New", sharesDiff: curr.shares, valueDiff: curr.value });
    } else if (curr.shares > prev.shares) {
      diffs.push({ ticker: curr.ticker, optionType: curr.optionType, change: "Increased", sharesDiff: curr.shares - prev.shares, valueDiff: curr.value - prev.value });
    } else if (curr.shares < prev.shares) {
      diffs.push({ ticker: curr.ticker, optionType: curr.optionType, change: "Decreased", sharesDiff: curr.shares - prev.shares, valueDiff: curr.value - prev.value });
    }
  }

  for (const [key, prev] of prevMap) {
    if (!currMap.has(key)) {
      diffs.push({ ticker: prev.ticker, optionType: prev.optionType, change: "Closed", sharesDiff: -prev.shares, valueDiff: -prev.value });
    }
  }

  return diffs;
}

// F1.10: History pruning logic
export function pruneHistory(filings) {
  const sorted = [...filings].sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted.slice(0, 8);
}

// Clean history in the database (keeping exactly 20 most recent filings)
export async function pruneInvestorHistoryInDB(investorId) {
  try {
    const filings = await prisma.filing.findMany({
      where: { investorId },
      orderBy: { date: "desc" }
    });
    if (filings.length > 20) {
      const toKeep = filings.slice(0, 20);
      const toKeepIds = toKeep.map(f => f.id);
      await prisma.filing.deleteMany({
        where: {
          investorId,
          id: { notIn: toKeepIds }
        }
      });
      console.log(`[pruner] Pruned filings for investor ${investorId}. Retained ${toKeepIds.length} filings.`);
    }
  } catch (err) {
    console.error(`[pruner] Failed to prune history for investor ${investorId}:`, err.message);
  }
}

// F5.10: Large payload token limits truncator
export function truncateHoldingsForPrompt(holdings, tokenLimit = 100) {
  const truncated = [];
  let tokenCount = 0;
  for (const h of holdings) {
    if (tokenCount + 10 > tokenLimit) break;
    truncated.push(h);
    tokenCount += 10;
  }
  return truncated;
}

// Extract percent of class from 13D/13G filings
function extractPercentOfClass(docText) {
  const regexes = [
    /percent\s*of\s*class\s*represented\s*by\s*amount\s*in\s*row\s*\(?\d+\)?\s*:?\s*([\d\.]+)/i,
    /percent\s*of\s*class\s*:?\s*([\d\.]+)/i,
    /percent\s*of\s*class\s*represented\s*:?\s*([\d\.]+)/i,
    /class\s*represented\s*by\s*amount\s*in\s*row\s*\(11\)\s*([\d\.]+)/i,
    /item\s*11\s*percent\s*of\s*class\s*represented\s*by\s*amount\s*in\s*row\s*\(9\)\s*([\d\.]+)/i
  ];
  for (const regex of regexes) {
    const match = docText.match(regex);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0 && val <= 100) {
        return val;
      }
    }
  }
  const idx = docText.toLowerCase().indexOf("percent of class");
  if (idx !== -1) {
    const sub = docText.substring(idx, idx + 200);
    const m = sub.match(/([\d\.]+)\s*%/);
    if (m && m[1]) {
      const val = parseFloat(m[1]);
      if (!isNaN(val) && val > 0 && val <= 100) return val;
    }
  }
  return 5.0;
}

// Extract 13D/13G targets and shares
function extract13D_GData(docText) {
  const percentOfClass = extractPercentOfClass(docText);

  let cusip = null;
  const cusipRegexes = [
    /CUSIP\s*No\.?\s*:?\s*([\w\d\-]+)/i,
    /CUSIP\s*NUMBER\s*:?\s*([\w\d\-]+)/i
  ];
  for (const regex of cusipRegexes) {
    const match = docText.match(regex);
    if (match && match[1]) {
      cusip = match[1].replace(/[^a-zA-Z0-9]/g, "");
      break;
    }
  }

  let shares = 0;
  const sharesRegexes = [
    /Aggregate\s*Amount\s*Beneficially\s*Owned\s*by\s*Each\s*Reporting\s*Person\s*\(?9\)?\s*([\d,]+)/i,
    /Amount\s*Beneficially\s*Owned\s*:\s*([\d,]+)/i,
    /row\s*\(9\)\s*([\d,]+)/i
  ];
  for (const regex of sharesRegexes) {
    const match = docText.match(regex);
    if (match && match[1]) {
      shares = parseFloat(match[1].replace(/,/g, ""));
      break;
    }
  }

  return { percentOfClass, cusip, shares };
}

// Real-world syncInvestor function
export async function syncInvestor(cik) {
  if (!cik) throw new Error("CIK is required");
  const paddedCik = cik.trim().padStart(10, "0");

  // Fetch recent filings metadata for CIK
  await secLimiter.throttle();
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  const submissionsRes = await fetch(submissionsUrl, { headers: SEC_HEADERS });
  if (!submissionsRes.ok) {
    throw new Error(`SEC submissions failed for CIK ${paddedCik}: ${submissionsRes.status}`);
  }
  const data = await submissionsRes.json();

  // Find or create Investor
  let investor = await prisma.investor.findUnique({
    where: { CIK: paddedCik }
  });

  const curated = CURATED_INVESTORS.find(c => c.CIK === paddedCik);

  if (!investor) {
    investor = await prisma.investor.create({
      data: {
        CIK: paddedCik,
        name: curated?.name || data.name || "Unknown Investor",
        fundName: curated?.fundName || data.name || "Unknown Fund",
        philosophy: curated?.philosophy || "Value",
        bio: curated?.bio || "",
        photoUrl: curated?.photoUrl || "",
        tags: curated?.tags ? curated.tags : ["value"],
        currentAum: 0
      }
    });
  }

  // Parse filings
  const recentFilings = data.filings?.recent || {};
  let forms = [...(recentFilings.form || [])];
  let accessionNumbers = [...(recentFilings.accessionNumber || [])];
  let filingDates = [...(recentFilings.filingDate || [])];
  let reportDates = [...(recentFilings.reportDate || [])];
  let primaryDocs = [...(recentFilings.primaryDocument || [])];

  // Fetch paginated filing history
  const additionalFiles = data.filings?.files || [];
  for (const fileEntry of additionalFiles) {
    await secLimiter.throttle();
    const pageUrl = `https://data.sec.gov/submissions/${fileEntry.name}`;
    try {
      const pageRes = await fetch(pageUrl, { headers: SEC_HEADERS });
      if (!pageRes.ok) {
        console.error(`Failed to fetch paginated submissions page: ${fileEntry.name}`);
        continue;
      }
      const page = await pageRes.json();
      if (page.form) forms.push(...page.form);
      if (page.accessionNumber) accessionNumbers.push(...page.accessionNumber);
      if (page.filingDate) filingDates.push(...page.filingDate);
      if (page.reportDate) reportDates.push(...page.reportDate);
      if (page.primaryDocument) primaryDocs.push(...page.primaryDocument);
    } catch (e) {
      console.error(`Error fetching paginated submissions page: ${fileEntry.name}`, e.message);
    }
  }

  const targetFilings = [];
  for (let i = 0; i < forms.length; i++) {
    const formType = forms[i];
    if (formType === "13F-HR" || formType === "13F-HR/A" || formType === "13D" || formType === "13G") {
      targetFilings.push({
        accessionNumber: accessionNumbers[i],
        date: new Date(filingDates[i]),
        periodOfReport: new Date(reportDates[i] || filingDates[i]),
        type: formType,
        primaryDocument: primaryDocs[i],
      });
    }
  }

  // Sort by date descending to ensure we process the most recent ones first
  targetFilings.sort((a, b) => b.date - a.date);

  // Limit processing to 20 most recent to avoid overwhelming
  const limitedFilings = targetFilings.slice(0, 20);

  for (const f of limitedFilings) {
    // Check if filing already exists
    const existing = await prisma.filing.findUnique({
      where: { accessionNumber: f.accessionNumber }
    });
    if (existing) continue;

    const acc = f.accessionNumber.replace(/-/g, "");
    const cikNum = parseInt(paddedCik, 10);

    if (f.type === "13F-HR" || f.type === "13F-HR/A") {
      // Fetch folder directory index
      await secLimiter.throttle();
      const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/index.json`;
      const indexRes = await fetch(indexUrl, { headers: SEC_HEADERS });
      if (!indexRes.ok) {
        console.error(`Failed to fetch index.json for accession ${f.accessionNumber}`);
        continue;
      }
      const indexData = await indexRes.json();
      const files = indexData.directory?.item || [];

      const xmlFiles = files.filter(file => file.name.endsWith(".xml"));
      let xmlFileName = null;
      if (xmlFiles.length > 0) {
        const sorted = [...xmlFiles].sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aScore = (aName.includes("table") || aName.includes("holding") || aName.includes("infotable")) ? 1 : 0;
          const bScore = (bName.includes("table") || bName.includes("holding") || bName.includes("infotable")) ? 1 : 0;
          return bScore - aScore;
        });
        xmlFileName = sorted[0].name;
      }

      if (!xmlFileName) {
        console.error(`No XML holdings table found in accession ${f.accessionNumber}`);
        continue;
      }

      await secLimiter.throttle();
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${xmlFileName}`;
      const xmlRes = await fetch(xmlUrl, { headers: SEC_HEADERS });
      if (!xmlRes.ok) {
        console.error(`Failed to fetch XML from ${xmlUrl}`);
        continue;
      }
      const xmlString = await xmlRes.text();
      const parsedHoldings = await parse13Fxml(xmlString);

      const resolvedHoldings = [];
      let totalValue = 0;
      for (const raw of parsedHoldings) {
        const ticker = await resolveCusipToTicker(raw.cusip || raw.CUSIP);
        if (ticker) {
          resolvedHoldings.push({
            ticker,
            CUSIP: raw.cusip || raw.CUSIP,
            companyName: raw.companyName || null,
            shares: raw.shares,
            value: raw.value,
            optionType: raw.optionType || "none"
          });
          totalValue += raw.value;
        }
      }

      // Create Filing, Holdings and update Investor inside a transaction
      await prisma.$transaction(async (tx) => {
        const newFiling = await tx.filing.create({
          data: {
            date: f.date,
            accessionNumber: f.accessionNumber,
            periodOfReport: f.periodOfReport,
            type: f.type,
            investorId: investor.id
          }
        });

        const holdingsData = resolvedHoldings.map(h => {
          const weight = totalValue > 0 ? h.value / totalValue : 0;
          return {
            ticker: h.ticker,
            CUSIP: h.CUSIP,
            companyName: h.companyName || null,
            shares: h.shares,
            value: h.value,
            optionType: h.optionType,
            portfolioWeight: weight,
            convictionScore: weight * 10,
            filingId: newFiling.id
          };
        });

        if (holdingsData.length > 0) {
          await tx.holding.createMany({
            data: holdingsData
          });
        }
      });
    } else {
      // 13D or 13G
      const primaryDoc = f.primaryDocument;
      if (!primaryDoc) continue;

      await secLimiter.throttle();
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${primaryDoc}`;
      const docRes = await fetch(docUrl, { headers: SEC_HEADERS });
      if (!docRes.ok) {
        console.error(`Failed to fetch 13D/G document from ${docUrl}`);
        continue;
      }
      const docText = await docRes.text();
      const parsed13D_GData = extract13D_GData(docText);
      const parsedScore = parse13D_G({
        type: f.type,
        percentOfClass: parsed13D_GData.percentOfClass,
        date: f.date
      });

      let ticker = null;
      if (parsed13D_GData.cusip) {
        ticker = await resolveCusipToTicker(parsed13D_GData.cusip);
      }
      if (!ticker) {
        ticker = "UNKNOWN";
      }

      // Create Filing, Holding and update Investor inside a transaction
      await prisma.$transaction(async (tx) => {
        const newFiling = await tx.filing.create({
          data: {
            date: f.date,
            accessionNumber: f.accessionNumber,
            periodOfReport: f.periodOfReport,
            type: f.type,
            investorId: investor.id
          }
        });

        await tx.holding.create({
          data: {
            ticker,
            CUSIP: parsed13D_GData.cusip || "UNKNOWN",
            shares: parsed13D_GData.shares || 0,
            value: 0,
            optionType: "none",
            portfolioWeight: (parsed13D_GData.percentOfClass || 0) / 100,
            convictionScore: parsedScore.convictionScore,
            filingId: newFiling.id
          }
        });
      });
    }
  }

  // Keep exactly 20 most recent filings
  await pruneInvestorHistoryInDB(investor.id);

  // Update investor's lastFilingDate and currentAum based on database state
  const mostRecentFiling = await prisma.filing.findFirst({
    where: { investorId: investor.id },
    orderBy: { date: "desc" }
  });
  
  const mostRecent13F = await prisma.filing.findFirst({
    where: { investorId: investor.id, type: { in: ["13F-HR", "13F-HR/A"] } },
    orderBy: { periodOfReport: "desc" },
    include: { holdings: true }
  });

  const updateData = {};
  if (mostRecentFiling) {
    updateData.lastFilingDate = mostRecentFiling.date;
  }
  if (mostRecent13F) {
    const totalValue = mostRecent13F.holdings.reduce((sum, h) => sum + h.value, 0);
    updateData.currentAum = totalValue * 1000;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.investor.update({
      where: { id: investor.id },
      data: updateData
    });
  }
}

// Start daily scheduled cron job
export function startDailySyncCron() {
  // Check daily at 1:00 AM
  cron.schedule("0 1 * * *", async () => {
    console.log("[cron] Starting daily filings sync for curated investors...");
    for (const cur of CURATED_INVESTORS) {
      try {
        console.log(`[cron] Syncing investor CIK: ${cur.CIK} (${cur.name})...`);
        await syncInvestor(cur.CIK);
      } catch (err) {
        console.error(`[cron] Failed to sync ${cur.name} (${cur.CIK}):`, err.message);
      }
    }
    console.log("[cron] Daily filings sync completed.");
  });
}
