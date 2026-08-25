import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import * as Sentry from "@sentry/react";
import StockDetailModal from "./components/StockDetailModal";
import SchwabAuthAlert from "./components/SchwabAuthAlert";
import MarketSessionBadge from "./components/MarketSessionBadge";
import NavigationDrawer from "./components/NavigationDrawer";
import { useAuth } from "./context/AuthContext";
import { usePortfolio, useLivePrices, usePortfolioItems } from "./hooks/useStockData";
import { getMarketStatus } from "./utils/marketStatus";

// ── Lazy-loaded route pages (code splitting via Vite dynamic import) ──
const PortfolioPage = React.lazy(() => import("./pages/PortfolioPage"));
const IndicatorsPage = React.lazy(() => import("./pages/IndicatorsPage"));
const GurusPage = React.lazy(() => import("./pages/GurusPage"));
const StockAnalysisPage = React.lazy(() => import("./pages/StockAnalysisPage"));
const AdminPage = React.lazy(() => import("./pages/AdminPage"));
const AdviserPage = React.lazy(() => import("./pages/AdviserPage"));
const GuruPage = React.lazy(() => import("./pages/GuruPage"));
const SecPage = React.lazy(() => import("./pages/SecPage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));

// Maps legacy `?page=X` query params to their new hash routes.
const LEGACY_PAGE_MAP = {
  portfolio: "/",
  indicators: "/indicators",
  gurus: "/gurus",
  stock: "/stock",
  admin: "/admin",
};

// One-time redirect for legacy deep links (e.g. ?page=stock&ticker=AAPL).
function useLegacyRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page");
    if (!page || !LEGACY_PAGE_MAP[page]) return;
    const target = LEGACY_PAGE_MAP[page];
    let to = target;
    if (page === "stock" && params.get("ticker")) {
      to = `/stock/${encodeURIComponent(params.get("ticker"))}`;
    } else if (page === "gurus" && params.get("guruId")) {
      to = `/gurus/${encodeURIComponent(params.get("guruId"))}`;
    }
    navigate(to, { replace: true });
  }, [navigate]);
}

function PageLoader() {
  return (
    <div style={styles.loadingScreen}>
      <div style={styles.loadingSpinner} />
    </div>
  );
}

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

export default function App() {
  const { user, loading: authLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  useLegacyRedirect();

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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [period, setPeriod] = useState("5y");
  const [marketStatus, setMarketStatus] = useState(getMarketStatus);

  const allTickers = useMemo(
    () => [...new Set([...tickers, ...wishlistTickers])],
    [tickers, wishlistTickers]
  );
  const { data, loading, errors } = usePortfolio(allTickers);
  const { liveData } = useLivePrices(allTickers);

  const handleCloseModal = useCallback(() => setSelectedTicker(null), []);
  const handleCloseDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const handleOpenDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const handleSelectTicker = useCallback((ticker) => setSelectedTicker(ticker), []);

  // Merge live price data into portfolio data
  const mergedData = useMemo(() => {
    const res = {};
    for (const [ticker, stockData] of Object.entries(data)) {
      res[ticker] = {
        ...stockData,
        ...(liveData[ticker]
          ? {
              currentPrice: liveData[ticker].currentPrice,
              change: liveData[ticker].change,
              changePercent: liveData[ticker].changePercent,
            }
          : {}),
      };
    }
    return res;
  }, [data, liveData]);

  // Market status polling (kept from original App)
  useEffect(() => {
    setMarketStatus(getMarketStatus());
    const interval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ─── Auth gates ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <>
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
        <PageLoader />
      </>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    );
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
        <NavigationDrawer isOpen={isDrawerOpen} onClose={handleCloseDrawer} />

        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerInner}>
            <div style={styles.headerLeft}>
              <button style={styles.hamburger} onClick={handleOpenDrawer}>
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
          <Suspense fallback={<PageLoader />}>
            <SentryRoutes>
              <Route
                path="/"
                element={
                  <PortfolioPage
                    tickers={tickers}
                    wishlistTickers={wishlistTickers}
                    mergedData={mergedData}
                    errors={errors}
                    loading={loading}
                    data={data}
                    liveData={liveData}
                    addToWatchlist={addToWatchlist}
                    removeFromWatchlist={removeFromWatchlist}
                    addToWishlist={addToWishlist}
                    removeFromWishlist={removeFromWishlist}
                    onSelectTicker={handleSelectTicker}
                    period={period}
                    setPeriod={setPeriod}
                  />
                }
              />
              <Route path="/indicators" element={<IndicatorsPage />} />
              <Route
                path="/gurus"
                element={<GurusPage setSelectedTicker={handleSelectTicker} />}
              />
              <Route
                path="/gurus/:guruId"
                element={<GurusPage setSelectedTicker={handleSelectTicker} />}
              />

              <Route
                path="/stock/:ticker"
                element={<StockAnalysisPage liveData={liveData} />}
              />
              <Route path="/admin" element={<AdminPage />} />
              {/* Phase 3 routes — reachable by deep link but hidden from the drawer */}
              <Route path="/adviser" element={<AdviserPage />} />
              <Route path="/sec" element={<SecPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </SentryRoutes>
          </Suspense>
        </main>
      </div>

      {/* Detail Modal — only for in-context quick-view from non-stock pages.
          A portfolio card click navigates to /stock/:ticker instead of opening
          the modal, so the modal is suppressed on the stock route. */}
      <AnimatePresence>
        {selectedTicker && !pathname.startsWith("/stock") && (
          <StockDetailModal
            ticker={selectedTicker}
            onClose={handleCloseModal}
            period={period}
            setPeriod={setPeriod}
            onOpenAnalysis={() => {
              // Navigate to the full analysis route via react-router (no longer opens modal).
              navigate(`/stock/${encodeURIComponent(selectedTicker)}`);
              setSelectedTicker(null);
            }}
            livePriceData={liveData[selectedTicker]}
          />
        )}
      </AnimatePresence>
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
  main: {
    display: "flex",
    flexDirection: "column",
    gap: "28px",
    margin: "0 auto",
    maxWidth: "1600px",
    padding: "36px 32px 64px",
    width: "100%",
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
