import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ListSectionHeader from "./components/ListSectionHeader";
import StockCard from "./components/StockCard";
import StockDetailModal from "./components/StockDetailModal";
import MarketIndicatorsPage from "./components/MarketIndicatorsPage";
import StockAnalysisPage from "./components/StockAnalysisPage";
import SchwabAuthAlert from "./components/SchwabAuthAlert";
import MarketSessionBadge from "./components/MarketSessionBadge";
import LoginPage from "./components/LoginPage";
import AdminDashboard from "./components/AdminDashboard";
import GurusTab from "./components/GurusTab";
import { useAuth } from "./context/AuthContext";
import { usePortfolio, useLivePrices, usePortfolioItems } from "./hooks/useStockData";
import { getMarketStatus } from "./utils/marketStatus";
import { MAX_PORTFOLIO_TICKERS, MAX_WISHLIST_TICKERS } from "./constants";

export default function App() {
  const { user, loading: authLoading, logout } = useAuth();
  const {
    tickers,
    wishlistTickers,
    addToWatchlist,
    removeFromWatchlist,
    addToWishlist,
    removeFromWishlist,
    portfolio,
  } = usePortfolioItems(user?.id);

  const [selectedTicker, setSelectedTicker] = useState(null);
  const [selectedGuruId, setSelectedGuruId] = useState(null);
  const [currentPage, setCurrentPage] = useState("portfolio");
  const [previousPage, setPreviousPage] = useState("portfolio");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [period, setPeriod] = useState("5y");
  const [marketStatus, setMarketStatus] = useState(getMarketStatus);
  const allTickers = [...new Set([...tickers, ...wishlistTickers])];
  const { data, loading, errors } = usePortfolio(allTickers);
  const { liveData } = useLivePrices(allTickers);

  const handleCloseModal = useCallback(() => setSelectedTicker(null), []);
  const handleOpenAnalysis = useCallback(() => {
    setPreviousPage(currentPage);
    setCurrentPage("stock");
  }, [currentPage]);
  const handleBackFromAnalysis = useCallback(() => {
    setCurrentPage(previousPage === "stock" ? "portfolio" : previousPage);
    setSelectedTicker(null);
  }, [previousPage]);

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
    const guruId = params.get("guruId");
    if (["portfolio", "indicators", "stock", "admin", "gurus"].includes(page)) {
      setCurrentPage(page);
    }
    if (ticker) setSelectedTicker(ticker);
    if (guruId) setSelectedGuruId(guruId);
  }, []);

  // Sync state TO URL on every navigation change
  useEffect(() => {
    const url = new URL(window.location);
    if (currentPage === "portfolio") {
      url.searchParams.delete("page");
      url.searchParams.delete("ticker");
      url.searchParams.delete("guruId");
    } else if (currentPage === "stock" && selectedTicker) {
      url.searchParams.set("page", "stock");
      url.searchParams.set("ticker", selectedTicker);
      url.searchParams.delete("guruId");
    } else if (currentPage === "indicators") {
      url.searchParams.set("page", "indicators");
      url.searchParams.delete("ticker");
      url.searchParams.delete("guruId");
    } else if (currentPage === "admin") {
      url.searchParams.set("page", "admin");
      url.searchParams.delete("ticker");
      url.searchParams.delete("guruId");
    } else if (currentPage === "gurus") {
      url.searchParams.set("page", "gurus");
      url.searchParams.delete("ticker");
      if (selectedGuruId) {
        url.searchParams.set("guruId", selectedGuruId);
      } else {
        url.searchParams.delete("guruId");
      }
    }
    history.pushState({ currentPage, selectedTicker, selectedGuruId }, "", url);
  }, [currentPage, selectedTicker, selectedGuruId]);

  // Sync URL TO state on browser back/forward
  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      const page = params.get("page") || "portfolio";
      setCurrentPage(page);
      setSelectedTicker(params.get("ticker"));
      setSelectedGuruId(params.get("guruId"));
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
        {/* Drawer Navigation */}
        <AnimatePresence>
          {isDrawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={styles.drawerBackdrop}
                onClick={() => setIsDrawerOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                style={styles.drawer}
              >
                <div style={styles.drawerHeader}>
                  <div style={styles.logo}>
                    <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
                      <polygon points="10,10 90,10 90,40 50,80 10,40" stroke="var(--accent-blue)" strokeWidth="4" fill="rgba(0,240,255,0.1)" />
                      <polygon points="10,40 50,80 90,40" fill="var(--accent-blue)" opacity="0.5" />
                      <line x1="20" y1="20" x2="80" y2="20" stroke="var(--accent-blue)" strokeWidth="4" />
                      <line x1="50" y1="20" x2="50" y2="70" stroke="var(--accent-blue)" strokeWidth="4" />
                    </svg>
                  <span style={styles.logoText}>DUMB_MONEY.ST</span>
                  </div>
                  <button style={styles.drawerClose} onClick={() => setIsDrawerOpen(false)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <div style={styles.drawerNav}>
                  <button
                    className={`drawer-nav-item ${currentPage === "portfolio" ? "drawer-nav-item-active" : ""}`}
                    onClick={() => {
                      if (currentPage === "stock") setSelectedTicker(null);
                      setCurrentPage("portfolio");
                      setIsDrawerOpen(false);
                    }}
                  >
                    Portfolio
                  </button>
                  <button
                    className={`drawer-nav-item ${currentPage === "indicators" ? "drawer-nav-item-active" : ""}`}
                    onClick={() => {
                      if (currentPage === "stock") setSelectedTicker(null);
                      setCurrentPage("indicators");
                      setIsDrawerOpen(false);
                    }}
                  >
                    Market Indicators
                  </button>
                  <button
                    className={`drawer-nav-item ${currentPage === "gurus" ? "drawer-nav-item-active" : ""}`}
                    onClick={() => {
                      if (currentPage === "stock") setSelectedTicker(null);
                      setCurrentPage("gurus");
                      setIsDrawerOpen(false);
                    }}
                  >
                    Guru Tracker
                  </button>
                  {user?.role === "ADMIN" && (
                    <button
                      className={`drawer-nav-item ${currentPage === "admin" ? "drawer-nav-item-active" : ""}`}
                      onClick={() => {
                        if (currentPage === "stock") setSelectedTicker(null);
                        setCurrentPage("admin");
                        setIsDrawerOpen(false);
                      }}
                    >
                      Admin
                    </button>
                  )}
                </div>
                <div style={styles.drawerFooter}>
                  <div style={styles.drawerUserSection}>
                    <div style={styles.drawerUserAvatar}>
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <div style={styles.drawerUserDetails}>
                      <span style={styles.drawerUserLabel}>Logged in as</span>
                      <span style={styles.drawerUserEmail} title={user.email}>{user.email}</span>
                    </div>
                  </div>
                  <button className="drawer-logout-btn" onClick={logout}>
                    Logout
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerInner}>
            <div style={styles.headerLeft}>
              <button style={styles.hamburger} onClick={() => setIsDrawerOpen(true)}>
                <span style={styles.hamburgerLine}></span>
                <span style={styles.hamburgerLine}></span>
                <span style={styles.hamburgerLine}></span>
              </button>
              <div style={styles.logo}>
                <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
                  <polygon points="10,10 90,10 90,40 50,80 10,40" stroke="var(--accent-blue)" strokeWidth="4" fill="rgba(0,240,255,0.1)" />
                  <polygon points="10,40 50,80 90,40" fill="var(--accent-blue)" opacity="0.5" />
                  <line x1="20" y1="20" x2="80" y2="20" stroke="var(--accent-blue)" strokeWidth="4" />
                  <line x1="50" y1="20" x2="50" y2="70" stroke="var(--accent-blue)" strokeWidth="4" />
                </svg>
              <span style={styles.logoText}>DUMB_MONEY.ST</span>
            </div>
            </div>

            <div style={styles.headerMeta}>
              <MarketSessionBadge status={marketStatus} variant="header" />
            </div>
          </div>
        </header>

        <main style={styles.main}>
          {currentPage === "portfolio" && (
            <div>
              {/* Watch List Section */}
              <ListSectionHeader
                title="Watch List"
                count={tickers.length}
                errorCount={Object.keys(errors).length}
                list={tickers}
                onAdd={addToWatchlist}
                onRemove={removeFromWatchlist}
                maxItems={MAX_PORTFOLIO_TICKERS}
                placeholder="Search to add to Watch List…"
                listType="watchlist"
              />

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

              {/* Wish List Section */}
              <div style={styles.sectionDivider} />
              <ListSectionHeader
                title="Wish List"
                count={wishlistTickers.length}
                errorCount={0}
                list={wishlistTickers}
                onAdd={addToWishlist}
                onRemove={removeFromWishlist}
                maxItems={MAX_WISHLIST_TICKERS}
                placeholder="Search to add to Wish List…"
                listType="wishlist"
              />
              
              {wishlistTickers.length > 0 && (
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
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {currentPage === "indicators" && <MarketIndicatorsPage />}

          {currentPage === "gurus" && (
            <GurusTab
              user={user}
              tickers={tickers}
              wishlistTickers={wishlistTickers}
              addToWishlist={addToWishlist}
              removeFromWishlist={removeFromWishlist}
              selectedGuruId={selectedGuruId}
              setSelectedGuruId={setSelectedGuruId}
              setSelectedTicker={setSelectedTicker}
              portfolio={portfolio}
            />
          )}

          {currentPage === "stock" && selectedTicker && (
            <StockAnalysisPage
              ticker={selectedTicker}
              livePriceData={liveData[selectedTicker]}
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
            livePriceData={liveData[selectedTicker]}
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
          0% { background: rgba(57, 255, 20, 0.15); }
          100% { background: transparent; }
        }
        @keyframes flash-down {
          0% { background: rgba(255, 0, 60, 0.15); }
          100% { background: transparent; }
        }
        .drawer-nav-item {
          padding: 12px 16px;
          border-radius: 0;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 14px;
          transition: all 0.2s ease;
          cursor: pointer;
          background: none;
          border: 1px solid transparent;
          border-left: 2px solid transparent;
          text-align: left;
          font-family: var(--font-body);
          display: flex;
          align-items: center;
          gap: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .drawer-nav-item:hover {
          background: rgba(0, 240, 255, 0.05);
          color: var(--text-primary);
          border-color: rgba(0, 240, 255, 0.2);
          border-left-color: var(--accent-blue);
        }
        .drawer-nav-item-active {
          background: rgba(0, 240, 255, 0.1) !important;
          color: var(--accent-blue) !important;
          border-color: var(--accent-blue) !important;
          border-left-width: 4px !important;
          font-weight: 700;
          box-shadow: inset 10px 0 20px -10px rgba(0, 240, 255, 0.3);
        }
        .drawer-logout-btn {
          background: transparent;
          border: 1px solid var(--accent-red);
          border-radius: 0;
          color: var(--accent-red);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: 12px;
          font-weight: 700;
          padding: 12px 16px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: center;
          display: block;
          width: 100%;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .drawer-logout-btn:hover {
          background: var(--accent-red);
          color: #000;
          box-shadow: var(--glow-red);
        }
        .drawer-logout-btn:active {
          transform: translateY(2px);
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
    borderBottom: "1px solid var(--glass-border)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    background: "var(--bg-surface)",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  headerInner: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    margin: "0 auto",
    maxWidth: "1600px",
    padding: "16px 32px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  hamburger: {
    background: "none",
    border: "none",
    color: "var(--text-primary)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    padding: "8px",
    marginLeft: "-8px",
  },
  hamburgerLine: {
    display: "block",
    width: "20px",
    height: "2px",
    backgroundColor: "currentColor",
    borderRadius: "2px",
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
  drawerBackdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0, 0, 0, 0.5)",
    backdropFilter: "blur(4px)",
    zIndex: 100,
  },
  drawer: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "280px",
    height: "100vh",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--accent-blue)",
    zIndex: 101,
    display: "flex",
    flexDirection: "column",
  },
  drawerHeader: {
    padding: "24px",
    borderBottom: "1px solid var(--glass-border)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  drawerClose: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerNav: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: 1,
  },
  navItem: {
    padding: "12px 16px",
    borderRadius: "0",
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: "14px",
    transition: "all 0.2s",
    cursor: "pointer",
    background: "none",
    border: "1px solid transparent",
    borderLeft: "2px solid transparent",
    textAlign: "left",
    fontFamily: "var(--font-body)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  navItemActive: {
    background: "rgba(0, 240, 255, 0.05)",
    color: "var(--accent-blue)",
    borderLeftColor: "var(--accent-blue)",
    boxShadow: "inset 10px 0 20px -10px rgba(0, 240, 255, 0.2)",
  },
  drawerFooter: {
    padding: "24px",
    borderTop: "1px solid var(--glass-border)",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    background: "var(--bg-surface)",
  },
  drawerUserSection: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  drawerUserAvatar: {
    width: "38px",
    height: "38px",
    borderRadius: "0",
    border: "1px solid var(--accent-blue)",
    background: "rgba(0, 240, 255, 0.1)",
    color: "var(--accent-blue)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "18px",
    fontFamily: "var(--font-display)",
    boxShadow: "var(--glow-blue)",
    textShadow: "0 0 5px var(--accent-blue)",
  },
  drawerUserDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  drawerUserLabel: {
    fontSize: "11px",
    color: "var(--text-muted)",
    fontFamily: "var(--font-body)",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  drawerUserEmail: {
    fontSize: "14px",
    color: "var(--text-primary)",
    fontWeight: 500,
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    letterSpacing: "0.01em",
  },
  main: {
    display: "flex",
    flexDirection: "column",
    gap: "28px",
    margin: "0 auto",
    maxWidth: "1600px",
    padding: "36px 32px 64px",
    width: "100%",
  },
  sectionDivider: {
    height: "1px",
    background: "var(--glass-border)",
    margin: "16px 0",
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
    border: "1px dashed var(--glass-border)",
  },
  emptyText: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    textTransform: "uppercase",
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
