export function formatPrice(value, currency = "USD") {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMarketCap(value) {
  if (value == null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}

export function formatPercent(value, decimals = 1) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatMultiple(value, decimals = 1, suffix = "x") {
  if (value == null) return "—";
  return `${value.toFixed(decimals)}${suffix}`;
}

export function formatChange(value) {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

export function formatPriceChange(value) {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

export function formatRevenue(value) {
  if (value == null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
}

export function formatYear(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).getFullYear().toString();
}

export function isPositive(value) {
  return value != null && value >= 0;
}
