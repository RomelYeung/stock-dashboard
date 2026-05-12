import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MAX_PORTFOLIO_TICKERS, MAX_WISHLIST_TICKERS } from "../constants.js";
import TickerAutocomplete from "./TickerAutocomplete";

export default function PortfolioManager({ watchlist, wishlist, onWatchlistChange, onWishlistChange }) {
  const [activeTab, setActiveTab] = useState("watchlist");
  const [error, setError] = useState("");

  function handleSelect(ticker) {
    const list = activeTab === "watchlist" ? watchlist : wishlist;
    const onChange = activeTab === "watchlist" ? onWatchlistChange : onWishlistChange;
    const max = activeTab === "watchlist" ? MAX_PORTFOLIO_TICKERS : MAX_WISHLIST_TICKERS;

    if (list.includes(ticker)) {
      setError(`${ticker} is already in your ${activeTab === "watchlist" ? "watch list" : "wish list"}`);
      return;
    }
    if (list.length >= max) {
      setError(`Maximum ${max} tickers in ${activeTab === "watchlist" ? "watch list" : "wish list"}`);
      return;
    }
    onChange([...list, ticker]);
    setError("");
  }

  function remove(ticker) {
    if (activeTab === "watchlist") {
      onWatchlistChange(watchlist.filter((t) => t !== ticker));
    } else {
      onWishlistChange(wishlist.filter((t) => t !== ticker));
    }
  }

  const currentList = activeTab === "watchlist" ? watchlist : wishlist;

  return (
    <div style={styles.wrapper}>
      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === "watchlist" ? styles.tabActive : {}),
          }}
          onClick={() => {
            setActiveTab("watchlist");
            setError("");
          }}
        >
          Watch List
          {watchlist.length > 0 && (
            <span
              style={{
                ...styles.tabCount,
                ...(activeTab === "watchlist" ? styles.tabCountActive : {}),
              }}
            >
              {watchlist.length}
            </span>
          )}
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === "wishlist" ? styles.tabActive : {}),
          }}
          onClick={() => {
            setActiveTab("wishlist");
            setError("");
          }}
        >
          Wish List
          {wishlist.length > 0 && (
            <span
              style={{
                ...styles.tabCount,
                ...(activeTab === "wishlist" ? styles.tabCountActive : {}),
              }}
            >
              {wishlist.length}
            </span>
          )}
        </button>
      </div>

      <div style={styles.inputWrap}>
        <TickerAutocomplete
          onSelect={handleSelect}
          placeholder={`Add to ${activeTab === "watchlist" ? "watch list" : "wish list"}…`}
        />
        {error && <span style={styles.error}>{error}</span>}
      </div>

      <div style={styles.chips} className="hide-scrollbar">
        <AnimatePresence>
          {currentList.map((ticker) => (
            <motion.div
              key={ticker}
              style={styles.chip}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              whileHover={{ borderColor: "rgba(255,255,255,0.2)" }}
            >
              <span style={styles.chipLabel}>{ticker}</span>
              <button style={styles.chipRemove} onClick={() => remove(ticker)}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  tabs: {
    display: "flex",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "8px",
    overflow: "hidden",
    marginBottom: "0px",
  },
  tab: {
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    padding: "5px 12px",
    transition: "all 0.15s",
    flex: 1,
    textAlign: "center",
    alignItems: "center",
    justifyContent: "center",
    display: "flex",
  },
  tabActive: {
    background: "var(--accent-blue)",
    color: "white",
  },
  tabCount: {
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    marginLeft: "6px",
    padding: "1px 5px",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "4px",
    color: "var(--text-secondary)",
  },
  tabCountActive: {
    background: "rgba(255,255,255,0.2)",
    color: "white",
  },
  inputWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  error: {
    color: "var(--accent-red)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    paddingLeft: "4px",
  },
  chips: {
    display: "flex",
    flexWrap: "nowrap",
    overflowX: "auto",
    gap: "6px",
    scrollbarWidth: "none",
  },
  chip: {
    alignItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    display: "flex",
    gap: "8px",
    padding: "5px 10px",
    transition: "border-color 0.2s",
  },
  chipLabel: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    fontWeight: 500,
    letterSpacing: "0.06em",
  },
  chipRemove: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    padding: 0,
    transition: "color 0.15s",
  },
};
