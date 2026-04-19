import { useState, useEffect, useCallback } from "react";

const BASE = "/api/stocks";

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "API error");
  return json.data;
}

// Fetch summary data for a list of tickers (portfolio overview)
export function usePortfolio(tickers) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchAll = useCallback(async () => {
    if (!tickers.length) return;
    setLoading(true);

    const res = await fetch(`${BASE}/portfolio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers }),
    });
    const json = await res.json();

    const newData = {};
    const newErrors = {};
    for (const item of json.data || []) {
      if (item.error) newErrors[item.ticker] = item.error;
      else newData[item.ticker] = item.data;
    }

    setData(newData);
    setErrors(newErrors);
    setLoading(false);
  }, [tickers.join(",")]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { data, loading, errors, refetch: fetchAll };
}

// Fetch full fundamentals for a single ticker (detail view)
export function useStockDetail(ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setData(null);
    setError(null);

    apiFetch(`/${ticker}/all`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  return { data, loading, error };
}

// Fetch price history for a single ticker
export function usePriceHistory(ticker, period = "1y") {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);

    apiFetch(`/${ticker}/price-history?period=${period}`)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ticker, period]);

  return { data, loading };
}
