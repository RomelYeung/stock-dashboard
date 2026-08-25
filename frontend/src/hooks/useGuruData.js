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
    staleTime: 1000 * 60 * 5,
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
    staleTime: 1000 * 60 * 5,
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
    staleTime: 1000 * 60 * 5,
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
    staleTime: 1000 * 60 * 5,
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
      const statusUrl = `/api/gurus/sync-status?cik=${encodeURIComponent(CIK)}`;

      // 1. Baseline for THIS CIK — must succeed or we abort before starting
      const baseRes = await fetch(statusUrl);
      if (!baseRes.ok) throw new Error("Unable to determine sync status");
      const baseline = (await baseRes.json())?.data?.lastCompletedAt ?? null;

      // 2. Kick off sync (202 expected)
      const res = await fetch("/api/gurus/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ CIK }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to sync investor");
      }

      // 3. Poll THIS CIK's completion marker every 2s up to 90s.
      //    Success is returned ONLY when this CIK's marker advances.
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const r2 = await fetch(statusUrl);
          if (!r2.ok) continue; // transient — keep polling
          const at = (await r2.json())?.data?.lastCompletedAt ?? null;
          if (at !== null && at !== baseline) {
            return res.json();
          }
        } catch {
          /* transient network error — keep polling */
        }
      }
      throw new Error("Sync timed out after 90 seconds. Check server logs or try again.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gurus"] });
      queryClient.invalidateQueries({ queryKey: ["guruActivity"] });
      queryClient.invalidateQueries({ queryKey: ["guruActivityAiSummary"] });
      queryClient.invalidateQueries({ queryKey: ["guruAiStrategy"] });
      queryClient.invalidateQueries({ queryKey: ["guruHoldings"] });
      queryClient.invalidateQueries({ queryKey: ["guruHistory"] });
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
