export const SIMPLE_LOOKUP_REGEX = /\b(?:price|quote|ticker|market\s+cap|share\s+price|p\/?e|eps|dividend(?:\s+yield)?|52[- ]?week\s+(?:high|low)|beta|volume)\b/i;
export const DEEP_INTENT_REGEX = /\b(?:buy|sell|hold|thesis|risk|risks|analysis|analy[sz]e|valuation|valued|fair\s+value|outlook|catalyst|catalysts|moat|competitive\s+advantage|investment\s+case|downside|upside|earnings|guidance|sec\s+filing|10[- ]?[kq]|fundamentals?|compare|comparison|versus|vs\.?|deep\s+research|portfolio|position\s+sizing|allocation)\b/i;
export const LONG_MESSAGE_THRESHOLD = 600;

export function classifyLane(message, { forceDeep = false, autoDeep = true } = {}) {
  if (forceDeep === true) return "deep";

  const text = typeof message === "string" ? message.trim() : "";
  if (SIMPLE_LOOKUP_REGEX.test(text)) return "fast";
  if (autoDeep !== true) return "fast";
  if (DEEP_INTENT_REGEX.test(text) || text.length >= LONG_MESSAGE_THRESHOLD) return "deep";
  return "fast";
}
