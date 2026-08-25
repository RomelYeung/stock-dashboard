import React, { useState, useMemo, useCallback, memo } from "react";
import { useGuruHoldings, useGuruHistory, useGuruAiStrategy } from "../hooks/useGuruData";
import { usePortfolio } from "../hooks/useStockData";
import { formatPrice, formatMarketCap, formatPercent } from "../utils/formatters";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import GuruHeatmap from "./GuruHeatmap";
import GuruTimeline from "./GuruTimeline";

const COLORS = [
  "#00E5A0", // Green
  "#00A3FF", // Blue
  "#FF577F", // Pink
  "#FFC000", // Yellow
  "#9B5DE5", // Purple
  "#F15BB5", // Pink/Magenta
  "#00F5D4", // Teal
  "#3F37C9", // Indigo
  "#F72585", // Neon Pink
  "#4CC9F0", // Light Blue
];

const formatLargeNumber = (num) => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
};

const getInitials = (n) => {
  if (!n) return "";
  const parts = n.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return n[0].toUpperCase();
};

function GuruDetail({
  guru,
  gurus,
  userRole,
  onBack,
  onSelectTicker,
  wishlistTickers,
  onAddToWishlist,
  onRemoveFromWishlist,
  portfolio,
  onSelectGuru,
}) {
  const [sortConfig, setSortConfig] = useState({ key: "weight", direction: "desc" });
  const [toastMessage, setToastMessage] = useState("");
  const [activeTab, setActiveTab] = useState("holdings");

  const guruId = guru?.id;

  // 1. Fetch holdings for the latest filing
  const { data: holdings, isLoading: holdingsLoading, error: holdingsError } = useGuruHoldings(guruId);

  // 2. Fetch history (gated: only if not GUEST)
  const { data: historyData } = useGuruHistory(
    userRole !== "GUEST" ? guruId : null
  );

  // 3. Fetch AI strategy summary (gated: only if activeTab is aiStrategy and not GUEST)
  const { data: aiStrategy, isLoading: aiLoading, error: aiError } = useGuruAiStrategy(
    (userRole !== "GUEST" && activeTab === "aiStrategy") ? guruId : null,
    { enabled: activeTab === "aiStrategy" && userRole !== "GUEST" && !!guruId }
  );

  // 4. Batch query stock profile data for company name and sector
  const holdingsTickers = useMemo(
    () => (holdings || []).map((h) => h.ticker),
    [holdings]
  );
  const { data: stockDataMap } = usePortfolio(holdingsTickers);

  // Calculate HHI
  const hhi = useMemo(() => {
    if (!holdings || holdings.length === 0) return 0;
    const sumSq = holdings.reduce((acc, h) => {
      const w = h.portfolioWeight !== undefined ? h.portfolioWeight : (h.weight || 0);
      return acc + Math.pow(w, 2);
    }, 0);
    return parseFloat(sumSq.toFixed(4));
  }, [holdings]);

  const hhiBadge = useMemo(() => {
    if (hhi < 0.15) {
      return { text: "Low Concentration", color: "var(--accent-green)", bg: "var(--accent-green-dim)" };
    }
    if (hhi <= 0.25) {
      return { text: "Moderate Concentration", color: "var(--accent-amber)", bg: "var(--accent-amber-dim)" };
    }
    return { text: "High Concentration", color: "var(--accent-red)", bg: "var(--accent-red-dim)" };
  }, [hhi]);

  // Sector allocation grouping
  const pieData = useMemo(() => {
    const sectorAllocation = {};
    (holdings || []).forEach((h) => {
      const stockInfo = stockDataMap?.[h.ticker.toUpperCase()];
      const sector = stockInfo?.sector || "Other";
      const weight = h.portfolioWeight !== undefined ? h.portfolioWeight : (h.weight || 0);
      sectorAllocation[sector] = (sectorAllocation[sector] || 0) + weight;
    });

    return Object.entries(sectorAllocation)
      .map(([sectorName, val]) => ({
        name: sectorName,
        value: parseFloat((val * 100).toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, stockDataMap]);

  // QoQ change calculations — returns an object per ticker with { label, percent, numericSort }
  const qoqMap = useMemo(() => {
    const map = {};
    if (historyData?.history && historyData.history.length > 0) {
      const latestFiling = historyData.history[0];
      const prevFiling = historyData.history[1];
      const currHoldings = latestFiling.holdings || [];
      const prevHoldings = prevFiling ? (prevFiling.holdings || []) : [];

      const aggregate = (holdings) => {
        const m = new Map();
        for (const h of holdings) {
          const key = `${h.ticker.toUpperCase()}-${(h.optionType || "none").toLowerCase()}`;
          if (!m.has(key)) {
            m.set(key, h.shares);
          } else {
            m.set(key, m.get(key) + h.shares);
          }
        }
        return m;
      };

      const prevMap = aggregate(prevHoldings);
      const currMap = aggregate(currHoldings);

      for (const [key, currShares] of currMap.entries()) {
        if (!prevMap.has(key)) {
          map[key] = { label: "New", numericSort: Infinity };
        } else {
          const prevShares = prevMap.get(key);
          if (prevShares === 0) {
            map[key] = { label: "New", numericSort: Infinity };
          } else if (currShares === prevShares) {
            map[key] = { label: "0%", numericSort: 0 };
          } else {
            const pctChange = ((currShares - prevShares) / prevShares) * 100;
            const sign = pctChange > 0 ? "+" : "";
            map[key] = { label: `${sign}${pctChange.toFixed(1)}%`, numericSort: pctChange };
          }
        }
      }
      
      // Handle closed positions
      for (const [key, prevShares] of prevMap.entries()) {
        if (!currMap.has(key)) {
          map[key] = { label: "Closed", numericSort: -Infinity };
        }
      }
    }
    return map;
  }, [historyData]);

  // Parse tags JSON
  const parsedTags = useMemo(() => {
    const tags = guru?.tags;
    try {
      if (tags) {
        return typeof tags === "string" ? JSON.parse(tags) : tags;
      }
    } catch (e) {
      console.error("Failed to parse tags JSON", e);
    }
    return [];
  }, [guru?.tags]);

  const wishlistSet = useMemo(
    () => new Set((wishlistTickers || []).map((t) => t.toUpperCase())),
    [wishlistTickers]
  );

  const tickerIndicatorMap = useMemo(() => {
    const portfolioMap = new Map();
    (portfolio || []).forEach((p) => {
      portfolioMap.set(p.ticker.toUpperCase(), p.shares > 0 ? "Owned" : "Watched");
    });

    const map = new Map();
    (holdings || []).forEach((h) => {
      const tUpper = h.ticker.toUpperCase();
      if (portfolioMap.has(tUpper)) {
        map.set(tUpper, portfolioMap.get(tUpper));
      } else if (wishlistSet.has(tUpper)) {
        map.set(tUpper, "Wishlisted");
      } else {
        map.set(tUpper, null);
      }
    });
    return map;
  }, [holdings, portfolio, wishlistSet]);

  const handleWishlistToggle = useCallback(async (ticker) => {
    if (userRole === "GUEST") {
      setToastMessage("Sign-in required to add to Wishlist");
      setTimeout(() => setToastMessage(""), 4000);
      return;
    }
    const tickerUpper = ticker.toUpperCase();
    const isWishlisted = wishlistSet.has(tickerUpper);

    if (isWishlisted) {
      try {
        await onRemoveFromWishlist(ticker);
      } catch (err) {
        setToastMessage("Failed to remove from Wishlist");
        setTimeout(() => setToastMessage(""), 4000);
      }
    } else {
      if (wishlistTickers && wishlistTickers.length >= 20) {
        setToastMessage("Wishlist limit reached (max 20 stocks).");
        setTimeout(() => setToastMessage(""), 4000);
        return;
      }
      try {
        await onAddToWishlist(ticker);
      } catch (err) {
        setToastMessage(err.message || "Failed to add to Wishlist");
        setTimeout(() => setToastMessage(""), 4000);
      }
    }
  }, [userRole, wishlistSet, wishlistTickers, onRemoveFromWishlist, onAddToWishlist]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const sortedHoldings = useMemo(() => {
    if (!holdings) return [];
    const sortable = [...holdings];
    sortable.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === "weight") {
        aVal = a.portfolioWeight !== undefined ? a.portfolioWeight : (a.weight || 0);
        bVal = b.portfolioWeight !== undefined ? b.portfolioWeight : (b.weight || 0);
      } else if (sortConfig.key === "change") {
        aVal = qoqMap[`${a.ticker.toUpperCase()}-${(a.optionType || "none").toLowerCase()}`]?.numericSort ?? 0;
        bVal = qoqMap[`${b.ticker.toUpperCase()}-${(b.optionType || "none").toLowerCase()}`]?.numericSort ?? 0;
      } else if (sortConfig.key === "companyName") {
        aVal = a.companyName || stockDataMap?.[a.ticker.toUpperCase()]?.name || "";
        bVal = b.companyName || stockDataMap?.[b.ticker.toUpperCase()]?.name || "";
      } else if (sortConfig.key === "optionType") {
        aVal = (a.optionType || "").toUpperCase();
        bVal = (b.optionType || "").toUpperCase();
      }

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sortable;
  }, [holdings, sortConfig, qoqMap, stockDataMap]);

  if (!guru) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <span>Loading investor profile...</span>
      </div>
    );
  }

  const { name, fundName, bio, philosophy, currentAum, lastFilingDate } = guru;


  return (
    <div style={styles.container}>
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            style={styles.toast}
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            transition={{ duration: 0.2 }}
          >
            <span style={styles.toastIcon}>⚠️</span>
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back button */}
      <button style={styles.backBtn} onClick={onBack}>
        ← Back to Tracker
      </button>

      {/* Header Profile Card */}
      <div style={styles.profileCard}>
        <div style={styles.profileHeader}>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={styles.avatarBig}>
              {getInitials(name)}
            </div>
            <div>
              <h1 style={styles.name}>{name}</h1>
              {fundName && <div style={styles.fundName}>{fundName}</div>}
            </div>
          </div>
          {parsedTags.length > 0 && (
            <div style={styles.tagsContainer}>
              {parsedTags.map((tag) => (
                <span key={tag} style={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={styles.profileDetailsGrid}>
          <div>
            <div style={styles.detailLabel}>Investment Philosophy</div>
            <div style={styles.detailValue}>{philosophy || "Value Investing"}</div>
          </div>
          <div>
            <div style={styles.detailLabel}>Estimated AUM</div>
            <div style={styles.detailValue}>{formatMarketCap(currentAum)}</div>
          </div>
          <div>
            <div style={styles.detailLabel}>Last Filing Date</div>
            <div style={styles.detailValue}>
              {lastFilingDate ? new Date(lastFilingDate).toISOString().split("T")[0] : "—"}
            </div>
          </div>
        </div>

        {bio && (
          <div style={styles.bioSection}>
            <div style={styles.detailLabel}>Biography</div>
            <p style={styles.bioText}>{bio}</p>
          </div>
        )}
      </div>

      {/* Horizontal Tabs */}
      <div style={styles.tabsContainerBar}>
        <button
          style={{
            ...styles.tabBtn,
            ...(activeTab === "holdings" ? styles.activeTabBtn : {}),
          }}
          onClick={() => setActiveTab("holdings")}
        >
          Holdings
        </button>
        <button
          style={{
            ...styles.tabBtn,
            ...(activeTab === "history" ? styles.activeTabBtn : {}),
          }}
          onClick={() => setActiveTab("history")}
        >
          History & Timeline
        </button>
        <button
          style={{
            ...styles.tabBtn,
            ...(activeTab === "overlap" ? styles.activeTabBtn : {}),
          }}
          onClick={() => setActiveTab("overlap")}
        >
          Overlap Analysis
        </button>
        <button
          style={{
            ...styles.tabBtn,
            ...(activeTab === "aiStrategy" ? styles.activeTabBtn : {}),
          }}
          onClick={() => setActiveTab("aiStrategy")}
        >
          AI Strategy
        </button>
      </div>

      {/* Tab Contents */}
      <div style={styles.tabContent}>
        {activeTab === "holdings" && (
          <div>
            {/* Concentration & Allocation Row */}
            <div style={styles.analyticsRow}>
              {/* Concentration Card */}
              <div style={styles.analyticsCard}>
                <div style={styles.cardTitle}>PORTFOLIO CONCENTRATION</div>
                <div style={styles.hhiContainer}>
                  <div style={styles.hhiScore}>{(hhi * 10000).toFixed(0)}</div>
                  <div style={styles.hhiLabel}>HHI Score (Herfindahl-Hirschman Index)</div>
                </div>
                <span
                  style={{
                    ...styles.badge,
                    color: hhiBadge.color,
                    background: hhiBadge.bg,
                  }}
                >
                  {hhiBadge.text}
                </span>
                <p style={styles.cardDesc}>
                  A higher score indicates a more concentrated portfolio, which can amplify both gains and
                  losses.
                </p>
              </div>

              {/* Sector Allocation Pie Chart */}
              <div style={styles.analyticsCard}>
                <div style={styles.cardTitle}>SECTOR ALLOCATION</div>
                {pieData.length > 0 ? (
                  <div style={styles.pieChartContainer}>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip
                          contentStyle={{
                            background: "rgba(20, 20, 20, 0.95)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "0",
                            fontSize: "11px",
                          }}
                          formatter={(value) => [`${value}%`, "Allocation"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={styles.legendContainer}>
                      {pieData.slice(0, 5).map((entry, index) => (
                        <div key={entry.name} style={styles.legendItem}>
                          <div
                            style={{
                              ...styles.legendDot,
                              backgroundColor: COLORS[index % COLORS.length],
                            }}
                          />
                          <span style={styles.legendText}>
                            {entry.name}: {entry.value}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={styles.placeholder}>No allocation data available.</div>
                )}
              </div>
            </div>

            {/* Holdings Table */}
            <div style={styles.sectionCard}>
              <div style={styles.cardTitle}>PORTFOLIO HOLDINGS</div>
              {holdingsLoading ? (
                <div style={styles.loadingContainer}>
                  <div style={styles.spinner} />
                  <span>Loading holdings...</span>
                </div>
              ) : holdingsError ? (
                <div style={styles.errorText}>Failed to load holdings.</div>
              ) : !holdings || holdings.length === 0 ? (
                <div style={styles.placeholder}>No holdings found for the latest quarter.</div>
              ) : (
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th} onClick={() => handleSort("ticker")}>
                          Ticker {sortConfig.key === "ticker" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                        <th style={styles.th} onClick={() => handleSort("companyName")}>
                          Company Name {sortConfig.key === "companyName" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                        <th style={styles.th} onClick={() => handleSort("shares")}>
                          Shares {sortConfig.key === "shares" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                        <th style={styles.th} onClick={() => handleSort("value")}>
                          Value {sortConfig.key === "value" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                        <th style={styles.th} onClick={() => handleSort("weight")}>
                          Weight {sortConfig.key === "weight" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                        <th style={styles.th} onClick={() => handleSort("convictionScore")}>
                          Conviction {sortConfig.key === "convictionScore" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                        <th style={styles.th} onClick={() => handleSort("change")}>
                          QoQ Change {sortConfig.key === "change" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                        <th style={styles.th} onClick={() => handleSort("optionType")}>
                          Option Type {sortConfig.key === "optionType" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHoldings.map((h) => {
                        const stockInfo = stockDataMap?.[h.ticker.toUpperCase()];
                        const companyName = h.companyName || stockInfo?.name || "—";
                        const weightVal = h.portfolioWeight !== undefined ? h.portfolioWeight : (h.weight || 0);
                        const isWishlisted = wishlistSet.has(h.ticker.toUpperCase());
                        const indicator = tickerIndicatorMap.get(h.ticker.toUpperCase());
                        const changeVal = qoqMap[`${h.ticker.toUpperCase()}-${(h.optionType || "none").toLowerCase()}`];

                        return (
                          <tr key={h.id} style={styles.tr}>
                            <td style={styles.td}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <button
                                  style={styles.tickerBtn}
                                  onClick={() => onSelectTicker?.(h.ticker)}
                                >
                                  {h.ticker}
                                </button>
                                {indicator && (
                                  <span style={{
                                    ...styles.indicatorBadge,
                                    backgroundColor: indicator === "Owned" ? "var(--accent-green-dim)" : indicator === "Watched" ? "var(--accent-blue-dim)" : "var(--accent-purple-dim)",
                                    color: indicator === "Owned" ? "var(--accent-green)" : indicator === "Watched" ? "var(--accent-blue)" : "var(--accent-purple)",
                                  }}>
                                    {indicator}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={styles.td}>{companyName}</td>
                            <td style={styles.td}>{formatLargeNumber(h.shares)}</td>
                            <td style={styles.td}>{formatPrice(h.value)}</td>
                            <td style={styles.td}>{formatPercent(weightVal)}</td>
                            <td style={styles.td}>
                              {h.convictionScore != null ? h.convictionScore.toFixed(1) : "—"}
                            </td>
                            <td style={styles.td}>
                              {changeVal ? (
                                <span
                                  style={{
                                    ...styles.badge,
                                    backgroundColor:
                                      changeVal.label === "New"
                                        ? "var(--accent-blue-dim)"
                                        : changeVal.numericSort > 0
                                        ? "var(--accent-green-dim)"
                                        : changeVal.numericSort < 0 && changeVal.label !== "Closed"
                                        ? "var(--accent-amber-dim)"
                                        : "var(--accent-red-dim)",
                                    color:
                                      changeVal.label === "New"
                                        ? "var(--accent-blue)"
                                        : changeVal.numericSort > 0
                                        ? "var(--accent-green)"
                                        : changeVal.numericSort < 0 && changeVal.label !== "Closed"
                                        ? "var(--accent-amber)"
                                        : "var(--accent-red)",
                                  }}
                                >
                                  {changeVal.label}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={styles.td}>
                              {h.optionType && h.optionType.toLowerCase() !== "none" ? (
                                <span
                                  style={{
                                    ...styles.optionBadge,
                                    backgroundColor:
                                      h.optionType.toUpperCase() === "PUT"
                                        ? "var(--accent-red-dim)"
                                        : "var(--accent-green-dim)",
                                    color: h.optionType.toUpperCase() === "PUT" ? "var(--accent-red)" : "var(--accent-green)",
                                  }}
                                >
                                  {h.optionType.toUpperCase()}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={styles.td}>
                              <button
                                style={{
                                  ...styles.wishlistBtnToggle,
                                  color: isWishlisted ? "var(--accent-amber)" : "var(--text-secondary)",
                                }}
                                onClick={() => handleWishlistToggle(h.ticker)}
                                title={isWishlisted ? "Remove from Wishlist" : "Add to Wishlist"}
                              >
                                {isWishlisted ? "★ Wishlisted" : "☆ Add Wishlist"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <GuruTimeline history={historyData?.history} userRole={userRole} />
        )}

        {activeTab === "overlap" && (
          <GuruHeatmap gurus={gurus} currentGuruId={guruId} onSelectGuru={onSelectGuru} />
        )}

        {activeTab === "aiStrategy" && (
          <div style={styles.sectionCard}>
            <div style={styles.cardTitle}>AI STRATEGY INSIGHTS</div>
            {userRole === "GUEST" ? (
              <div style={styles.upgradeOverlay}>
                <div style={styles.lockIcon}>🔒</div>
                <h3>Premium Feature: AI Strategy Analyst Report</h3>
                <p>Access Gemini's deep strategy analysis and risk profiles for this fund.</p>
                <a href="/login" style={styles.upgradeBtn}>
                  Sign in to Unlock AI Report
                </a>
              </div>
            ) : aiLoading ? (
              <div style={styles.loadingContainer}>
                <div style={styles.spinner} />
                <span>Analyzing filings & generating strategy summary...</span>
              </div>
            ) : aiError ? (
              <div style={styles.errorText}>
                AI analysis is temporarily unavailable. Please try again later.
              </div>
            ) : (
              <div style={styles.aiReport}>
                <p style={styles.aiText}>{aiStrategy || "No report available for this investor."}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(GuruDetail);


const styles = {
  tabsContainerBar: {
    display: "flex",
    gap: "8px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    paddingBottom: "12px",
    marginBottom: "20px",
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    padding: "8px 16px",
    borderRadius: "0",
    transition: "all 0.15s ease",
    fontFamily: "var(--font-body)",
  },
  activeTabBtn: {
    background: "rgba(255, 255, 255, 0.06)",
    color: "var(--accent-blue)",
    fontWeight: 600,
  },
  tabContent: {
    marginTop: "10px",
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "20px 0",
  },
  toast: {
    position: "fixed",
    top: "24px",
    left: "50%",
    background: "rgba(9, 13, 23, 0.95)",
    border: "1px solid var(--accent-red)",
    boxShadow: "0 10px 30px rgba(255, 77, 109, 0.2)",
    borderRadius: "0",
    padding: "12px 24px",
    color: "var(--text-primary)",
    fontSize: "13px",
    fontWeight: 500,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  toastIcon: {
    color: "var(--accent-red)",
    fontSize: "16px",
  },
  backBtn: {
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderRadius: "0",
    color: "var(--accent-blue)",
    fontSize: "12px",
    cursor: "pointer",
    padding: "8px 16px",
    marginBottom: "20px",
    fontFamily: "var(--font-body)",
    transition: "background 0.2s",
  },
  profileCard: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "0",
    padding: "24px",
    marginBottom: "20px",
  },
  avatarBig: {
    width: "60px",
    height: "60px",
    borderRadius: "0",
    background: "linear-gradient(135deg, var(--accent-blue-dim), rgba(255,255,255,0.05))",
    border: "2px solid var(--accent-blue)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    boxShadow: "0 4px 20px rgba(79, 141, 255, 0.2)",
  },
  profileHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    paddingBottom: "16px",
    marginBottom: "16px",
  },
  name: {
    fontSize: "24px",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
    fontFamily: "var(--font-display)",
  },
  fundName: {
    fontSize: "14px",
    color: "var(--text-secondary)",
    marginTop: "4px",
  },
  tagsContainer: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  tag: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "0",
    padding: "4px 10px",
    fontSize: "11px",
    color: "var(--text-secondary)",
  },
  profileDetailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "20px",
    marginBottom: "16px",
  },
  detailLabel: {
    fontSize: "11px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "6px",
  },
  detailValue: {
    fontSize: "14px",
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  bioSection: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    paddingTop: "16px",
  },
  bioText: {
    fontSize: "13px",
    color: "var(--text-secondary)",
    lineHeight: "1.6",
    margin: 0,
  },
  analyticsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "20px",
    marginBottom: "20px",
  },
  analyticsCard: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "0",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
  },
  cardTitle: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "8px",
    marginBottom: "16px",
    fontFamily: "var(--font-display)",
  },
  hhiContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    margin: "16px 0",
  },
  hhiScore: {
    fontSize: "36px",
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
  },
  hhiLabel: {
    fontSize: "11px",
    color: "var(--text-muted)",
  },
  badge: {
    alignSelf: "flex-start",
    fontSize: "11px",
    fontWeight: 600,
    padding: "4px 8px",
    borderRadius: "0",
    marginBottom: "16px",
    textTransform: "uppercase",
  },
  cardDesc: {
    fontSize: "12px",
    color: "var(--text-muted)",
    lineHeight: "1.5",
    margin: 0,
    marginTop: "auto",
  },
  pieChartContainer: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap",
  },
  legendContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    flex: 1,
    minWidth: "150px",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  legendDot: {
    width: "8px",
    height: "8px",
    borderRadius: "0",
  },
  legendText: {
    fontSize: "11px",
    color: "var(--text-secondary)",
  },
  sectionCard: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "0",
    padding: "20px",
    marginBottom: "20px",
  },
  aiReport: {
    background: "rgba(255,255,255,0.01)",
    border: "1px solid rgba(255,255,255,0.03)",
    borderRadius: "0",
    padding: "16px",
  },
  aiText: {
    fontSize: "13px",
    color: "var(--text-secondary)",
    lineHeight: "1.6",
    whiteSpace: "pre-wrap",
    margin: 0,
  },
  upgradeOverlay: {
    padding: "30px 20px",
    textAlign: "center",
    background: "rgba(255, 255, 255, 0.01)",
    border: "1px dashed rgba(255, 255, 255, 0.15)",
    borderRadius: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  lockIcon: {
    fontSize: "24px",
    marginBottom: "10px",
  },
  upgradeBtn: {
    display: "inline-block",
    marginTop: "12px",
    padding: "6px 12px",
    background: "var(--accent-blue)",
    color: "white",
    borderRadius: "0",
    textDecoration: "none",
    fontSize: "11px",
    fontWeight: 600,
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "30px",
    gap: "12px",
    color: "var(--text-secondary)",
    fontSize: "12px",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid rgba(255,255,255,0.1)",
    borderTopColor: "var(--accent-blue)",
    borderRadius: "0",
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
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  th: {
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: "11px",
    color: "var(--text-secondary)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontFamily: "var(--font-display)",
    cursor: "pointer",
    userSelect: "none",
    transition: "color 0.15s ease",
    ":hover": {
      color: "var(--text-primary)",
    },
  },
  tr: {
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  td: {
    padding: "12px 16px",
    fontSize: "12px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
  },
  tickerBtn: {
    background: "rgba(79, 141, 255, 0.08)",
    border: "1px solid rgba(79, 141, 255, 0.2)",
    color: "var(--accent-blue)",
    fontWeight: "bold",
    cursor: "pointer",
    borderRadius: "0",
    padding: "2px 6px",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
  },
  indicatorBadge: {
    padding: "2px 6px",
    borderRadius: "0",
    fontSize: "11px",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },
  optionBadge: {
    padding: "2px 6px",
    borderRadius: "0",
    fontSize: "11px",
    fontWeight: "bold",
  },
  wishlistBtnToggle: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "0",
    padding: "4px 8px",
    fontSize: "11px",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    transition: "all 0.15s ease",
  },
};
