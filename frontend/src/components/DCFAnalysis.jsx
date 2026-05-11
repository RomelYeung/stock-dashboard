import MonteCarloChart from "./MonteCarloChart";
import SensitivityMatrix from "./SensitivityMatrix";
import { formatPrice, formatPercent, formatRevenue } from "../utils/formatters";

function ParamRow({ label, value, sub = null }) {
  return (
    <div style={param.row}>
      <span style={param.label}>{label}</span>
      <div style={param.valueCol}>
        <span style={param.value}>{value}</span>
        {sub && <span style={param.sub}>{sub}</span>}
      </div>
    </div>
  );
}

const param = {
  row: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px",
  },
  label: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em",
  },
  valueCol: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" },
  value: {
    color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 500,
  },
  sub: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "10px" },
};

function EntryZone({ label, price, color }) {
  return (
    <div style={entry.wrap}>
      <div style={{ ...entry.dot, background: color }} />
      <div>
        <div style={entry.label}>{label}</div>
        <div style={{ ...entry.price, color }}>{formatPrice(price)}</div>
      </div>
    </div>
  );
}

const entry = {
  wrap: {
    display: "flex", alignItems: "flex-start", gap: "10px",
    padding: "12px 16px", background: "rgba(255,255,255,0.02)",
    borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)",
  },
  dot: { width: "10px", height: "10px", borderRadius: "50%", marginTop: "4px", flexShrink: 0 },
  label: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px",
  },
  price: { fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600 },
};

export default function DCFAnalysis({ dcfData, currentPrice, loading, onRefetch }) {
  if (loading) {
    return (
      <div style={wrap}>
        <div style={skel} />
        <div style={skel} />
      </div>
    );
  }

  if (!dcfData?.dcf) {
    return (
      <div style={wrap}>
        <div style={unavail}>{dcfData?.warning || "DCF analysis unavailable for this stock."}</div>
      </div>
    );
  }

  const { params, dcf, monteCarlo } = dcfData;

  return (
    <div style={wrap}>
      {/* Model Parameters */}
      <div style={section}>
        <div style={sectionTitle}>DCF MODEL</div>
        <div style={paramGrid}>
          <ParamRow label="Free Cash Flow" value={formatRevenue(params.fcf)} />
          <ParamRow label="FCF Growth Rate" value={formatPercent(params.projectionGrowth)} 
            sub={params.historicalFCFGrowth != null && Math.abs(params.historicalFCFGrowth - params.revenueGrowth) > 0.001 ? `(historical: ${formatPercent(params.historicalFCFGrowth)})` : null} />
          <ParamRow label="WACC" value={formatPercent(params.wacc)}
            sub={`Rf ${formatPercent(params.rf)} + β ${params.beta?.toFixed(2)} × ${(params.erp * 100).toFixed(0)}% ERP${params.sizePremium > 0 ? ` + ${formatPercent(params.sizePremium)} size` : ""}`} />
          {params.sector && params.sectorWacc && (
            <ParamRow label="Sector" value={params.sector}
              sub={`Ref WACC ${formatPercent(params.sectorWacc)}`} />
          )}
          <ParamRow label="Terminal Growth" value={formatPercent(params.terminalGrowth)} />
          <ParamRow label="Shares" value={formatRevenue(params.sharesOutstanding)} />
        </div>
      </div>

      {/* Fair Value Bar */}
      <div style={fvBar}>
        <div style={fvLeft}>
          <span style={fvLabel}>Fair Value</span>
          <span style={fvPrice}>{formatPrice(dcf.fairValue)}</span>
        </div>
        {dcf.upsidePercent != null && (
          <span style={{
            ...upsideBadge,
            color: dcf.upsidePercent >= 0 ? "var(--accent-green)" : "var(--accent-red)",
            background: dcf.upsidePercent >= 0 ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
          }}>
            {dcf.upsidePercent >= 0 ? "▲" : "▼"} {Math.abs(dcf.upsidePercent).toFixed(1)}% vs market
          </span>
        )}
      </div>

      {/* Entry Zones */}
      {monteCarlo && (
        <div style={section}>
          <div style={{ ...sectionTitle, justifyContent: "space-between", display: "flex" }}>
            ENTRY PRICE ZONES
            <span style={zoneSub}>{monteCarlo.iterations} simulations</span>
          </div>
          <div style={entryGrid}>
            <EntryZone label="Bear (95% conf.)" price={monteCarlo.bear} color="var(--accent-red)" />
            <EntryZone label="Base (50% conf.)" price={monteCarlo.base} color="var(--accent-amber)" />
            <EntryZone label="Bull (5% conf.)" price={monteCarlo.bull} color="var(--accent-green)" />
          </div>
        </div>
      )}

      {/* Monte Carlo Chart */}
      {monteCarlo && (
        <MonteCarloChart
          histogram={monteCarlo.histogram}
          bear={monteCarlo.bear}
          base={monteCarlo.base}
          bull={monteCarlo.bull}
          currentPrice={currentPrice}
        />
      )}

      {/* Sensitivity Matrix */}
      <SensitivityMatrix
        wacc={params.wacc} fcfGrowth={params.revenueGrowth} currentPrice={currentPrice}
      />

      {/* Re-run Button */}
      {onRefetch && (
        <button style={rerunBtn} onClick={onRefetch}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M12 2.5A6 6 0 1 1 7 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M7 1L9.5 3.5 7 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Re-run Simulation
        </button>
      )}
    </div>
  );
}

const wrap = { display: "flex", flexDirection: "column", gap: "20px" };
const section = { display: "flex", flexDirection: "column", gap: "10px" };
const sectionTitle = {
  color: "var(--text-secondary)", fontFamily: "var(--font-display)",
  fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em",
  textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px",
};
const zoneSub = {
  fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 400,
  color: "var(--text-muted)", textTransform: "none", letterSpacing: "0",
};
const paramGrid = { display: "flex", flexDirection: "column", gap: "4px" };
const fvBar = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "16px 20px", background: "rgba(79,141,255,0.06)",
  border: "1px solid rgba(79,141,255,0.12)", borderRadius: "12px",
};
const fvLeft = { display: "flex", flexDirection: "column", gap: "2px" };
const fvLabel = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)",
  fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em",
};
const fvPrice = {
  color: "var(--accent-blue)", fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600,
};
const upsideBadge = { fontFamily: "var(--font-mono)", fontSize: "12px", padding: "6px 10px", borderRadius: "8px" };
const entryGrid = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" };
const rerunBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer",
  fontFamily: "var(--font-body)", fontSize: "12px", padding: "10px 16px",
};
const skel = {
  height: "120px", background: "rgba(255,255,255,0.03)",
  borderRadius: "10px", animation: "pulse 1.5s ease-in-out infinite",
};
const unavail = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)",
  fontSize: "13px", textAlign: "center", padding: "40px 0",
};
