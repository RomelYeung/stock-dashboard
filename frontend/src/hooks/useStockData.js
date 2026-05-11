import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarketStatus } from "../utils/marketStatus";

const BASE = "/api/stocks";

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.error) message = json.error;
    } catch {
      // response wasn't JSON
    }
    throw new Error(message);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "API error");
  return json.data;
}

// Fetch summary data for a list of tickers (portfolio overview)
export function usePortfolio(tickers) {
  const queryKey = ["portfolio", tickers.join(",")];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!tickers.length) return { data: {}, errors: {} };

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

      return { data: newData, errors: newErrors };
    },
    staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days for fundamentals
  });

  return {
    data: data?.data || {},
    loading: isLoading,
    errors: data?.errors || {},
    refetch,
  };
}

/**
 * Poll for live price updates every 30s during market hours.
 * Automatically stops polling when market closes or component unmounts.
 * On network failure, retries with exponential backoff (30s → 60s → 120s → max 300s).
 *
 * @param {string[]} tickers - Array of ticker symbols
 * @returns {{ liveData: Record<string, {currentPrice, change, changePercent}>, isActive: boolean }}
 */
export function useLivePrices(tickers) {
  const [liveData, setLiveData] = useState({});
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef(null);
  const backoffRef = useRef(30000);
  const errorCountRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchLivePrices = useCallback(async () => {
    if (!tickers.length) return;

    const marketStatus = getMarketStatus();
    if (!marketStatus.isOpen) {
      setIsActive(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setIsActive(true);

    try {
      const res = await fetch("/api/stocks/portfolio/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "API error");
      }

      backoffRef.current = 30000;
      errorCountRef.current = 0;

      const newData = {};
      for (const item of json.data || []) {
        if (item.data) {
          newData[item.ticker] = item.data;
        }
      }

      if (mountedRef.current) {
        setLiveData((prev) => ({ ...prev, ...newData }));
      }
    } catch (err) {
      console.error("[live-prices] fetch failed:", err.message);
      errorCountRef.current++;

      const nextBackoff = Math.min(backoffRef.current * 2, 300000);
      backoffRef.current = nextBackoff;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(fetchLivePrices, nextBackoff);
      }
    }
  }, [tickers]);

  useEffect(() => {
    mountedRef.current = true;

    const marketStatus = getMarketStatus();
    if (marketStatus.isOpen && tickers.length > 0) {
      setIsActive(true);
      fetchLivePrices();
      intervalRef.current = setInterval(fetchLivePrices, 30000);
    }

    const marketCheckInterval = setInterval(() => {
      const status = getMarketStatus();
      if (status.isOpen && !intervalRef.current && tickers.length > 0) {
        setIsActive(true);
        fetchLivePrices();
        intervalRef.current = setInterval(fetchLivePrices, 30000);
      } else if (!status.isOpen && intervalRef.current) {
        setIsActive(false);
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 60000);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearInterval(marketCheckInterval);
    };
  }, [fetchLivePrices, tickers]);

  return { liveData, isActive };
}

// Fetch full fundamentals for a single ticker (detail view)
export function useStockDetail(ticker) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stockDetail", ticker],
    queryFn: () => apiFetch(`/${ticker}/all`),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days for fundamentals
  });

  return { data, loading: isLoading, error: error?.message };
}

// Fetch price history for a single ticker
export function usePriceHistory(ticker, period = "1y") {
  const { data, isLoading } = useQuery({
    queryKey: ["priceHistory", ticker, period],
    queryFn: () => apiFetch(`/${ticker}/price-history?period=${period}`),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours for price data
  });

  return { data: data || [], loading: isLoading };
}

// Fetch all market indicators
export function useMarketIndicators() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["marketIndicators", "5y"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/market/indicators?period=5y`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "API error");
      return json.data;
    },
    staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days for indicators
  });

  return { data, loading: isLoading, error: error?.message };
}

// Fetch earnings profile (lazy-loaded)
export function useEarningsProfile() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["earningsProfile"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/market/earnings-profile`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "API error");
      return json.data;
    },
    staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days
  });

  return { data, loading: isLoading, error: error?.message };
}

// Fetch sector rotation data
export function useSectorRotation() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sectorRotation"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/sector-rotation`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "API error");
      return json.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return { data, loading: isLoading, error: error?.message };
}

export function useDCF(ticker, simulations = 1000) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dcf", ticker, simulations],
    queryFn: () => apiFetch(`/${ticker}/dcf?simulations=${simulations}`),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days
  });

  return { data, loading: isLoading, error: error?.message, refetch };
}

// Fetch insider trading data for a single ticker
export function useInsiderTrading(ticker) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insiderTrading", ticker],
    queryFn: () => apiFetch(`/${ticker}/insider-trading`),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  return { data, loading: isLoading, error: error?.message };
}

// Fetch comparables data for a single ticker
export function useComparables(ticker) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["comparables", ticker],
    queryFn: () => apiFetch(`/${ticker}/comparables`),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  return { data, loading: isLoading, error: error?.message };
}
