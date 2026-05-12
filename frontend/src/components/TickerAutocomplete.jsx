import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

const BASE = "/api/stocks";

async function searchTickers(query) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.error) message = json.error;
    } catch {
      // response wasn't JSON
    }
    throw new Error(message);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Search failed");
  return json.data;
}

export default function TickerAutocomplete({ onSelect, placeholder = "Search ticker…", disabled = false }) {
  const [input, setInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Debounce input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(input.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [input]);

  // Reset highlight when debounced query changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [debouncedQuery]);

  const { data: results, isLoading } = useQuery({
    queryKey: ["tickerSearch", debouncedQuery],
    queryFn: () => searchTickers(debouncedQuery),
    enabled: debouncedQuery.length >= 1,
    staleTime: 1000 * 60 * 5,
  });

  const showDropdown = isFocused && debouncedQuery.length >= 1 && (isLoading || (results && results.length >= 0));

  // Click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (ticker) => {
      onSelect(ticker);
      setInput("");
      setIsFocused(false);
      setHighlightIndex(-1);
    },
    [onSelect],
  );

  function handleKeyDown(e) {
    if (!showDropdown || !results || results.length === 0) {
      if (e.key === "Escape") {
        setIsFocused(false);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          handleSelect(results[highlightIndex].symbol);
        }
        break;
      case "Escape":
        setIsFocused(false);
        break;
      case "Tab":
        setIsFocused(false);
        break;
    }
  }

  function handleInputChange(e) {
    setInput(e.target.value.toUpperCase());
  }

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.inputContainer}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={styles.searchIcon}
        >
          <circle
            cx="6"
            cy="6"
            r="4"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M9.5 9.5L12.5 12.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
        <input
          ref={inputRef}
          style={{
            ...styles.input,
            ...(isFocused ? styles.inputFocus : {}),
          }}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          maxLength={10}
          spellCheck={false}
          disabled={disabled}
        />
      </div>

      {showDropdown && (
        <div style={styles.dropdown}>
          {isLoading && (
            <div style={styles.loadingText}>Searching…</div>
          )}
          {!isLoading && results && results.length === 0 && (
            <div style={styles.emptyText}>No results found</div>
          )}
          {!isLoading &&
            results &&
            results.map((item, index) => (
              <div
                key={item.symbol}
                style={{
                  ...styles.resultRow,
                  ...(index === highlightIndex ? styles.resultRowHover : {}),
                }}
                onMouseEnter={() => setHighlightIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item.symbol);
                }}
              >
                <div style={styles.resultLeft}>
                  <span style={styles.resultSymbol}>{item.symbol}</span>
                  <span style={styles.resultName}>{item.name}</span>
                </div>
                {item.exchange && (
                  <span style={styles.resultExchange}>{item.exchange}</span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: "relative",
  },
  inputContainer: {
    position: "relative",
  },
  searchIcon: {
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--text-muted)",
    pointerEvents: "none",
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
    padding: "10px 14px 10px 36px",
    transition: "border-color 0.2s",
    width: "100%",
    boxSizing: "border-box",
  },
  inputFocus: {
    borderColor: "rgba(255,255,255,0.14)",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 100,
    background: "rgba(9, 13, 23, 0.96)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius-md)",
    marginTop: "6px",
    maxHeight: "280px",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  resultRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  resultRowHover: {
    background: "var(--glass-bg-hover)",
  },
  resultLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  resultSymbol: {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    color: "var(--text-primary)",
    fontWeight: 500,
    letterSpacing: "0.06em",
    minWidth: "50px",
  },
  resultName: {
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "200px",
  },
  resultExchange: {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    color: "var(--text-muted)",
  },
  loadingText: {
    padding: "14px",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    color: "var(--text-secondary)",
    textAlign: "center",
  },
  emptyText: {
    padding: "14px",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    color: "var(--text-muted)",
    textAlign: "center",
  },
};
