import * as xlsx from 'xlsx';
import NodeCache from 'node-cache';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CACHE_TTL_FRED } from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const aaiiCache = new NodeCache({ stdTTL: CACHE_TTL_FRED });
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'sentiment.xls');
const TMP_FILE_PATH = path.join(DATA_DIR, 'sentiment.xls.tmp');

// AAII uses Imperva WAF which often blocks Node's fetch. Curl is more successful.
function downloadExcel() {
  return new Promise((resolve, reject) => {
    const cmd = `curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -H "Accept: application/vnd.ms-excel" -H "Accept-Language: en-US,en;q=0.9" -o "${TMP_FILE_PATH}" https://www.aaii.com/files/surveys/sentiment.xls`;
    exec(cmd, (error) => {
      if (error) {
        return reject(error);
      }
      
      // Check if WAF blocked it
      const stats = fs.statSync(TMP_FILE_PATH);
      if (stats.size < 50000) {
          return reject(new Error("WAF block detected"));
      }
      
      // Move tmp to actual file
      fs.renameSync(TMP_FILE_PATH, FILE_PATH);
      resolve();
    });
  });
}

function parseExcel(filePath) {
  if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist");
  }
  const stats = fs.statSync(filePath);
  if (stats.size < 50000) {
      throw new Error("AAII WAF block detected. Please download sentiment.xls manually from https://www.aaii.com/files/surveys/sentiment.xls and place it in backend/data/sentiment.xls");
  }

  const buffer = fs.readFileSync(filePath);
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
  
  const history = [];
  
  for (let i = 5; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;
    
    const dateStr = row[0];
    const bullishStr = row[1];
    const neutralStr = row[2];
    const bearishStr = row[3];
    const spreadStr = row[6];
    
    if (!dateStr || typeof dateStr !== 'string') continue;
    if (!bullishStr || typeof bullishStr !== 'string' || !bullishStr.includes('%')) continue;
    
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      let year = parseInt(parts[2], 10);
      if (year < 100) {
          year += (year > 50 ? 1900 : 2000);
      }
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      
      history.push({
        date: formattedDate,
        bullish: parseFloat(bullishStr),
        neutral: parseFloat(neutralStr),
        bearish: parseFloat(bearishStr),
        spread: parseFloat(spreadStr)
      });
    }
  }
  
  if (history.length === 0) {
      throw new Error("No valid data rows found in AAII excel");
  }
  
  history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return history;
}

export async function getAAIISentiment() {
  const cacheKey = 'aaii_sentiment';
  const cached = aaiiCache.get(cacheKey);
  if (cached) return cached;

  let history;
  try {
    // Attempt to download the latest file
    await downloadExcel();
    history = parseExcel(FILE_PATH);
  } catch (error) {
    console.error('Error fetching/parsing AAII excel, falling back to cached file if exists:', error);
    // If blocked by WAF or offline, parse the last successful downloaded file
    if (fs.existsSync(FILE_PATH)) {
      try {
        history = parseExcel(FILE_PATH);
      } catch (e) {
        throw new Error(e.message);
      }
    } else {
      throw error;
    }
  }

  const latest = history[history.length - 1];
  const result = {
    currentValue: latest.spread,
    currentBullish: latest.bullish,
    currentBearish: latest.bearish,
    history: history
  };
  
  aaiiCache.set(cacheKey, result);
  return result;
}
