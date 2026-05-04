import NodeCache from 'node-cache';
import * as cache from './cache.js';

import {
  CACHE_TTL_FRED,
  FRED_TIMEOUT_MS,
} from "../constants.js";

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const fredCache = new NodeCache({ stdTTL: CACHE_TTL_FRED });

const getStartDate = (monthsAgo) => {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  return date.toISOString().split('T')[0];
};

const periodToMonths = (period) => {
  if (!period) return 60; // Default 5 years
  const match = period.match(/^(\d+)(mo|y)$/);
  if (!match) return 60;
  return match[2] === 'y' ? parseInt(match[1]) * 12 : parseInt(match[1]);
};

const fetchFRED = async (seriesId, startDate, frequency = 'm') => {
  const FRED_API_KEY = process.env.FRED_API_KEY;
  if (!FRED_API_KEY) {
    throw new Error('FRED_API_KEY is not configured');
  }
  const cacheKey = `fred_${seriesId}_${startDate}_${frequency}`;
  const cached = fredCache.get(cacheKey);
  if (cached) return cached;

  const url = `${FRED_BASE_URL}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&frequency=${frequency}`;
  console.log("FRED API URL:", url.replace(FRED_API_KEY, "***"));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FRED_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    const safeMessage = err.message.replaceAll(FRED_API_KEY, '***');
    throw new Error(`FRED API fetch failed: ${safeMessage}`);
  }
  clearTimeout(timeoutId);

  console.log(`FRED API response: ${response.status} ${response.statusText}`);
  if (!response.ok) {
    const text = await response.text();
    console.log("FRED API error response:", text.replaceAll(FRED_API_KEY, '***'));
    throw new Error(`FRED API error: ${response.statusText}`);
  }
  const data = await response.json();

  const formatted = data.observations
    .filter(obs => obs.value !== '.')
    .map(obs => ({
      date: obs.date,
      value: parseFloat(obs.value)
    }));

  fredCache.set(cacheKey, formatted);
  return formatted;
};

export async function getFedFundsRate(period = '5y') {
  console.log(`getFedFundsRate called (period: ${period})`);
  const months = periodToMonths(period);
  const startDate = getStartDate(months);
  const history = await fetchFRED('FEDFUNDS', startDate, 'm');
  const currentValue = history[history.length - 1]?.value || null;
  return { currentValue, history };
}

export async function getMarginDebt() {
  // MARGINDEBT series is discontinued, using BOGZ1FLNQ (NYSE Margin Debt) as proxy
  const startDate = getStartDate(12);
  const history = await fetchFRED('BOGZ1FLNQ', startDate, 'm');
  const currentValue = history[history.length - 1]?.value || null;
  return { currentValue, history };
}

export async function getCreditSpreads(period = '5y') {
  const months = periodToMonths(period);
  const startDate = getStartDate(months);
  // Use monthly frequency for periods longer than 1 year to avoid API limits
  const frequency = months > 12 ? 'm' : 'd';
  const history = await fetchFRED('BAMLH0A0HYM2', startDate, frequency);
  
  // Convert percentage to basis points (bps) by multiplying by 100
  const historyBps = history.map(item => ({ ...item, value: item.value * 100 }));
  
  const currentValue = historyBps[historyBps.length - 1]?.value || null;
  return { currentValue, history: historyBps };
}

export async function getInflation(period = '5y') {
  const months = periodToMonths(period) + 12; // Need extra 12 months for YoY calculation
  const startDate = getStartDate(months);
  const history = await fetchFRED('CPIAUCSL', startDate, 'm');

  const yoyHistory = history.slice(12).map((item, index) => {
    const prev = history[index];
    const yoy = ((item.value - prev.value) / prev.value) * 100;
    return { date: item.date, value: parseFloat(yoy.toFixed(2)) };
  });

  const currentValue = yoyHistory[yoyHistory.length - 1]?.value || null;
  return { currentValue, history: yoyHistory };
}