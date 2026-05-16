import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import PortfolioManager from "./components/PortfolioManager";
import StockCard from "./components/StockCard";
import StockDetailModal from "./components/StockDetailModal";
import MarketIndicatorsPage from "./components/MarketIndicatorsPage";
import StockAnalysisPage from "./components/StockAnalysisPage";
import SchwabAuthAlert from "./components/SchwabAuthAlert";
import MarketSessionBadge from "./components/MarketSessionBadge";
import LoginPage from "./components/LoginPage";
import AdminDashboard from "./components/AdminDashboard";
import { useAuth } from "./context/AuthContext";
import { usePortfolio, useLivePrices, usePortfolioItems } from "./hooks/useStockData";
import { getMarketStatus } from "./utils/marketStatus";

export default function App() {
  const { user, loading: authLoading, logout } = useAuth();
  const {
    tickers,
    wishlistTickers,
    addToWatchlist,
    removeFromWatchlist,
    addToWishlist,
    removeFromWishlist,
  } = usePortfolioItems(user?.id);

  const [selectedTicker, setSelectedTicker] = useState(null);
  const [currentPage, setCurrentPage] = useState("portfolio");
  const [period, setPeriod] = useState("5y");
  const [marketStatus, setMarketStatus] = useState(getMarketStatus);
  const allTickers = [...new Set([...tickers, ...wishlistTickers])];
  const { data, loading, errors, refetch } = usePortfolio(allTickers);
  const { liveData } = useLivePrices(allTickers);

  const handleCloseModal = useCallback(() => setSelectedTicker(null), []);
  const handleOpenAnalysis = useCallback(() => setCurrentPage("stock"), []);
  const handleBackFromAnalysis = useCallback(() => {
    setCurrentPage("portfolio");
    setSelectedTicker(null);
  }, []);

  useEffect(() => {
    setMarketStatus(getMarketStatus());
    const interval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Initialize from URL on first load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page") || "portfolio";
    const ticker = params.get("ticker");
    if (["portfolio", "indicators", "stock", "admin"].includes(page)) {
      setCurrentPage(page);
    }
    if (ticker) setSelectedTicker(ticker);
  }, []);

  // Sync state TO URL on every navigation change
  useEffect(() => {
    const url = new URL(window.location);
    if (currentPage === "portfolio") {
      url.searchParams.delete("page");
      url.searchParams.delete("ticker");
    } else if (currentPage === "stock" && selectedTicker) {
      url.searchParams.set("page", "stock");
      url.searchParams.set("ticker", selectedTicker);
    } else if (currentPage === "indicators") {
      url.searchParams.set("page", "indicators");
    } else if (currentPage === "admin") {
      url.searchParams.set("page", "admin");
      url.searchParams.delete("ticker");
    }
    history.pushState({ currentPage, selectedTicker }, "", url);
  }, [currentPage, selectedTicker]);

  // Sync URL TO state on browser back/forward
  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      const page = params.get("page") || "portfolio";
      setCurrentPage(page);
      setSelectedTicker(params.get("ticker"));
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // Merge live price data into portfolio data
  const mergedData = {};
  for (const [ticker, stockData] of Object.entries(data)) {
    mergedData[ticker] = {
      ...stockData,
      ...(liveData[ticker] ? {
        currentPrice: liveData[ticker].currentPrice,
        change: liveData[ticker].change,
        changePercent: liveData[ticker].changePercent,
      } : {}),
    };
  }

  // ─── Auth gates ──────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <>
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
        <div style={styles.loadingScreen}>
          <div style={styles.loadingSpinner} />
        </div>
      </>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // ─── Dashboard ───────────────────────────────────────────────────────

  return (
    <>
      {/* Ambient background orbs */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      <SchwabAuthAlert />

      <div style={styles.layout}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerInner}>
            <div style={styles.logo}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M2 14l4-4 3 3 4-5 4 2" stroke="var(--accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="2" cy="14" r="1.5" fill="var(--accent-green)" />
                <circle cx="18" cy="10" r="1.5" fill="var(--accent-green)" />
              </svg>
              <span style={styles.logoText}>Portfolio Monitor</span>
            </div>

            <div style={styles.headerMeta}>
              <span style={styles.userEmail}>{user.email}</span>

              <MarketSessionBadge status={marketStatus} variant="header" />

              <div style={styles.pageToggle}>
                <button
                  style={{
                    ...styles.toggleBtn,
                    ...(currentPage === "portfolio" ? styles.toggleBtnActive : {}),
                  }}
                  onClick={() => {
                    if (currentPage === "stock") setSelectedTicker(null);
                    setCurrentPage("portfolio");
                  }}
                >
                  Portfolio
                </button>
                <button
                  style={{
                    ...styles.toggleBtn,
                    ...(currentPage === "indicators" ? styles.toggleBtnActive : {}),
                  }}
                  onClick={() => {
                    if (currentPage === "stock") setSelectedTicker(null);
                    setCurrentPage("indicators");
                  }}
                >
                  Market Indicators
                </button>
                {user?.role === "ADMIN" && (
                  <button
                    style={{
                      ...styles.toggleBtn,
                      ...(currentPage === "admin" ? styles.toggleBtnActive : {}),
                    }}
                    onClick={() => {
                      if (currentPage === "stock") setSelectedTicker(null);
                      setCurrentPage("admin");
                    }}
                  >
                    Admin
                  </button>
                )}
              </div>

              <button style={styles.refreshBtn} onClick={refetch}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M11 2.5A5.5 5.5 0 1 1 6.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M6.5 1L8.5 3l-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Refresh
              </button>

              <button style={styles.logoutBtn} onClick={logout}>
                Logout
              </button>
            </div>
          </div>
        </header>

        <main style={styles.main}>
          {currentPage === "portfolio" && (
            <div>
              {/* Portfolio Manager */}
              <section style={styles.managerSection}>
                <PortfolioManager
                  watchlist={tickers}
                  wishlist={wishlistTickers}
                  onAddToWatchlist={addToWatchlist}
                  onRemoveFromWatchlist={removeFromWatchlist}
                  onAddToWishlist={addToWishlist}
                  onRemoveFromWishlist={removeFromWishlist}
                />
              </section>

              <div style={styles.sectionSticky}>
                <div className="section-label">Watch List</div>
                {tickers.length > 0 && (
                  <div style={styles.statsBar}>
                    <span style={styles.statsText}>
                      {tickers.length} stock{tickers.length !== 1 ? "s" : ""} tracked
                    </span>
                    {Object.keys(errors).length > 0 && (
                      <span style={styles.errorBadge}>
                        {Object.keys(errors).length} failed to load
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Stock Cards Grid */}
              {tickers.length === 0 ? (
                <div style={styles.emptyState}>
                  <svg width="36" height="36" viewBox="0 0 40 40" fill="none" opacity={0.25}>
                    <rect x="4" y="10" width="32" height="24" rx="4" stroke="white" strokeWidth="1.5" />
                    <path d="M12 24l5-5 4 4 5-6 4 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p style={styles.emptyText}>Add your first stock to start tracking</p>
                </div>
              ) : (
                <div style={styles.grid}>
                  {tickers.map((ticker, i) => (
                    <StockCard
                      key={ticker}
                      ticker={ticker}
                      data={mergedData[ticker]}
                      error={errors[ticker]}
                      loading={loading && !data[ticker]}
                      onClick={setSelectedTicker}
                      index={i}
                      variant="primary"
                    />
                  ))}
                </div>
              )}

              {/* Wish List */}
              {wishlistTickers.length > 0 && (
                <>
                  <div style={styles.sectionDivider} />
                  <div style={styles.sectionSticky}>
                    <div className="section-label">Wish List</div>
                    <div style={styles.statsBar}>
                      <span style={styles.statsText}>
                        {wishlistTickers.length} stock{wishlistTickers.length !== 1 ? "s" : ""} wishlisted
                      </span>
                    </div>
                  </div>
                  <div style={styles.grid}>
                    {wishlistTickers.map((ticker, i) => (
                      <StockCard
                        key={ticker}
                        ticker={ticker}
                        data={mergedData[ticker]}
                        error={errors[ticker]}
                        loading={loading && !data[ticker]}
                        onClick={setSelectedTicker}
                        index={i}
                        variant="secondary"
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {currentPage === "indicators" && <MarketIndicatorsPage />}

          {currentPage === "stock" && selectedTicker && (
            <StockAnalysisPage
              ticker={selectedTicker}
              currentPrice={mergedData[selectedTicker]?.currentPrice}
              onBack={handleBackFromAnalysis}
            />
          )}

          {currentPage === "admin" && (
            user?.role === "ADMIN" ? (
              <AdminDashboard />
            ) : (
              <div style={styles.forbidden}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" opacity={0.3}>
                  <circle cx="16" cy="16" r="14" stroke="var(--accent-red)" strokeWidth="1.5" />
                  <path d="M12 20l8-8M20 20l-8-8" stroke="var(--accent-red)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <h2 style={styles.forbiddenTitle}>Access Denied</h2>
                <p style={styles.forbiddenText}>You do not have permission to access the admin dashboard.</p>
              </div>
            )
          )}
        </main>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedTicker && currentPage !== "stock" && (
          <StockDetailModal
            ticker={selectedTicker}
            onClose={handleCloseModal}
            period={period}
            setPeriod={setPeriod}
            onOpenAnalysis={handleOpenAnalysis}
            livePrice={liveData[selectedTicker]?.currentPrice}
          />
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes flash-up {
          0% { background: rgba(0, 229, 160, 0.15); }
          100% { background: transparent; }
        }
        @keyframes flash-down {
          0% { background: rgba(255, 77, 109, 0.15); }
          100% { background: transparent; }
        }
      `}</style>
    </>
  );
}

const styles = {
  layout: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    position: "relative",
    zIndex: 1,
  },
  header: {
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    background: "rgba(5, 8, 15, 0.7)",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  headerInner: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    margin: "0 auto",
    maxWidth: "1400px",
    padding: "16px 32px",
  },
  logo: {
    alignItems: "center",
    display: "flex",
    gap: "10px",
  },
  logoText: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "15px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  headerMeta: {
    alignItems: "center",
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
  },
  userEmail: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    letterSpacing: "0.02em",
    opacity: 0.7,
  },
  pageToggle: {
    display: "flex",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "8px",
    overflow: "hidden",
  },
  toggleBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    padding: "6px 12px",
    transition: "all 0.15s",
  },
  toggleBtnActive: {
    background: "var(--accent-blue)",
    color: "white",
  },
  refreshBtn: {
    alignItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "8px",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    gap: "6px",
    padding: "6px 12px",
    transition: "all 0.15s",
  },
  logoutBtn: {
    background: "rgba(255,77,109,0.1)",
    border: "1px solid rgba(255,77,109,0.2)",
    borderRadius: "8px",
    color: "var(--accent-red)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    padding: "6px 12px",
    transition: "all 0.15s",
  },
  main: {
    display: "flex",
    flexDirection: "column",
    gap: "28px",
    margin: "0 auto",
    maxWidth: "1400px",
    padding: "36px 32px 64px",
    width: "100%",
  },
  managerSection: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sectionSticky: {
    position: "sticky",
    top: "65px",
    zIndex: 40,
    background: "linear-gradient(to bottom, #05080f 70%, transparent)",
    padding: "8px 0",
    marginBottom: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  sectionDivider: {
    height: "1px",
    background: "rgba(255,255,255,0.05)",
    margin: "16px 0",
  },
  statsBar: {
    alignItems: "center",
    display: "flex",
    gap: "12px",
  },
  statsText: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
  },
  errorBadge: {
    background: "var(--accent-red-dim)",
    borderRadius: "6px",
    color: "var(--accent-red)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    padding: "3px 8px",
  },
  grid: {
    display: "grid",
    gap: "16px",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  },
  emptyState: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    justifyContent: "center",
    minHeight: "140px",
  },
  emptyText: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
  },
  forbidden: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    justifyContent: "center",
    minHeight: "200px",
    textAlign: "center",
  },
  forbiddenTitle: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  forbiddenText: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    lineHeight: "1.5",
    maxWidth: "320px",
  },
  loadingScreen: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    position: "relative",
    zIndex: 1,
  },
  loadingSpinner: {
    width: "28px",
    height: "28px",
    border: "2px solid rgba(255,255,255,0.08)",
    borderTopColor: "var(--accent-blue)",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
};
