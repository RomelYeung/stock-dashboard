const fs = require('fs');
let code = fs.readFileSync('backend/services/sec.js', 'utf8');

// 1. Fix sshLevel to sshPrnamt
code = code.replace(/const sharesVal = getVal\(sharesInfo, "sshLevel", "SshLevel"\);/g, 'const sharesVal = getVal(sharesInfo, "sshPrnamt", "SshPrnamt");');

// 2. Fix calculateQoQ aggregation
const oldQoq = `export function calculateQoQ(prevHoldings, currentHoldings) {
  const diffs = [];
  const prevMap = new Map(prevHoldings.map(h => [h.ticker, h]));
  const currMap = new Map(currentHoldings.map(h => [h.ticker, h]));

  for (const [ticker, curr] of currMap) {
    const prev = prevMap.get(ticker);
    if (!prev) {
      diffs.push({ ticker, change: "New", sharesDiff: curr.shares, valueDiff: curr.value });
    } else if (curr.shares > prev.shares) {
      diffs.push({ ticker, change: "Increased", sharesDiff: curr.shares - prev.shares, valueDiff: curr.value - prev.value });
    } else if (curr.shares < prev.shares) {
      diffs.push({ ticker, change: "Decreased", sharesDiff: curr.shares - prev.shares, valueDiff: curr.value - prev.value });
    }
  }

  for (const [ticker, prev] of prevMap) {
    if (!currMap.has(ticker)) {
      diffs.push({ ticker, change: "Closed", sharesDiff: -prev.shares, valueDiff: -prev.value });
    }
  }

  return diffs;
}`;

const newQoq = `export function calculateQoQ(prevHoldings, currentHoldings) {
  const diffs = [];
  
  // Aggregate by ticker + optionType to handle multiple rows per ticker
  const aggregate = (holdings) => {
    const map = new Map();
    for (const h of holdings) {
      const key = \`\${h.ticker}-\${(h.optionType || "none").toLowerCase()}\`;
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
}`;

code = code.replace(oldQoq, newQoq);
fs.writeFileSync('backend/services/sec.js', code);
