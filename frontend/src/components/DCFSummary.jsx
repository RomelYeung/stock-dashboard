import { formatPrice } from "../utils/formatters";

function SummaryLine({ label, value, color }) {
  return (
    <div style={summ.line}>
      <span style={{ ...summ.dot, background: color }} />
      <span style={summ.label}>{label}</span>
      <span style={{ ...summ.value, color }}>{value}</span>
    </div>
  );
}

export default function DCFSummary({ dcfData, currentPrice, loading, onOpenAnalysis }) {
  if (loading) {
    return (
      <div style={summ.wrap}>
        <div style={summ.title}>DCF ANALYSIS</div>
        <div style={summ.skel} />
        <div style={summ.skel} />
        <div style={summ.skel} />
      </div>
    );
  }

  const dcf = dcfData?.dcf;
  const mc = dcfData?.monteCarlo;
  const hasData = dcf && dcf.fairValue > 0 && mc;

  return (
    <div style={summ.wrap}>
      <div style={summ.title}>DCF ANALYSIS</div>

      {!hasData ? (
        <div style={summ.unavailable}>
          <span style={summ.warning}>{dcfData?.warning || "Analysis unavailable"}</span>
        </div>
      ) : (
        <>
          <div style={summ.fvSection}>
            <span style={summ.fvLabel}>Fair Value</span>
            <span style={summ.fairValue}>{formatPrice(dcf.fairValue)}</span>
            {dcf.upsidePercent != null && (
              <span style={{
                ...summ.upside,
                color: dcf.upsidePercent >= 0 ? "var(--accent-green)" : "var(--accent-red)",
              }}>
                {dcf.upsidePercent >= 0 ? "▲" : "▼"} {Math.abs(dcf.upsidePercent).toFixed(1)}%
              </span>
            )}
          </div>

          <div style={summ.divider} />

          <div style={summ.entrySection}>
            <span style={summ.sectionLabel}>Entry Zones</span>
            <SummaryLine label="Bear" value={formatPrice(mc.bear)} color="var(--accent-red)" />
            <SummaryLine label="Base" value={formatPrice(mc.base)} color="var(--accent-amber)" />
            <SummaryLine label="Bull" value={formatPrice(mc.bull)} color="var(--accent-green)" />
          </div>
        </>
      )}

      {onOpenAnalysis && (
        <button style={summ.openBtn} onClick={onOpenAnalysis}>
          Open Full Analysis →
        </button>
      )}
    </div>
  );
}

const summ = {
  wrap: {
    display: "flex", flexDirection: "column", gap: "14px",
    padding: "16px", background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px",
  },
  title: {
    color: "var(--text-secondary)", fontFamily: "var(--font-display)",
    fontSize: "10px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase",
  },
  fvSection: { display: "flex", flexDirection: "column", gap: "4px" },
  fvLabel: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "10px", textTransform: "uppercase",
  },
  fairValue: {
    color: "var(--accent-blue)", fontFamily: "var(--font-mono)",
    fontSize: "22px", fontWeight: 500,
  },
  upside: { fontFamily: "var(--font-mono)", fontSize: "11px" },
  divider: { height: "1px", background: "rgba(255,255,255,0.06)" },
  entrySection: { display: "flex", flexDirection: "column", gap: "6px" },
  sectionLabel: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px",
  },
  line: { display: "flex", alignItems: "center", gap: "8px" },
  dot: { width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0 },
  label: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px" },
  value: {
    fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, marginLeft: "auto",
  },
  openBtn: {
    background: "rgba(79,141,255,0.1)", border: "1px solid rgba(79,141,255,0.2)",
    borderRadius: "8px", color: "var(--accent-blue)", cursor: "pointer",
    fontFamily: "var(--font-body)", fontSize: "11px", padding: "8px 12px",
    textAlign: "center", width: "100%", marginTop: "4px",
  },
  unavailable: {
    display: "flex", flexDirection: "column", gap: "8px",
    alignItems: "center", padding: "16px 0",
  },
  warning: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "11px", textAlign: "center", lineHeight: 1.4,
  },
  skel: {
    height: "14px", background: "rgba(255,255,255,0.04)",
    borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite",
  },
};
