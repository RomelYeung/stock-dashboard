import { useState, useEffect } from "react";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  sectionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 700,
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
  },
  subtitle: {
    color: "var(--text-secondary)",
    fontSize: "13px",
    lineHeight: "1.5",
  },
  panel: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius-md)",
    padding: "20px 24px",
  },
  panelTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: "16px",
    letterSpacing: "0.02em",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "16px",
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statLabel: {
    fontSize: "10px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  statValue: {
    fontSize: "22px",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  statValueDim: {
    fontSize: "22px",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    color: "var(--text-secondary)",
  },
  divider: {
    height: "1px",
    background: "rgba(255,255,255,0.06)",
    margin: "20px 0",
  },
  actions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  btn: {
    alignItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "8px",
    color: "var(--text-primary)",
    cursor: "pointer",
    display: "flex",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    fontWeight: 500,
    gap: "6px",
    padding: "8px 16px",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  btnDanger: {
    background: "var(--accent-red-dim)",
    border: "1px solid rgba(255,77,109,0.25)",
    color: "var(--accent-red)",
  },
  btnPrimary: {
    background: "var(--accent-blue-dim)",
    border: "1px solid rgba(79,141,255,0.25)",
    color: "var(--accent-blue)",
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
    pointerEvents: "none",
  },
  feedback: {
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    padding: "6px 0 0",
  },
  feedbackSuccess: {
    color: "var(--accent-green)",
  },
  feedbackError: {
    color: "var(--accent-red)",
  },
  loadingCard: {
    background: "var(--glass-bg)",
    borderRadius: "12px",
    padding: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-secondary)",
    fontSize: "13px",
    minHeight: "120px",
  },
  errorCard: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(12px)",
    border: "1px solid var(--accent-red-dim)",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  errorText: {
    color: "var(--accent-red)",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.5",
  },
  retryBtn: {
    alignSelf: "flex-start",
    background: "rgba(255,77,109,0.1)",
    border: "1px solid rgba(255,77,109,0.2)",
    borderRadius: "6px",
    color: "var(--accent-red)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    padding: "4px 10px",
  },
};

function formatBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

export default function AdminDashboard() {
  const [cacheStats, setCacheStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flushState, setFlushState] = useState({ loading: false, message: null, type: null });
  const [marginDebtState, setMarginDebtState] = useState({ loading: false, message: null, type: null });

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stocks/cache/stats", { credentials: "include" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load cache stats");
      setCacheStats(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleFlushCache = async () => {
    setFlushState({ loading: true, message: null, type: null });
    try {
      const res = await fetch("/api/stocks/cache", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to flush cache");
      setFlushState({ loading: false, message: "Cache flushed successfully", type: "success" });
      // Refresh stats after flush
      setTimeout(() => fetchStats(), 500);
    } catch (err) {
      setFlushState({ loading: false, message: err.message, type: "error" });
    }
  };

  const handleUpdateMarginDebt = async () => {
    setMarginDebtState({ loading: true, message: null, type: null });
    try {
      const res = await fetch("/api/stocks/market/update-margin-debt", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update margin debt");
      setMarginDebtState({ loading: false, message: "Margin debt update initiated", type: "success" });
    } catch (err) {
      setMarginDebtState({ loading: false, message: err.message, type: "error" });
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.sectionHeader}>
        <h1 style={styles.title}>Admin Dashboard</h1>
        <p style={styles.subtitle}>
          System administration and maintenance tools.
        </p>
      </div>

      {/* Cache Stats */}
      <div style={styles.panel}>
        <div style={styles.panelTitle}>Cache Statistics</div>

        {loading && (
          <div style={styles.loadingCard}>Loading cache stats…</div>
        )}

        {error && !loading && (
          <div style={styles.errorCard}>
            <span style={styles.errorText}>{error}</span>
            <button style={styles.retryBtn} onClick={fetchStats}>
              Retry
            </button>
          </div>
        )}

        {cacheStats && !loading && (
          <div style={styles.statsGrid}>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Keys</span>
              <span style={styles.statValue}>{formatNumber(cacheStats.keys)}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Hits</span>
              <span style={styles.statValue}>{formatNumber(cacheStats.hits)}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Misses</span>
              <span style={styles.statValue}>{formatNumber(cacheStats.misses)}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Key Size</span>
              <span style={styles.statValue}>{formatBytes(cacheStats.ksize)}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Value Size</span>
              <span style={styles.statValue}>{formatBytes(cacheStats.vsize)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={styles.panel}>
        <div style={styles.panelTitle}>Actions</div>

        <div style={styles.actions}>
          {/* Flush Cache */}
          <div>
            <button
              style={{
                ...styles.btn,
                ...styles.btnDanger,
                ...(flushState.loading ? styles.btnDisabled : {}),
              }}
              onClick={handleFlushCache}
              disabled={flushState.loading}
            >
              {flushState.loading ? "Flushing…" : "Flush Cache"}
            </button>
            {flushState.message && (
              <div
                style={{
                  ...styles.feedback,
                  ...(flushState.type === "success" ? styles.feedbackSuccess : styles.feedbackError),
                }}
              >
                {flushState.message}
              </div>
            )}
          </div>

          {/* Update Margin Debt */}
          <div>
            <button
              style={{
                ...styles.btn,
                ...styles.btnPrimary,
                ...(marginDebtState.loading ? styles.btnDisabled : {}),
              }}
              onClick={handleUpdateMarginDebt}
              disabled={marginDebtState.loading}
            >
              {marginDebtState.loading ? "Updating…" : "Update Margin Debt"}
            </button>
            {marginDebtState.message && (
              <div
                style={{
                  ...styles.feedback,
                  ...(marginDebtState.type === "success" ? styles.feedbackSuccess : styles.feedbackError),
                }}
              >
                {marginDebtState.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
