export default function SensitivityMatrix({ wacc, fcfGrowth, currentPrice }) {
  const waccValues = [0.07, 0.08, 0.09, 0.10, 0.11];
  const growthValues = [0.05, 0.06, 0.07, 0.08, 0.09];

  return (
    <div style={sxStyles.wrap}>
      <div style={sxStyles.title}>SENSITIVITY MATRIX</div>
      <div style={sxStyles.subtitle}>WACC vs FCF Growth Rate</div>
      <div style={sxStyles.grid}>
        <div style={sxStyles.cell}></div>
        {growthValues.map((g) => (
          <div key={`h-${g}`} style={{ ...sxStyles.cell, ...sxStyles.headerCell }}>
            {(g * 100).toFixed(0)}%
          </div>
        ))}
        {waccValues.map((w) => (
          <div key={`row-${w}`} style={{ display: "contents" }}>
            <div style={{ ...sxStyles.cell, ...sxStyles.headerCell }}>{(w * 100).toFixed(0)}%</div>
            {growthValues.map((g) => {
              const color = getHeatColor(w, g);
              return (
                <div key={`${w}-${g}`} style={{ ...sxStyles.cell, background: color }}>
                  —
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function getHeatColor(wacc, growth) {
  const score = (0.12 - wacc) * 10 + (growth - 0.04) * 10;
  const t = Math.max(0, Math.min(1, score * 0.25 + 0.5));
  if (t > 0.6) return `rgba(0,229,160,${(t - 0.5) * 0.3})`;
  if (t < 0.4) return `rgba(255,77,109,${(0.5 - t) * 0.3})`;
  return "rgba(255,255,255,0.03)";
}

const sxStyles = {
  wrap: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "14px", padding: "20px",
  },
  title: {
    color: "var(--text-primary)", fontFamily: "var(--font-display)",
    fontSize: "13px", fontWeight: 600, letterSpacing: "0.02em", textTransform: "uppercase",
  },
  subtitle: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "11px", marginTop: "4px", marginBottom: "12px",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "1px" },
  cell: {
    padding: "10px 8px", textAlign: "center", fontSize: "10px",
    fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderRadius: "4px",
  },
  headerCell: { color: "var(--text-secondary)", fontWeight: 600, fontSize: "10px" },
};
