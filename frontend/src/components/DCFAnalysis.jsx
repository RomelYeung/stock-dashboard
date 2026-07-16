import { useState } from "react";
import MonteCarloChart from "./MonteCarloChart";
import SensitivityMatrix from "./SensitivityMatrix";
import { formatPrice, formatPercent, formatRevenue } from "../utils/formatters";
import { calculateGordonGrowth, calculateRIM } from "../utils/aiValuation";

export default function DCFAnalysis({ ticker, dcfData, aiValuationData, currentPrice, loading, onRefetch }) {
  const [costOfEquityAdj, setCostOfEquityAdj] = useState(0);
  const [growthAdj, setGrowthAdj] = useState(0);

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
        <div style={unavail}>{dcfData?.warning || "Valuation analysis unavailable for this stock."}</div>
      </div>
    );
  }

  const { params, dcf, monteCarlo } = dcfData;

  const wacc = params.wacc + costOfEquityAdj;
  const growth = params.projectionGrowth + growthAdj;
  const terminalGrowth = params.terminalGrowth;
  const shares = params.sharesOutstanding;
  const fcf = params.fcf;

  // Recalculate DCF
  let newFairValue = 0;
  if (wacc > terminalGrowth) {
    let pv = 0;
    let currentFCF = fcf;
    const years = params.projectionYears || 5;
    for (let t = 1; t <= years; t++) {
      let currentGrowthRate = growth;
      if (years > 5 && t > 5) {
        const fadeYears = years - 5;
        const fadeStep = (growth - terminalGrowth) / fadeYears;
        currentGrowthRate = Math.max(terminalGrowth, growth - fadeStep * (t - 5));
      }
      currentFCF *= (1 + currentGrowthRate);
      pv += currentFCF / Math.pow(1 + wacc, t);
    }
    const terminalValue = (currentFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);
    pv += terminalValue / Math.pow(1 + wacc, years);
    newFairValue = pv / shares;
  }

  const shiftRatio = newFairValue > 0 ? newFairValue / dcf.fairValue : 1;
  const shiftedBase = monteCarlo?.base * shiftRatio;
  const shiftedBear = monteCarlo?.bear * shiftRatio;
  const shiftedBull = monteCarlo?.bull * shiftRatio;
  
  const shiftedHistogram = monteCarlo?.histogram?.map(b => ({
    ...b,
    bin: b.bin * shiftRatio
  }));

  const upsidePercent = (currentPrice && currentPrice > 0) ? ((newFairValue - currentPrice) / currentPrice) * 100 : 0;

  // Mock dividend and BV if not in params
  const dividend = params.dividend || (currentPrice * 0.02);
  const ddmValue = calculateGordonGrowth(dividend, wacc, terminalGrowth);
  const rimValue = calculateRIM(currentPrice * 0.4, [currentPrice * 0.05, currentPrice * 0.055, currentPrice * 0.06], wacc, terminalGrowth);

  const quantChecks = aiValuationData?.quant
    ? {
        gex: "N/A",
        stationarity: aiValuationData.quant.stationarityScore != null
          ? `Score: ${aiValuationData.quant.stationarityScore.toFixed(0)}`
          : "N/A",
        svi: aiValuationData.quant.svi
          ? `a=${aiValuationData.quant.svi.a != null ? aiValuationData.quant.svi.a.toFixed(2) : "N/A"}, b=${aiValuationData.quant.svi.b != null ? aiValuationData.quant.svi.b.toFixed(2) : "N/A"}, ρ=${aiValuationData.quant.svi.rho != null ? aiValuationData.quant.svi.rho.toFixed(2) : "N/A"}`
          : "N/A"
      }
    : {
        gex: 2.4, stationarity: "Stationary (ADF p<0.05)", svi: "a=0.04, b=0.12, ρ=-0.4"
      };

  return (
    <div style={containerLayout}>
      <div style={glassCard}>
        <div style={sectionTitle}>Interactive Models</div>
        
        <div style={sliderGrid}>
          <div style={sliderWrap} id="wacc">
            <div style={sliderLabel}>Cost of Equity (WACC): {formatPercent(wacc)}</div>
            <input type="range" min="-0.05" max="0.05" step="0.005" value={costOfEquityAdj} onChange={(e) => setCostOfEquityAdj(parseFloat(e.target.value))} style={slider} />
          </div>
          <div style={sliderWrap} id="growth">
            <div style={sliderLabel}>{params.projectionYears > 5 ? "Base Growth (Y1-5):" : "Growth Rate:"} {formatPercent(growth)}</div>
            <input type="range" min="-0.05" max="0.05" step="0.005" value={growthAdj} onChange={(e) => setGrowthAdj(parseFloat(e.target.value))} style={slider} />
          </div>
        </div>

        <div style={fvBar} id="dcf-value">
          <div style={fvLeft}>
            <span style={fvLabel}>Adjusted Fair Value (DCF)</span>
            <span style={fvPrice}>{newFairValue > 0 ? formatPrice(newFairValue) : "N/A"}</span>
          </div>
          {newFairValue > 0 && (
            <span style={{
              ...upsideBadge,
              color: upsidePercent >= 0 ? "var(--accent-green)" : "var(--accent-red)",
              background: upsidePercent >= 0 ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
            }}>
              {upsidePercent >= 0 ? "▲" : "▼"} {Math.abs(upsidePercent).toFixed(1)}% vs market
            </span>
          )}
        </div>

        <div style={altModelsGrid}>
          <div style={altModel}>
            <span style={altModelLabel}>DDM (Gordon Growth)</span>
            <span style={altModelValue}>{ddmValue ? formatPrice(ddmValue) : "N/A"}</span>
          </div>
          <div style={altModel}>
            <span style={altModelLabel}>Residual Income (RIM)</span>
            <span style={altModelValue}>{rimValue ? formatPrice(rimValue) : "N/A"}</span>
          </div>
        </div>
      </div>

      {shiftedHistogram && (
        <div style={glassCard} id="monte-carlo">
          <div style={{ ...sectionTitle, justifyContent: "space-between", display: "flex" }}>
            ENTRY PRICE ZONES
            <span style={zoneSub}>{monteCarlo.iterations} simulations</span>
          </div>
          <div style={entryGrid}>
            <EntryZone label="Bear (95% conf.)" price={shiftedBear} color="var(--accent-red)" />
            <EntryZone label="Base (50% conf.)" price={shiftedBase} color="var(--accent-amber)" />
            <EntryZone label="Bull (5% conf.)" price={shiftedBull} color="var(--accent-green)" />
          </div>
          <div style={{marginTop: "20px"}}>
            <MonteCarloChart
              histogram={shiftedHistogram}
              bear={shiftedBear}
              base={shiftedBase}
              bull={shiftedBull}
              currentPrice={currentPrice}
            />
          </div>
        </div>
      )}

      <div style={glassCard}>
        <div style={sectionTitle}>RenTech Quant Checks</div>
        <div style={quantGrid}>
          <ParamRow label="Gamma Exposure (GEX)" value={quantChecks.gex} />
          <ParamRow label="Time Series" value={quantChecks.stationarity} />
          <ParamRow label="Vol Surface (SVI)" value={quantChecks.svi} />
        </div>
      </div>

      <SensitivityMatrix
        params={params} currentPrice={currentPrice}
      />
    </div>
  );
}

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
  valueCol: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", textAlign: "right" },
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

