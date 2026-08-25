import React, { useState, useEffect } from "react";
import {
  useGurus,
  useGuruActivity,
  useGuruReverseLookup,
  useSyncGuru,
  useGuruActivityAiSummary,
} from "../hooks/useGuruData";
import { useAuth } from "../context/AuthContext";
import GuruDetail from "./GuruDetail";
import { formatPercent, formatPriceChange } from "../utils/formatters";

export default function GurusTab({
  user,
  tickers,
  wishlistTickers,
  addToWishlist,
  removeFromWishlist,
  selectedGuruId,
  setSelectedGuruId,
  setSelectedTicker,
  portfolio,
}) {
  const { data: gurus, isLoading: gurusLoading, error: gurusError } = useGurus();
  const { data: activity, isLoading: activityLoading } = useGuruActivity();
  const { data: aiSummary, isLoading: aiSummaryLoading, error: aiSummaryError } = useGuruActivityAiSummary({
    enabled: !!user && user.role !== "GUEST",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [feedFilter, setFeedFilter] = useState("All");

  // Sync state for manual investor synchronization
  const syncMutation = useSyncGuru();
  const [syncCik, setSyncCik] = useState("");
  const [syncError, setSyncError] = useState("");
  const [syncSuccess, setSyncSuccess] = useState("");

  // Reverse lookup query for holdings search
  const isSearchTicker = searchQuery.length >= 1 && searchQuery.length <= 5 && /^[A-Za-z]+$/.test(searchQuery);
  const { data: reverseLookupData } = useGuruReverseLookup(
    isSearchTicker ? searchQuery.toUpperCase() : null
  );

  const handleSyncSubmit = (e) => {
    e.preventDefault();
    setSyncError("");
    setSyncSuccess("");

    if (user?.role === "GUEST") {
      setSyncError("Upgrade to premium to sync new investors.");
      return;
    }

    if (!/^\d{10}$/.test(syncCik)) {
      setSyncError("CIK must be exactly 10 digits.");
      return;
    }

    syncMutation.mutate(syncCik, {
      onSuccess: () => {
        setSyncSuccess("Sync completed — portfolios refreshed.");
        setSyncCik("");
      },
      onError: (err) => {
        setSyncError(err.message || "Failed to trigger sync.");
      },
    });
  };

  if (selectedGuruId && gurus) {
    const selectedGuru = gurus.find((g) => g.id === selectedGuruId);
    if (selectedGuru) {
      return (
        <GuruDetail
          guru={selectedGuru}
          gurus={gurus}
          userRole={user?.role}
          onBack={() => setSelectedGuruId(null)}
          onSelectTicker={setSelectedTicker}
          wishlistTickers={wishlistTickers}
          onAddToWishlist={addToWishlist}
          onRemoveFromWishlist={removeFromWishlist}
          portfolio={portfolio}
          onSelectGuru={setSelectedGuruId}
        />
      );
    }
  }

  // Filter the investor grid based on search query
  const reverseLookupGuruIds = new Set((reverseLookupData || []).map((r) => r.guruId));
  const filteredGurus = (gurus || []).filter((g) => {
    const query = searchQuery.toLowerCase();
    const nameMatch = g.name.toLowerCase().includes(query);
    const fundMatch = g.fundName?.toLowerCase().includes(query);
    const tickerMatch = reverseLookupGuruIds.has(g.id);
    return nameMatch || fundMatch || tickerMatch;
  });

  // Filter the activity feed based on selected chip
  const filteredActivity = (activity || []).filter((act) => {
    if (feedFilter === "All") return true;
    if (feedFilter === "New") return act.change === "New";
    if (feedFilter === "Increased") return act.change === "Increased";
    if (feedFilter === "Decreased") return act.change === "Decreased";
    if (feedFilter === "Exits") return act.change === "Closed" || act.change === "Exit";
    return true;
  });

  const activeChips = ["All", "New", "Exits", "Increased", "Decreased"];

  return (
    <div style={styles.container}>
      {/* Title Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Guru Tracker</h1>
          <p style={styles.subtitle}>
            Track and replicate portfolios of top institutional value investors.
          </p>
        </div>

        {/* Sync Investor Form */}
        <form onSubmit={handleSyncSubmit} style={styles.syncForm}>
          <input
            type="text"
            placeholder="Enter 10-digit CIK"
            value={syncCik}
            onChange={(e) => setSyncCik(e.target.value)}
            style={styles.syncInput}
            maxLength={10}
          />
          <button type="submit" style={styles.syncBtn} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? "Syncing..." : "Sync CIK"}
          </button>
          {syncError && <div style={styles.syncError}>{syncError}</div>}
          {syncSuccess && <div style={styles.syncSuccess}>{syncSuccess}</div>}
        </form>
      </div>

      {/* Search Input */}
      <div style={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search investors by name, fund name, or stock holdings ticker (e.g. AAPL)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Main Grid & Feed Layout */}
      <div style={styles.layout}>
        {/* Curated Investor Grid */}
        <div style={styles.gridSection}>
          <h2 style={styles.sectionTitle}>Curated Investors ({filteredGurus.length})</h2>
          {gurusLoading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner} />
              <span>Loading investors...</span>
            </div>
          ) : gurusError ? (
            <div style={styles.errorText}>Failed to load investors.</div>
          ) : filteredGurus.length === 0 ? (
            <div style={styles.placeholder}>No investors found matching your search.</div>
          ) : (
            <div style={styles.grid}>
              {filteredGurus.map((g) => {
                let tagsArray = [];
                try {
                  tagsArray = typeof g.tags === "string" ? JSON.parse(g.tags) : g.tags || [];
                } catch (e) {
                  tagsArray = [];
                }

                return (
                  <div
                    key={g.id}
                    onClick={() => setSelectedGuruId(g.id)}
                    style={styles.guruCard}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                    }}
                  >
                    <div style={styles.cardHeader}>
                      <h3 style={styles.cardName}>{g.name}</h3>
                      {g.fundName && <div style={styles.cardFund}>{g.fundName}</div>}
                    </div>
                    <div style={styles.cardDetail}>
                      <div style={styles.cardDetailLabel}>Philosophy</div>
                      <div style={styles.cardDetailValue}>{g.philosophy || "Value"}</div>
                    </div>
                    {tagsArray.length > 0 && (
                      <div style={styles.cardTags}>
                        {tagsArray.map((t) => (
                          <span key={t} style={styles.cardTag}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed Section */}
        <div style={styles.feedSection}>
          <h2 style={styles.sectionTitle}>Combined Activity Feed</h2>

          {/* AI Summary Card */}
          <div style={styles.aiSummaryCard}>
            <div style={styles.aiSummaryHeader}>
              <span style={styles.aiSummaryIcon}>✨</span>
              <span style={styles.aiSummaryTitle}>AI ACTIVITY FEED SUMMARY</span>
            </div>
            {user?.role === "GUEST" ? (
              <div style={styles.aiSummaryUpgrade}>
                <p style={styles.aiSummaryText}>
                  Unlock the real-time AI summary of combined institutional activity trends.
                </p>
                <a href="/login" style={styles.aiSummaryUpgradeBtn}>
                  Upgrade to Premium
                </a>
              </div>
            ) : aiSummaryLoading ? (
              <div style={styles.aiSummaryLoading}>
                <div style={styles.spinnerSmall} />
                <span>Generating AI activity summary...</span>
              </div>
            ) : aiSummaryError ? (
              <div style={styles.aiSummaryError}>
                AI summary is temporarily unavailable.
              </div>
            ) : (
              <p style={styles.aiSummaryText}>
                {aiSummary || "No summary available."}
              </p>
            )}
          </div>

          {/* Chips Filter */}
          <div style={styles.chipsContainer}>
            {activeChips.map((chip) => (
              <button
                key={chip}
                onClick={() => setFeedFilter(chip)}
                style={{
                  ...styles.chip,
                  ...(feedFilter === chip ? styles.chipActive : {}),
                }}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Activity List */}
          {activityLoading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner} />
              <span>Loading activities...</span>
            </div>
          ) : filteredActivity.length === 0 ? (
            <div style={styles.placeholder}>No recent transactions found.</div>
          ) : (
            <div style={styles.feedList}>
              {filteredActivity.map((act, index) => {
                const isNewOrInc = act.change === "New" || act.change === "Increased";
                const changeColor = isNewOrInc ? "var(--accent-green)" : "var(--accent-red)";
                const changeBg = isNewOrInc ? "var(--accent-green-dim)" : "var(--accent-red-dim)";

                return (
                  <div key={index} style={styles.feedCard}>
                    <div style={styles.feedCardHeader}>
                      <div>
                        <span style={styles.feedGuru}>{act.name}</span>
                        {act.fundName && <span style={styles.feedFund}> ({act.fundName})</span>}
                      </div>
                      <span style={styles.feedDate}>{act.date}</span>
                    </div>

                    <div style={styles.feedBody}>
                      <div style={styles.feedChangeBlock}>
                        <span
                          style={{
                            ...styles.feedBadge,
                            color: changeColor,
                            backgroundColor: changeBg,
                          }}
                        >
                          {act.change}
                        </span>
                        <button
                          style={styles.feedTicker}
                          onClick={() => setSelectedTicker?.(act.ticker)}
                        >
                          {act.ticker}
                        </button>
                      </div>

                      <div style={styles.feedMeta}>
                        {act.weight !== undefined && (
                          <span style={styles.feedWeight}>
                            Weight: {formatPercent(act.weight)}
                          </span>
                        )}
                        {act.sharesDiff !== undefined && act.sharesDiff !== 0 && (
                          <span style={styles.feedShares}>
                            Shares: {act.sharesDiff > 0 ? "+" : ""}
                            {act.sharesDiff.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "20px 0",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "20px",
    marginBottom: "24px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
    fontFamily: "var(--font-display)",
  },
  subtitle: {
    fontSize: "13px",
    color: "var(--text-secondary)",
    marginTop: "4px",
    margin: 0,
  },
  syncForm: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    position: "relative",
    flexWrap: "wrap",
  },
  syncInput: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "var(--text-primary)",
    padding: "8px 12px",
    fontSize: "12px",
    outline: "none",
    width: "140px",
  },
  syncBtn: {
    background: "var(--accent-blue)",
    border: "none",
    borderRadius: "8px",
    color: "white",
    padding: "8px 14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  syncError: {
    position: "absolute",
    top: "38px",
    right: 0,
    color: "var(--accent-red)",
    fontSize: "10px",
    whiteSpace: "nowrap",
  },
  syncSuccess: {
    position: "absolute",
    top: "38px",
    right: 0,
    color: "var(--accent-green)",
    fontSize: "10px",
    whiteSpace: "nowrap",
  },
  searchContainer: {
    marginBottom: "24px",
  },
  searchInput: {
    width: "100%",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    color: "var(--text-primary)",
    padding: "12px 16px",
    fontSize: "13px",
    outline: "none",
    transition: "border-color 0.2s",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "2fr 1.2fr",
    gap: "24px",
  },
  gridSection: {
    minWidth: 0,
  },
  feedSection: {
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    marginBottom: "16px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "16px",
  },
  guruCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "14px",
    padding: "18px",
    cursor: "pointer",
    transition: "transform 0.2s, border-color 0.2s",
  },
  cardHeader: {
    marginBottom: "12px",
  },
  cardName: {
    fontSize: "15px",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
  },
  cardFund: {
    fontSize: "12px",
    color: "var(--text-secondary)",
    marginTop: "2px",
  },
  cardDetail: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "11px",
    borderTop: "1px solid rgba(255,255,255,0.04)",
    paddingTop: "10px",
    marginBottom: "10px",
  },
  cardDetailLabel: {
    color: "var(--text-muted)",
  },
  cardDetailValue: {
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  cardTags: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  cardTag: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: "4px",
    padding: "2px 6px",
    fontSize: "10px",
    color: "var(--text-muted)",
  },
  chipsContainer: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },
  chip: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "20px",
    color: "var(--text-secondary)",
    padding: "6px 12px",
    fontSize: "11px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  chipActive: {
    background: "var(--accent-blue)",
    borderColor: "var(--accent-blue)",
    color: "white",
  },
  feedList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxHeight: "650px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  feedCard: {
    background: "rgba(255,255,255,0.015)",
    border: "1px solid rgba(255,255,255,0.04)",
    borderRadius: "10px",
    padding: "14px",
  },
  feedCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "11px",
    marginBottom: "10px",
  },
  feedGuru: {
    color: "var(--text-primary)",
    fontWeight: 600,
  },
  feedFund: {
    color: "var(--text-secondary)",
  },
  feedDate: {
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  },
  feedBody: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
  },
  feedChangeBlock: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  feedBadge: {
    fontSize: "10px",
    fontWeight: "bold",
    padding: "2px 6px",
    borderRadius: "4px",
    textTransform: "uppercase",
  },
  feedTicker: {
    background: "none",
    border: "none",
    color: "var(--accent-blue)",
    fontWeight: "bold",
    cursor: "pointer",
    padding: 0,
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
  },
  feedMeta: {
    display: "flex",
    gap: "12px",
    fontSize: "11px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px",
    gap: "12px",
    color: "var(--text-secondary)",
    fontSize: "12px",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid rgba(255,255,255,0.1)",
    borderTopColor: "var(--accent-blue)",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  errorText: {
    padding: "20px",
    color: "var(--accent-red)",
    fontSize: "12px",
    textAlign: "center",
  },
  placeholder: {
    padding: "20px",
    color: "var(--text-muted)",
    fontSize: "12px",
    textAlign: "center",
  },
  aiSummaryCard: {
    background: "linear-gradient(135deg, rgba(0, 229, 160, 0.05), rgba(79, 141, 255, 0.05))",
    border: "1px solid rgba(0, 229, 160, 0.15)",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "16px",
  },
  aiSummaryHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "10px",
  },
  aiSummaryIcon: {
    fontSize: "14px",
  },
  aiSummaryTitle: {
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--accent-green)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontFamily: "var(--font-display)",
  },
  aiSummaryText: {
    fontSize: "12px",
    color: "var(--text-secondary)",
    lineHeight: "1.5",
    margin: 0,
  },
  aiSummaryUpgrade: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    alignItems: "flex-start",
  },
  aiSummaryUpgradeBtn: {
    display: "inline-block",
    padding: "4px 10px",
    background: "var(--accent-blue)",
    color: "white",
    borderRadius: "6px",
    textDecoration: "none",
    fontSize: "11px",
    fontWeight: 600,
  },
  aiSummaryLoading: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "11px",
    color: "var(--text-secondary)",
  },
  spinnerSmall: {
    width: "12px",
    height: "12px",
    border: "1.5px solid rgba(255,255,255,0.1)",
    borderTopColor: "var(--accent-blue)",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  aiSummaryError: {
    fontSize: "11px",
    color: "var(--accent-red)",
  },
};
