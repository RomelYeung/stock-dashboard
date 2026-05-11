// Sector-specific parameters from Damodaran's Cost of Capital by Industry (Jan 2026)

const SECTOR_ERP = {
  Technology: 0.06,
  "Communication Services": 0.055,
  "Consumer Cyclical": 0.055,
  "Consumer Defensive": 0.045,
  Healthcare: 0.05,
  "Financial Services": 0.045,
  Industrials: 0.05,
  Energy: 0.05,
  Utilities: 0.04,
  "Real Estate": 0.045,
  "Basic Materials": 0.055,
};

const SECTOR_TERMINAL_GROWTH = {
  Technology: 0.030,
  "Communication Services": 0.028,
  "Consumer Cyclical": 0.027,
  "Consumer Defensive": 0.022,
  Healthcare: 0.025,
  "Financial Services": 0.025,
  Industrials: 0.025,
  Energy: 0.025,
  Utilities: 0.020,
  "Real Estate": 0.022,
  "Basic Materials": 0.025,
};

const SECTOR_REF_WACC = {
  Technology: 0.1006,
  "Communication Services": 0.081,
  "Consumer Cyclical": 0.082,
  "Consumer Defensive": 0.062,
  Healthcare: 0.078,
  "Financial Services": 0.058,
  Industrials: 0.078,
  Energy: 0.072,
  Utilities: 0.045,
  "Real Estate": 0.058,
  "Basic Materials": 0.085,
};

const SIZE_BRACKETS = [
  { maxMarketCap: 300_000_000, premium: 0.030, label: "Micro Cap" },
  { maxMarketCap: 2_000_000_000, premium: 0.020, label: "Small Cap" },
  { maxMarketCap: 10_000_000_000, premium: 0.010, label: "Mid Cap" },
  { maxMarketCap: 50_000_000_000, premium: 0.005, label: "Large Cap" },
  { maxMarketCap: 200_000_000_000, premium: 0.0025, label: "Mega Cap" },
  { maxMarketCap: Infinity, premium: 0, label: "Ultra Cap" },
];

const DEFAULT_PARAMS = {
  erp: 0.05,
  terminalGrowth: 0.025,
  refWacc: 0.0696,
};

function getSectorParams(sector) {
  if (!sector) return DEFAULT_PARAMS;
  const normalized = Object.keys(SECTOR_ERP).find(
    (k) => k.toLowerCase() === sector.trim().toLowerCase()
  );
  if (!normalized) return DEFAULT_PARAMS;
  return {
    erp: SECTOR_ERP[normalized],
    terminalGrowth: SECTOR_TERMINAL_GROWTH[normalized],
    refWacc: SECTOR_REF_WACC[normalized],
  };
}

function getSizePremium(marketCap) {
  if (!marketCap || marketCap <= 0) return 0;
  for (const bracket of SIZE_BRACKETS) {
    if (marketCap <= bracket.maxMarketCap) return bracket.premium;
  }
  return 0;
}

function getSizeLabel(marketCap) {
  if (!marketCap || marketCap <= 0) return "";
  for (const bracket of SIZE_BRACKETS) {
    if (marketCap <= bracket.maxMarketCap) return bracket.label;
  }
  return "";
}

export { getSectorParams, getSizePremium, getSizeLabel, SECTOR_REF_WACC };