const containerLayout = { display: "flex", flexDirection: "column", gap: "24px", minWidth: 0 };

const glassCard = {
  background: "rgba(255, 255, 255, 0.03)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "16px",
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const wrap = { display: "flex", flexDirection: "column", gap: "20px" };
const sectionTitle = {
  color: "var(--text-secondary)", fontFamily: "var(--font-display)",
  fontSize: "12px", fontWeight: 600, letterSpacing: "0.12em",
  textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "12px",
};
const zoneSub = {
  fontFamily: "var(--font-body)", fontSize: "10px", fontWeight: 400,
  color: "var(--text-muted)", textTransform: "none", letterSpacing: "0",
};

const sliderGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" };
const sliderWrap = { display: "flex", flexDirection: "column", gap: "8px" };
const sliderLabel = { color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-mono)" };
const slider = { width: "100%", cursor: "pointer", accentColor: "var(--accent-blue)" };

const fvBar = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "20px 24px", background: "rgba(79,141,255,0.06)",
  border: "1px solid rgba(79,141,255,0.12)", borderRadius: "12px",
};
const fvLeft = { display: "flex", flexDirection: "column", gap: "4px" };
const fvLabel = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)",
  fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em",
};
const fvPrice = {
  color: "var(--accent-blue)", fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 600,
};
const upsideBadge = { fontFamily: "var(--font-mono)", fontSize: "13px", padding: "6px 10px", borderRadius: "8px" };

const altModelsGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" };
const altModel = {
  background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", gap: "6px"
};
const altModelLabel = { color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" };
const altModelValue = { color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600 };

const entryGrid = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" };
const quantGrid = { display: "flex", flexDirection: "column", gap: "4px" };

const skel = {
  height: "120px", background: "rgba(255,255,255,0.03)",
  borderRadius: "10px", animation: "pulse 1.5s ease-in-out infinite",
};
const unavail = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)",
  fontSize: "13px", textAlign: "center", padding: "40px 0",
};
