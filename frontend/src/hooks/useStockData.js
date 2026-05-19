import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarketStatus } from "../utils/marketStatus";

export const getPollingInterval = (isOpen) => (isOpen ? 5000 : 300000);

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
    placeholderData: (previousData) => previousData,
  });

  return {
    data: data?.data || {},
    loading: isLoading,
    errors: data?.errors || {},
    refetch,
  };
}

/**
 * Poll for live price updates every 5s during market hours.
 * Automatically stops polling when market closes or component unmounts.
 * On network failure, retries with exponential backoff (5s → 10s → 20s → max 300s).
 * On 429 rate limit, backs off to 120s immediately.
 *
 * @param {string[]} tickers - Array of ticker symbols
 * @returns {{ liveData: Record<string, {currentPrice, change, changePercent}>, isActive: boolean }}
 */
export function useLivePrices(tickers) {
  const [liveData, setLiveData] = useState({});
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef(null);
  const backoffRef = useRef(5000);
  const errorCountRef = useRef(0);
  const mountedRef = useRef(true);
  const tickersRef = useRef(tickers);

  // Keep a ref to the latest tickers so the interval callback doesn't stale
  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);

  const fetchLivePrices = useCallback(async () => {
    const currentTickers = tickersRef.current;
    if (!currentTickers.length) return;

    const marketStatus = getMarketStatus();
    if (!marketStatus.isOpen) {
      setIsActive(false);
      return;
    }

    setIsActive(true);

    try {
      const res = await fetch("/api/stocks/portfolio/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: currentTickers }),
      });

      // Handle 429 rate limit specifically
      if (res.status === 429) {
        const json = await res.json().catch(() => ({ error: "Rate limited" }));
        throw new Error(json.error || "Rate limited");
      }

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "API error");
      }

      backoffRef.current = 5000;
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

      // On 429, jump to 120s backoff immediately
      if (err.message.includes("Rate limited") || err.message.includes("429")) {
        backoffRef.current = 120000;
      } else {
        const nextBackoff = Math.min(backoffRef.current * 2, 300000);
        backoffRef.current = nextBackoff;
      }

      // Stop polling after 5 consecutive failures
      if (errorCountRef.current >= 5) {
        console.warn("[live-prices] 5 consecutive failures, stopping polling");
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsActive(false);
        return;
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(fetchLivePrices, backoffRef.current);
      }
    }
  }, []); // stable — reads tickers from ref

  useEffect(() => {
    mountedRef.current = true;

    const marketStatus = getMarketStatus();
    if (tickers.length > 0) {
      setIsActive(marketStatus.isOpen);
      if (marketStatus.isOpen) {
        fetchLivePrices();
      }
      intervalRef.current = setInterval(
        fetchLivePrices,
        getPollingInterval(marketStatus.isOpen),
      );
    }

    const marketCheckInterval = setInterval(() => {
      const status = getMarketStatus();
      if (status.isOpen && tickersRef.current.length > 0) {
        setIsActive(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
        fetchLivePrices();
        intervalRef.current = setInterval(fetchLivePrices, getPollingInterval(true));
      } else if (!status.isOpen) {
        setIsActive(false);
      }
    }, 60000);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      clearInterval(marketCheckInterval);
    };
  }, [fetchLivePrices, tickers.length]); // depend on length, not array reference

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

// Fetch options scanner data for a single ticker
export function useOptionsScanner(ticker) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["optionsScanner", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/options/scan/${ticker}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "API error");
      return json.data;
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return { data, loading: isLoading, error: error?.message, refetch };
}

/**
 * Fetch and mutate the user's portfolio and wishlist items from the backend.
 * Enabled only when a userId is provided (user is logged in).
 *
 * @param {string | undefined} userId - The authenticated user's ID (undefined = not logged in)
 * @returns {{ portfolio, wishlist, tickers, wishlistTickers, loading, addToWatchlist, removeFromWatchlist, addToWishlist, removeFromWishlist, refetch }}
 */
export function usePortfolioItems(userId) {
  const query = useQuery({
    queryKey: ["portfolioItems", userId],
    queryFn: async () => {
      const res = await fetch("/api/portfolio", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) return { portfolio: [], wishlist: [] };
        throw new Error("Failed to fetch portfolio");
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "API error");
      return json;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: () => ({ portfolio: [], wishlist: [] }),
  });

  const portfolio = query.data?.portfolio || [];
  const wishlist = query.data?.wishlist || [];
  const tickers = portfolio.map((p) => p.ticker);
  const wishlistTickers = wishlist.map((w) => w.ticker);

  const addToWatchlist = async (ticker) => {
    const res = await fetch("/api/portfolio/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ticker, shares: 0, averagePrice: 0 }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to add to watchlist");
    await query.refetch();
  };

  const removeFromWatchlist = async (ticker) => {
    const res = await fetch(`/api/portfolio/items/${ticker}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to remove from watchlist");
    await query.refetch();
  };

  const addToWishlist = async (ticker) => {
    const res = await fetch("/api/portfolio/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ticker }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to add to wishlist");
    await query.refetch();
  };

  const removeFromWishlist = async (ticker) => {
    const res = await fetch(`/api/portfolio/wishlist/${ticker}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to remove from wishlist");
    await query.refetch();
  };

  return {
    portfolio,
    wishlist,
    tickers,
    wishlistTickers,
    loading: query.isLoading,
    error: query.error,
    addToWatchlist,
    removeFromWatchlist,
    addToWishlist,
    removeFromWishlist,
    refetch: query.refetch,
  };
}
