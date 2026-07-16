import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TickerAutocomplete from "./TickerAutocomplete";

export default function ListSectionHeader({
  title,
  count,
  errorCount,
  list,
  onAdd,
  onRemove,
  maxItems,
  placeholder,
  listType // 'watchlist' or 'wishlist'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSelect(ticker) {
    if (list.includes(ticker)) {
      setError(`${ticker} is already in your ${listType === "watchlist" ? "watch list" : "wish list"}`);
      return;
    }
    if (list.length >= maxItems) {
      setError(`Maximum ${maxItems} tickers in ${listType === "watchlist" ? "watch list" : "wish list"}`);
      return;
    }

    setAdding(true);
    setError("");
    try {
      await onAdd(ticker);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(ticker) {
    try {
      await onRemove(ticker);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={styles.sectionSticky}>
      <div style={styles.headerRow} onClick={() => setIsOpen(!isOpen)}>
        <div style={styles.titleGroup}>
          <div className="section-label" style={{ marginBottom: 0 }}>{title}</div>
          <div style={styles.statsBar}>
            <span style={styles.statsText}>
              {count} stock{count !== 1 ? "s" : ""} {listType === "watchlist" ? "tracked" : "wishlisted"}
            </span>
            {errorCount > 0 && (
              <span style={styles.errorBadge}>
                {errorCount} failed to load
              </span>
            )}
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 12 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={styles.inputWrap}>
              <TickerAutocomplete
                onSelect={handleSelect}
                placeholder={placeholder}
              />
              {error && <span style={styles.error}>{error}</span>}
            </div>

            {list.length > 0 && (
              <div style={styles.chips} className="hide-scrollbar">
                <AnimatePresence>
                  {list.map((ticker) => (
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
                      <button style={styles.chipRemove} onClick={(e) => {
                        e.stopPropagation();
                        remove(ticker);
                      }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const styles = {
  sectionSticky: {
    position: "sticky",
    top: "65px",
    zIndex: 40,
    background: "linear-gradient(to bottom, var(--bg-base) 85%, transparent)",
    padding: "16px 0 24px 0",
    marginBottom: "8px",
    display: "flex",
    flexDirection: "column",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    paddingRight: "16px",
  },
  titleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
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
    border: "1px solid var(--accent-red)",
    borderRadius: "0",
    color: "var(--accent-red)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    padding: "3px 8px",
    textTransform: "uppercase",
  },
  inputWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: "12px",
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
    paddingBottom: "4px",
  },
  chip: {
    alignItems: "center",
    background: "rgba(0,240,255,0.05)",
    border: "1px solid var(--accent-blue)",
    borderRadius: "0",
    display: "flex",
    gap: "8px",
    padding: "5px 10px",
    transition: "all 0.2s",
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