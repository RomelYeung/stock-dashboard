import React, { useMemo, memo } from "react";
import { useQueries } from "@tanstack/react-query";

function GuruHeatmap({ gurus, currentGuruId, onSelectGuru }) {
  // Fetch holdings for all gurus in parallel
  const holdingsQueries = useQueries({
    queries: (gurus || []).map((g) => ({
      queryKey: ["guruHoldings", g.id],
      queryFn: async () => {
        const res = await fetch(`/api/gurus/${g.id}/holdings`);
        if (!res.ok) throw new Error(`Failed to fetch holdings for ${g.name}`);
        const json = await res.json();
        return {
          id: g.id,
          name: g.name,
          holdings: json.data || [],
        };
      },
      staleTime: 1000 * 60 * 5, // 5 minutes cache
    })),
  });

  const isLoading = holdingsQueries.some((q) => q.isLoading);
  const isError = holdingsQueries.some((q) => q.isError);

  // Map each guru's ID to their holdings array
  const holdingsMap = useMemo(() => {
    const map = {};
    holdingsQueries.forEach((q) => {
      if (q.data) {
        map[q.data.id] = q.data.holdings;
      }
    });
    return map;
  }, [holdingsQueries]);

  // Pre-calculate overlap matrix
  const overlapMatrix = useMemo(() => {
    if (!gurus || gurus.length === 0) return {};
    const matrix = {};

    for (let i = 0; i < gurus.length; i++) {
      const gRow = gurus[i];
      matrix[gRow.id] = {};
      const listA = holdingsMap[gRow.id] || [];

      const mapA = new Map();
      listA.forEach((h) => {
        const weight = h.portfolioWeight !== undefined ? h.portfolioWeight : (h.weight || 0);
        mapA.set(h.ticker.toUpperCase(), weight);
      });

      for (let j = 0; j < gurus.length; j++) {
        const gCol = gurus[j];
        if (gRow.id === gCol.id) {
          matrix[gRow.id][gCol.id] = 1.0;
          continue;
        }

        const listB = holdingsMap[gCol.id] || [];
        if (listA.length === 0 || listB.length === 0) {
          matrix[gRow.id][gCol.id] = 0;
          continue;
        }

        let overlapSum = 0;
        listB.forEach((h) => {
          const ticker = h.ticker.toUpperCase();
          if (mapA.has(ticker)) {
            const weightA = mapA.get(ticker);
            const weightB = h.portfolioWeight !== undefined ? h.portfolioWeight : (h.weight || 0);
            overlapSum += Math.min(weightA, weightB);
          }
        });

        matrix[gRow.id][gCol.id] = overlapSum;
      }
    }

    return matrix;
  }, [gurus, holdingsMap]);

  if (!gurus || gurus.length === 0) {
    return <div style={styles.placeholder}>No investors available to compare.</div>;
  }

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <span style={styles.loadingText}>Computing portfolio overlap matrix...</span>
      </div>
    );
  }

  if (isError) {
    return <div style={styles.errorText}>Error loading comparison data.</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>OVERLAP MATRIX</div>
      <div style={styles.subtitle}>
        Portfolio overlap scores (sum of min weights) between investors. Click any cell/label to view profile.
      </div>
      <div style={styles.scrollWrapper}>
        <div
          style={{
            ...styles.grid,
            gridTemplateColumns: `minmax(120px, 1.5fr) repeat(${gurus.length}, 1fr)`,
          }}
        >
          {/* Header row corner cell */}
          <div style={{ ...styles.cell, ...styles.cornerCell }}>Investor</div>

          {/* Header row gurus */}
          {gurus.map((g) => {
            const isCurrent = g.id === currentGuruId;
            return (
              <div
                key={`h-${g.id}`}
                style={{
                  ...styles.cell,
                  ...styles.headerCell,
                  color: isCurrent ? "var(--accent-blue)" : "var(--text-secondary)",
                  fontWeight: isCurrent ? 700 : 500,
                  cursor: "pointer",
                }}
                onClick={() => onSelectGuru?.(g.id)}
                title={g.name}
              >
                <div style={styles.rotatedText}>{g.name.split(" ")[0]}</div>
              </div>
            );
          })}

          {/* Data rows */}
          {gurus.map((gRow) => {
            const isRowCurrent = gRow.id === currentGuruId;
            return (
              <React.Fragment key={`row-${gRow.id}`}>
                {/* Row header */}
                <div
                  style={{
                    ...styles.cell,
                    ...styles.rowHeaderCell,
                    color: isRowCurrent ? "var(--accent-blue)" : "var(--text-primary)",
                    fontWeight: isRowCurrent ? 700 : 500,
                    cursor: "pointer",
                  }}
                  onClick={() => onSelectGuru?.(gRow.id)}
                  title={`${gRow.name} (${gRow.fundName})`}
                >
                  {gRow.name}
                </div>

                {/* Overlap cells */}
                {gurus.map((gCol) => {
                  const isColCurrent = gCol.id === currentGuruId;
                  const score = overlapMatrix[gRow.id]?.[gCol.id] ?? 0;
                  const pct = (score * 100).toFixed(1);

                  // Color cells based on overlap score
                  let bg = "rgba(255,255,255,0.02)";
                  if (gRow.id === gCol.id) {
                    bg = "rgba(255,255,255,0.1)";
                  } else if (score > 0) {
                    // Green gradient for overlaps
                    bg = `rgba(0, 229, 160, ${Math.min(0.05 + score * 0.8, 0.75)})`;
                  }

                  const tooltip = [
                    `From: ${gRow.name}`,
                    `To: ${gCol.name}`,
                    `Overlap: ${pct}%`,
                  ].join("\n");

                  const isSelectedCell = isRowCurrent || isColCurrent;

                  return (
                    <div
                      key={`cell-${gRow.id}-${gCol.id}`}
                      style={{
                        ...styles.cell,
                        background: bg,
                        border: isSelectedCell ? "1px solid rgba(0, 150, 255, 0.3)" : "1px solid rgba(255,255,255,0.02)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        cursor: "pointer",
                        fontWeight: gRow.id === gCol.id ? "bold" : "normal",
                      }}
                      title={tooltip}
                      onClick={() => onSelectGuru?.(gCol.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "scale(1.05)";
                        e.currentTarget.style.zIndex = "2";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.zIndex = "auto";
                      }}
                    >
                      {pct}%
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(GuruHeatmap);


const styles = {
  container: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "0",
    padding: "20px",
    marginTop: "20px",
  },
  title: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  subtitle: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    marginTop: "4px",
    marginBottom: "16px",
  },
  scrollWrapper: {
    overflowX: "auto",
  },
  grid: {
    display: "grid",
    gap: "2px",
    minWidth: "600px",
  },
  cell: {
    padding: "8px 4px",
    textAlign: "center",
    fontSize: "11px",
    borderRadius: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.1s ease, z-index 0.1s",
    minHeight: "36px",
  },
  cornerCell: {
    color: "var(--text-muted)",
    fontWeight: 500,
    textTransform: "uppercase",
    fontSize: "11px",
    justifyContent: "flex-start",
    paddingLeft: "8px",
  },
  headerCell: {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rotatedText: {
    whiteSpace: "nowrap",
  },
  rowHeaderCell: {
    textAlign: "left",
    justifyContent: "flex-start",
    fontWeight: 500,
    paddingLeft: "8px",
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "0",
    marginTop: "20px",
  },
  spinner: {
    width: "24px",
    height: "24px",
    border: "2px solid rgba(255,255,255,0.1)",
    borderTopColor: "var(--accent-blue)",
    borderRadius: "0",
    animation: "spin 1s linear infinite",
    marginBottom: "12px",
  },
  loadingText: {
    fontSize: "12px",
    color: "var(--text-secondary)",
  },
  errorText: {
    padding: "20px",
    color: "var(--accent-red)",
    textAlign: "center",
    fontSize: "12px",
  },
  placeholder: {
    padding: "20px",
    color: "var(--text-muted)",
    textAlign: "center",
    fontSize: "12px",
  },
};
