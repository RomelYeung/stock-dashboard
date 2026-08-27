const MAX_TEXT = 6000;

export function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function pct(from, to) {
  const start = num(from);
  const end = num(to);
  if (start == null || end == null || start === 0) return null;
  return ((end - start) / Math.abs(start)) * 100;
}

function fmtBig(value) {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return value.toFixed(2);
}

function fmtPct(value) {
  return value == null ? "n/a" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function latestTwo(values) {
  if (!Array.isArray(values) || values.length === 0) return [null, null];
  const sorted = [...values].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
  return [sorted.at(-2) || null, sorted.at(-1) || null];
}

function firstNumber(...values) {
  for (const value of values) {
    const number = num(value);
    if (number != null) return number;
  }
  return null;
}

export function buildAnalystBrief(data = {}) {
  const summary = data.summary || {};
  const financials = Array.isArray(data.financials) ? data.financials : data.financials?.annualIncome;
  const balanceSheet = Array.isArray(data.balanceSheet)
    ? data.balanceSheet
    : data.balanceSheet?.annualBalanceSheet;
  const ticker = data.ticker || summary.ticker || "?";
  const redFlags = [];
  const lines = [`# ANALYST BRIEF — ${summary.name || ticker} (${ticker})`];

  if (summary.sector) lines.push(`Sector: ${summary.sector}`);

  const price = firstNumber(summary.currentPrice, summary.price?.regularMarketPrice);
  const fairValue = firstNumber(
    data.dcf?.fairValue,
    data.dcfFairValue,
    summary.dcf?.fairValue,
    summary.fairValue,
  );
  lines.push("", "## VALUATION SNAPSHOT");
  lines.push(`Price: $${price?.toFixed(2) ?? "unavailable"}`);
  if (summary.marketCap != null) lines.push(`Market cap: $${fmtBig(num(summary.marketCap))}`);
  if (summary.trailingPE != null || summary.forwardPE != null || summary.priceToBook != null) {
    lines.push(`P/E trailing ${num(summary.trailingPE)?.toFixed(1) ?? "n/a"} / forward ${num(summary.forwardPE)?.toFixed(1) ?? "n/a"}; P/B ${num(summary.priceToBook)?.toFixed(1) ?? "n/a"}`);
  }
  if (fairValue != null) {
    const upside = price != null && price > 0 ? pct(price, fairValue) : null;
    lines.push(`DCF Fair Value: $${fairValue.toFixed(2)}; implied upside ${fmtPct(upside)}`);
  }

  lines.push("", "## GROWTH & PROFITABILITY");
  const [financialPrev, financialLast] = latestTwo(financials);
  if (financialLast) {
    const revenueGrowth = financialPrev ? pct(financialPrev.totalRevenue, financialLast.totalRevenue) : null;
    const incomeGrowth = financialPrev ? pct(financialPrev.netIncome, financialLast.netIncome) : null;
    const margin = num(financialLast.netIncome) != null && num(financialLast.totalRevenue)
      ? (num(financialLast.netIncome) / num(financialLast.totalRevenue)) * 100
      : null;
    lines.push(`Latest FY revenue $${fmtBig(num(financialLast.totalRevenue))} YoY ${fmtPct(revenueGrowth)}; net income $${fmtBig(num(financialLast.netIncome))} YoY ${fmtPct(incomeGrowth)}; margin ${margin == null ? "n/a" : `${margin.toFixed(1)}%`}`);
  } else {
    lines.push("Income statement: unavailable");
  }

  lines.push("", "## BALANCE SHEET HEALTH");
  const [balancePrev, balanceLast] = latestTwo(balanceSheet);
  let receivablesGrowth = null;
  if (balanceLast) {
    const cash = firstNumber(balanceLast.totalCash, balanceLast.cash);
    const debt = firstNumber(balanceLast.totalDebt);
    const net = (cash || 0) - (debt || 0);
    lines.push(`Cash $${fmtBig(cash)}; debt $${fmtBig(debt)}; net ${net >= 0 ? "cash" : "debt"} $${fmtBig(Math.abs(net))}`);
    if (balancePrev && num(balancePrev.receivables) != null && num(balanceLast.receivables) != null) {
      receivablesGrowth = pct(balancePrev.receivables, balanceLast.receivables);
      lines.push(`Receivables $${fmtBig(num(balanceLast.receivables))} YoY ${fmtPct(receivablesGrowth)}`);
    }
  } else {
    lines.push("Balance sheet: unavailable");
  }

  if (financialPrev && financialLast && receivablesGrowth != null) {
    const revenueGrowth = pct(financialPrev.totalRevenue, financialLast.totalRevenue);
    if (revenueGrowth != null && receivablesGrowth > revenueGrowth * 1.5 && receivablesGrowth > 20) {
      redFlags.push(`FORENSIC: receivables grew ${fmtPct(receivablesGrowth)} vs revenue ${fmtPct(revenueGrowth)}.`);
    }
  }

  lines.push("", "## PRICE ACTION (recent window)");
  const closes = (Array.isArray(data.priceHistory) ? data.priceHistory : [])
    .map((item) => num(item?.close))
    .filter((value) => value != null);
  if (closes.length >= 2) {
    lines.push(`${closes.length}-session move ${fmtPct(pct(closes[0], closes.at(-1)))}; range $${Math.min(...closes).toFixed(2)}–$${Math.max(...closes).toFixed(2)} (last $${closes.at(-1).toFixed(2)})`);
  } else {
    lines.push("Price history: unavailable");
  }

  lines.push("", "## INSIDER ACTIVITY");
  const transactions = Array.isArray(data.insiderData?.transactions) ? data.insiderData.transactions.slice(0, 100) : [];
  if (transactions.length) {
    const buys = transactions.filter((item) => /buy/i.test(item.type || item.transactionType || "")).length;
    const sells = transactions.filter((item) => /sell/i.test(item.type || item.transactionType || "")).length;
    lines.push(`${transactions.length} recent transactions: ${buys} buys / ${sells} sells`);
    if (sells >= 3 * buys && sells >= 3) redFlags.push(`INSIDER: heavy selling cluster (${sells} sells vs ${buys} buys).`);
  } else {
    lines.push("Insider data: unavailable");
  }

  lines.push("", "## OPTIONS MARKET", data.optionChain?.hasOptions ? "Listed options available." : "No listed options.");
  if (redFlags.length) lines.push("", "## AUTO-DETECTED RED FLAGS", ...redFlags.map((flag) => `⚠ ${flag}`));

  let text = lines.join("\n").trim();
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT - 20)}\n…(truncated)`;
  return { text, redFlags };
}
