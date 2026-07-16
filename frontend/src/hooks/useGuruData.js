import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useGurus() {
  return useQuery({
    queryKey: ["gurus"],
    queryFn: async () => {
      const res = await fetch("/api/gurus");
      if (!res.ok) {
        throw new Error("Failed to fetch gurus");
      }
      const json = await res.json();
      return json.data;
    },
  });
}

export function useGuruHoldings(id, quarter) {
  return useQuery({
    queryKey: ["guruHoldings", id, quarter],
    queryFn: async () => {
      if (!id) return [];
      const url = quarter
        ? `/api/gurus/${id}/holdings?quarter=${encodeURIComponent(quarter)}`
        : `/api/gurus/${id}/holdings`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to fetch holdings");
      }
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!id,
  });
}

export function useGuruActivity() {
  return useQuery({
    queryKey: ["guruActivity"],
    queryFn: async () => {
      const res = await fetch("/api/gurus/activity");
      if (!res.ok) {
        throw new Error("Failed to fetch activity");
      }
      const json = await res.json();
      return json.data || [];
    },
  });
}

export function useGuruHistory(id) {
  return useQuery({
    queryKey: ["guruHistory", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/gurus/${id}/history`);
      if (!res.ok) {
        throw new Error("Failed to fetch history");
      }
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
  });
}

export function useGuruReverseLookup(ticker) {
  return useQuery({
    queryKey: ["guruReverseLookup", ticker],
    queryFn: async () => {
      if (!ticker) return [];
      const res = await fetch(`/api/gurus/ticker/${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        throw new Error("Failed to fetch reverse lookup");
      }
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!ticker,
  });
}

export function useSyncGuru() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (CIK) => {
      const res = await fetch("/api/gurus/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ CIK }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to sync investor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gurus"] });
      queryClient.invalidateQueries({ queryKey: ["guruActivity"] });
      queryClient.invalidateQueries({ queryKey: ["guruActivityAiSummary"] });
      queryClient.invalidateQueries({ queryKey: ["guruAiStrategy"] });
    },
  });
}

// Add a hook for AI strategy since the details page might show it
export function useGuruAiStrategy(id, options = {}) {
  return useQuery({
    queryKey: ["guruAiStrategy", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/gurus/${id}/ai-strategy`);
      if (!res.ok) {
        throw new Error("Failed to fetch AI strategy");
      }
      const json = await res.json();
      return json.data;
    },
    enabled: !!id && (options.enabled ?? true),
    ...options,
  });
}

export function useGuruActivityAiSummary(options = {}) {
  return useQuery({
    queryKey: ["guruActivityAiSummary"],
    queryFn: async () => {
      const res = await fetch("/api/gurus/activity/ai-summary");
      if (!res.ok) {
        throw new Error("Failed to fetch activity AI summary");
      }
      const json = await res.json();
      return json.data;
    },
    ...options,
  });
}
