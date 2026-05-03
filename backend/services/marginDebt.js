import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MARGIN_DEBT_UPDATE_DAYS_MIN,
  MARGIN_DEBT_UPDATE_DAYS_MAX,
  MARGIN_DEBT_STALE_DAYS,
} from '../constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const JSON_FILE = path.join(DATA_DIR, 'margin-debt.json');
// NOTE: This URL may become stale. Check https://www.finra.org/investors/insights/margin-statistics for updates.
const EXCEL_URL = 'https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx';

// Convert "2026-03" to ISO date "2026-03-01"
function parseYearMonth(yearMonth) {
  if (!yearMonth || typeof yearMonth !== 'string') return null;
  const match = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

// Download Excel file from FINRA
async function downloadExcel() {
  const response = await fetch(EXCEL_URL);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`FINRA Excel file not found (404). The URL may be outdated: ${EXCEL_URL}`);
    }
    throw new Error(`Failed to download Excel: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

// Parse Excel buffer to JSON
function parseExcel(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON, skip header rows
  const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  // Find the data start row (look for "Year-Month" header)
  let dataStartRow = 0;
  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (row[0] && String(row[0]).includes('Year-Month')) {
      dataStartRow = i + 1;
      break;
    }
  }

  const data = [];
  for (let i = dataStartRow; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row[0] || !row[1]) continue;

    const yearMonth = String(row[0]);
    const debitBalances = parseFloat(row[1]) || null;
    const freeCreditCash = parseFloat(row[2]) || null;
    const freeCreditMargin = parseFloat(row[3]) || null;

    const date = parseYearMonth(yearMonth);
    if (!date) continue;

    data.push({
      date,
      yearMonth,
      debitBalances,
      freeCreditCash,
      freeCreditMargin,
    });
  }

  return data;
}

// Save data to JSON file
function saveToJson(data) {
  const jsonData = {
    lastUpdated: new Date().toISOString(),
    source: EXCEL_URL,
    data,
  };
  fs.writeFileSync(JSON_FILE, JSON.stringify(jsonData, null, 2));
  return jsonData;
}

// Read data from JSON file
function readFromJson() {
  if (!fs.existsSync(JSON_FILE)) return null;
  const content = fs.readFileSync(JSON_FILE, 'utf-8');
  return JSON.parse(content);
}

// Check if update is needed (3rd week of month = day 15-21)
function shouldUpdate() {
  const now = new Date();
  const dayOfMonth = now.getDate();
  return dayOfMonth >= MARGIN_DEBT_UPDATE_DAYS_MIN && dayOfMonth <= MARGIN_DEBT_UPDATE_DAYS_MAX;
}

// Main update function
export async function updateMarginDebt() {
  try {
    console.log('[margin-debt] Downloading Excel from FINRA...');
    const buffer = await downloadExcel();

    // Clean up old Excel files if any
    const files = fs.readdirSync(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.xlsx')) {
        fs.unlinkSync(path.join(DATA_DIR, file));
        console.log(`[margin-debt] Cleaned up old file: ${file}`);
      }
    }

    console.log('[margin-debt] Parsing Excel...');
    const data = parseExcel(buffer);
    console.log(`[margin-debt] Parsed ${data.length} records`);

    console.log('[margin-debt] Saving to JSON...');
    const jsonData = saveToJson(data);

    console.log('[margin-debt] Update completed successfully');
    return jsonData;
  } catch (err) {
    console.error('[margin-debt] Update failed:', err.message);
    throw err;
  }
}

// Get margin debt data for API
export function getMarginDebt(period = '1y') {
  const jsonData = readFromJson();
  if (!jsonData) {
    return { currentValue: null, history: [], error: 'No data available. Please update.' };
  }

  const { data, lastUpdated } = jsonData;

  // Calculate date filter based on period
  const now = new Date();
  let startDate = new Date(now);
  switch (period) {
    case '3mo': startDate.setMonth(now.getMonth() - 3); break;
    case '6mo': startDate.setMonth(now.getMonth() - 6); break;
    case '1y': startDate.setFullYear(now.getFullYear() - 1); break;
    case '2y': startDate.setFullYear(now.getFullYear() - 2); break;
    case '5y': startDate.setFullYear(now.getFullYear() - 5); break;
    default: startDate = new Date(0); // All data
  }

  const filteredData = data.filter(item => {
    const itemDate = new Date(item.date);
    return itemDate >= startDate;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  const currentValue = filteredData.length > 0
    ? filteredData[filteredData.length - 1].debitBalances
    : null;

  const history = filteredData.map(item => ({
    date: item.date,
    value: item.debitBalances,
  }));

  // Warn if data is stale
  const lastDataDate = filteredData.length > 0 ? new Date(filteredData[filteredData.length - 1].date) : null;
  const daysSinceUpdate = lastDataDate ? Math.floor((now - lastDataDate) / (1000 * 60 * 60 * 24)) : null;
  const staleWarning = daysSinceUpdate && daysSinceUpdate > MARGIN_DEBT_STALE_DAYS
    ? `Data may be stale (last update: ${daysSinceUpdate} days ago). Consider running update.`
    : null;

  return {
    currentValue,
    history,
    lastUpdated,
    error: null,
    staleWarning,
  };
}

// Auto-update check on server startup
export async function autoUpdateCheck() {
  if (shouldUpdate()) {
    console.log('[margin-debt] Auto-update triggered (3rd week of month)...');
    try {
      await updateMarginDebt();
    } catch (err) {
      console.error('[margin-debt] Auto-update failed:', err.message);
    }
  } else {
    console.log('[margin-debt] Auto-update not needed (not 3rd week of month)');
  }
}