export const NYSE_HOLIDAYS = new Map([
  [2025, new Set(["01-01", "01-20", "02-17", "04-18", "05-26", "06-19", "07-04", "09-01", "11-27", "12-25"])],
  [2026, new Set(["01-01", "01-19", "02-16", "04-03", "05-25", "06-19", "07-03", "09-07", "11-26", "12-25"])],
  [2027, new Set(["01-01", "01-18", "02-15", "04-16", "05-31", "06-18", "07-05", "09-06", "11-25", "12-24"])]
]);

export function getNYTradingDateStr() {
  const now = new Date();
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(now);
  const month = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit' }).format(now);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', day: '2-digit' }).format(now);
  return `${year}-${month}-${day}`;
}

export function getNYTradingDate() {
  return new Date(getNYTradingDateStr() + "T00:00:00Z");
}

export function isTradingDay(dateStr) {
  const date = new Date(dateStr + "T00:00:00Z");
  const dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const mmdd = `${monthStr}-${dayStr}`;
  
  if (NYSE_HOLIDAYS.has(year) && NYSE_HOLIDAYS.get(year).has(mmdd)) {
    return false;
  }
  
  return true;
}

export function getMissedTradingDays(sinceDate, untilDate) {
  const missed = [];
  const curr = new Date(sinceDate + "T00:00:00Z");
  curr.setUTCDate(curr.getUTCDate() + 1);
  const end = new Date(untilDate + "T00:00:00Z");
  
  while (curr <= end) {
    const yyyy = curr.getUTCFullYear();
    const mm = String(curr.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(curr.getUTCDate()).padStart(2, '0');
    const currStr = `${yyyy}-${mm}-${dd}`;
    
    if (isTradingDay(currStr)) {
      missed.push(currStr);
    }
    
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return missed;
}
