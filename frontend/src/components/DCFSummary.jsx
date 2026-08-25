import { formatPrice } from "../utils/formatters";

export default function DCFSummary({ dcfData, currentPrice, loading }) {
  if (loading) {
    return (
      <div style={summ.wrap}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={summ.skel} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={summ.skel} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={summ.skel} />
        </div>
      </div>
    );
  }

  const dcf = dcfData?.dcf;
  const mc = dcfData?.monteCarlo;
  const hasData = dcf && dcf.fairValue > 0 && mc;

  if (!hasData) {
    return (
      <div style={{ ...summ.wrap, justifyContent: "center", padding: "28px" }}>
        <div style={summ.unavailable}>
          <span style={summ.warning}>{dcfData?.warning || "Analysis unavailable for this asset"}</span>
        </div>
      </div>
    );
  }

  const hasUpside = dcf.upsidePercent >= 0;
  const statusText = hasUpside ? "UNDERVALUED" : "OVERVALUED";

  return (
    <div style={summ.wrap}>
      {/* Col 1: Valuation Grade & Margin of Safety */}
      <div style={summ.col1}>
        <div style={summ.label}>Valuation Status</div>
        <div style={{
          ...summ.statusText,
          color: hasUpside ? "var(--accent-green)" : "var(--accent-red)",
        }}>
          {statusText}
        </div>
        <div style={summ.safetyMargin}>
          {hasUpside ? "Margin of Safety: " : "Premium: "}
          <span style={{ fontWeight: 600, color: hasUpside ? "var(--accent-green)" : "var(--accent-red)" }}>
            {Math.abs(dcf.upsidePercent).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Vertical separator */}
      <div style={summ.vDivider} />

      {/* Col 2: Price vs Intrinsic Fair Value */}
      <div style={summ.col2}>
        <div style={summ.metricsRow}>
          <div>
            <div style={summ.label}>Current Price</div>
            <div style={summ.priceVal}>{formatPrice(currentPrice)}</div>
          </div>
          <div style={summ.arrowCol}>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" style={{ opacity: 0.3 }}>
              <path d="M10 1L15 6M15 6L10 11M15 6H1" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={summ.label}>DCF Fair Value</div>
            <div style={summ.priceValPrimary}>{formatPrice(dcf.fairValue)}</div>
          </div>
        </div>
      </div>

      {/* Vertical separator */}
      <div style={summ.vDivider} />

      {/* Col 3: Monte Carlo Entry Zones */}
      <div style={summ.col3}>
        <div style={summ.label}>Monte Carlo Entry Zones</div>
        <div style={summ.zonesRow}>
          <div style={summ.zoneCell}>
            <span style={summ.zoneName}>Bear</span>
            <span style={{ ...summ.zoneVal, color: "var(--accent-red)" }}>{formatPrice(mc.bear)}</span>
          </div>
          <div style={summ.zoneCell}>
            <span style={summ.zoneName}>Base</span>
            <span style={{ ...summ.zoneVal, color: "var(--accent-amber)" }}>{formatPrice(mc.base)}</span>
          </div>
          <div style={summ.zoneCell}>
            <span style={summ.zoneName}>Bull</span>
            <span style={{ ...summ.zoneVal, color: "var(--accent-green)" }}>{formatPrice(mc.bull)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const summ = {
  wrap: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    padding: "20px 24px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "0",
    width: "100%",
  },
  col1: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: 1,
    minWidth: "160px",
  },
  label: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  statusText: {
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  safetyMargin: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
  },
  vDivider: {
    width: "1px",
    height: "40px",
    background: "rgba(255,255,255,0.06)",
  },
  col2: {
    display: "flex",
    flexDirection: "column",
    flex: 1.2,
  },
  metricsRow: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
  },
  arrowCol: {
    display: "flex",
    alignItems: "center",
    marginTop: "14px",
  },
  priceVal: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "18px",
    fontWeight: 500,
    marginTop: "4px",
  },
  priceValPrimary: {
    color: "var(--accent-blue)",
    fontFamily: "var(--font-mono)",
    fontSize: "20px",
    fontWeight: 600,
    marginTop: "4px",
  },
  col3: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    flex: 1.2,
  },
  zonesRow: {
    display: "flex",
    gap: "16px",
    marginTop: "4px",
  },
  zoneCell: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    flex: 1,
  },
  zoneName: {
    color: "var(--text-secondary)",
    fontSize: "11px",
    fontFamily: "var(--font-body)",
  },
  zoneVal: {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    fontWeight: 600,
  },
  unavailable: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  warning: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    textAlign: "center",
  },
  skel: {
    height: "20px",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "0",
    animation: "pulse 1.5s ease-in-out infinite",
  },
};
