import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL"];

export default function PortfolioManager({ tickers, onChange }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function add() {
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    if (tickers.includes(ticker)) {
      setError(`${ticker} is already in your portfolio`);
      return;
    }
    if (tickers.length >= 20) {
      setError("Maximum 20 tickers");
      return;
    }
    onChange([...tickers, ticker]);
    setInput("");
    setError("");
  }

  function remove(ticker) {
    onChange(tickers.filter((t) => t !== ticker));
  }

  function handleKey(e) {
    if (e.key === "Enter") add();
    else setError("");
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.inputRow}>
        <div style={styles.inputWrap}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            placeholder="Add ticker…"
            maxLength={10}
            spellCheck={false}
          />
          {error && <span style={styles.error}>{error}</span>}
        </div>
        <button style={styles.addBtn} onClick={add}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Add
        </button>
      </div>

      <div style={styles.chips}>
        <AnimatePresence>
          {tickers.map((ticker) => (
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
    gap: "12px",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-start",
  },
  inputWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: 1,
  },
  input: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    fontWeight: 400,
    letterSpacing: "0.08em",
    outline: "none",
    padding: "10px 14px",
    transition: "border-color 0.2s",
    width: "100%",
  },
  error: {
    color: "var(--accent-red)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    paddingLeft: "4px",
  },
  addBtn: {
    alignItems: "center",
    background: "rgba(0, 229, 160, 0.1)",
    border: "1px solid rgba(0, 229, 160, 0.2)",
    borderRadius: "10px",
    color: "var(--accent-green)",
    cursor: "pointer",
    display: "flex",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: 500,
    gap: "6px",
    padding: "10px 16px",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
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
