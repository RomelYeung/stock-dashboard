import { useQuery } from "@tanstack/react-query";

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
