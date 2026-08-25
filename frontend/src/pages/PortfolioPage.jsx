import ListSectionHeader from "../components/ListSectionHeader";
import StockCard from "../components/StockCard";
import ErrorBoundary from "../components/ErrorBoundary";
import { MAX_PORTFOLIO_TICKERS, MAX_WISHLIST_TICKERS } from "../constants";

export default function PortfolioPage({
  tickers,
  wishlistTickers,
  mergedData,
  errors,
  loading,
  data,
  liveData,
  addToWatchlist,
  removeFromWatchlist,
  addToWishlist,
  removeFromWishlist,
  onSelectTicker,
  period,
  setPeriod,
}) {
  return (
    <ErrorBoundary>
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
                onClick={onSelectTicker}
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
                onClick={onSelectTicker}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

const styles = {
  grid: {
    display: "grid",
    gap: "16px",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  },
  sectionDivider: {
    height: "1px",
    background: "var(--glass-border)",
    margin: "16px 0",
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
};
