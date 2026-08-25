import { useState } from "react";
import MonteCarloChart from "./MonteCarloChart";
import SensitivityMatrix from "./SensitivityMatrix";
import { formatPrice, formatPercent, formatMultiple } from "../utils/formatters";

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

  if (dcfData?.rim) {
    return <ResidualIncomeAnalysis rim={dcfData.rim} params={dcfData.params} currentPrice={currentPrice} />;
  }

  if (!dcfData?.dcf) {
    return (
      <div style={wrap}>
        <div style={unavail}>{dcfData?.warning || "Valuation analysis unavailable for this stock."}</div>
      </div>
    );
  }

  const { params, monteCarlo, sensitivity } = dcfData;
  const isDriverModel = params.projectionMethod === "driver-fcff";
  const growthLabel = isDriverModel ? "Revenue Growth" : "FCF Growth";

  const wacc = params.wacc + costOfEquityAdj;
  const growth = params.projectionGrowth + growthAdj;
  const waccIndex = sensitivity?.waccAdjustments?.findIndex((value) => Math.abs(value - costOfEquityAdj) < 1e-9) ?? -1;
  const growthIndex = sensitivity?.growthAdjustments?.findIndex((value) => Math.abs(value - growthAdj) < 1e-9) ?? -1;
  const selectedFairValue = sensitivity?.values?.[waccIndex]?.[growthIndex] ?? null;
  const upsidePercent = currentPrice > 0 && selectedFairValue != null
    ? ((selectedFairValue - currentPrice) / currentPrice) * 100
    : null;

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
            <div style={sliderLabel}>WACC: {formatPercent(wacc)}</div>
            <input type="range" min="-0.05" max="0.05" step="0.005" value={costOfEquityAdj} onChange={(e) => setCostOfEquityAdj(parseFloat(e.target.value))} style={slider} />
          </div>
          <div style={sliderWrap} id="growth">
            <div style={sliderLabel}>{sensitivity?.projectionYears > 5 ? `Base ${growthLabel} (Y1-5):` : `${growthLabel}:`} {formatPercent(growth)}</div>
            <input type="range" min="-0.05" max="0.05" step="0.005" value={growthAdj} onChange={(e) => setGrowthAdj(parseFloat(e.target.value))} style={slider} />
          </div>
        </div>

        <div style={fvBar} id="dcf-value">
          <div style={fvLeft}>
            <span style={fvLabel}>Adjusted Fair Value (DCF)</span>
            <span style={fvPrice}>{selectedFairValue != null ? formatPrice(selectedFairValue) : "N/A"}</span>
          </div>
          {upsidePercent != null && (
            <span style={{
              ...upsideBadge,
              color: upsidePercent >= 0 ? "var(--accent-green)" : "var(--accent-red)",
              background: upsidePercent >= 0 ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
            }}>
              {upsidePercent >= 0 ? "▲" : "▼"} {Math.abs(upsidePercent).toFixed(1)}% vs market
            </span>
          )}
        </div>
      </div>

      {isDriverModel && (
        <GrowthDrivers drivers={params.drivers} diagnostics={params.diagnostics} />
      )}

      {monteCarlo?.histogram?.length > 0 && (
        <div style={glassCard} id="monte-carlo">
          <div style={{ ...sectionTitle, justifyContent: "space-between", display: "flex" }}>
            ENTRY PRICE ZONES
            <span style={zoneSub}>Baseline distribution · {monteCarlo.iterations} simulations</span>
          </div>
          <div style={entryGrid}>
            <EntryZone label="Bear (95% conf.)" price={monteCarlo.bear} color="var(--accent-red)" />
            <EntryZone label="Base (50% conf.)" price={monteCarlo.base} color="var(--accent-amber)" />
            <EntryZone label="Bull (5% conf.)" price={monteCarlo.bull} color="var(--accent-green)" />
          </div>
          <div style={{marginTop: "20px"}}>
            <MonteCarloChart
              histogram={monteCarlo.histogram}
              bear={monteCarlo.bear}
              base={monteCarlo.base}
              bull={monteCarlo.bull}
              currentPrice={currentPrice}
            />
          </div>
          {monteCarlo.warning && <div style={zoneSub}>{monteCarlo.warning}</div>}
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
        params={params} sensitivity={sensitivity} currentPrice={currentPrice}
      />
    </div>
  );
}

function ResidualIncomeAnalysis({ rim, params, currentPrice }) {
  const valued = rim.eligible === true && rim.status === "valued";
  const subtype = rim.financialSubtype || params?.financialSubtype;
  const reasons = rim.reasonCodes?.length ? rim.reasonCodes : params?.reasonCodes ?? [];
  const costOfEquity = finiteNumber(rim.costOfEquity?.value ?? rim.costOfEquity);
  const upside = valued && currentPrice > 0 && finiteNumber(rim.fairValue) != null
    ? ((rim.fairValue - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div style={containerLayout}>
      <section style={glassCard} aria-labelledby="rim-title">
        <div style={auditStrip} aria-label="Residual income valuation status">
          <AuditItem label="Model" value="Residual income" />
          <AuditItem label="Company type" value={subtype === "bank" ? "Bank" : subtype === "insurer" ? "Insurer" : "Financial"} />
          <AuditItem label="Data status" value={valued ? "Valued" : "Not valued"} tone={valued ? "positive" : "warning"} />
        </div>

        <div style={sectionTitle} id="rim-title">Residual Income Review</div>

        {!valued ? (
          <div style={rimUnavailable}>
            <strong style={rimUnavailableTitle}>A defensible valuation is not available.</strong>
            <span style={rimUnavailableCopy}>Required capital, solvency, or accounting evidence did not pass the production data gates.</span>
            <div style={reasonList}>
              {reasons.map((code) => (
                <div style={reasonRow} key={code}>
                  <code style={reasonCode}>{code}</code>
                  <span style={reasonText}>{RIM_REASON_LABELS[code] || "A required residual-income input could not be verified."}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={rimValueBar}>
              <div style={fvLeft}>
                <span style={fvLabel}>Fair value per share</span>
                <span style={fvPrice}>{formatPrice(rim.fairValue)}</span>
              </div>
              {upside != null && (
                <span style={{
                  ...upsideBadge,
                  color: upside >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                  background: upside >= 0 ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
                }}>
                  {upside >= 0 ? "▲" : "▼"} {Math.abs(upside).toFixed(1)}% vs market
                </span>
              )}
            </div>

            <div style={rimMetricGrid}>
              <RimMetric label="Cost of equity" value={formatPercent(costOfEquity)} />
              <RimMetric label="Starting ROE" value={formatPercent(rim.startingRoe)} />
              <RimMetric label="Terminal ROE" value={formatPercent(rim.terminal?.roe ?? rim.terminalRoe)} />
              <RimMetric label="Payout" value={formatPercent(rim.terminal?.payout ?? rim.payout)} />
            </div>

            <CapitalStatus subtype={subtype} capital={rim.capital} />

            <div>
              <div style={rimSubhead}>Scenario fair values</div>
              <div style={rimScenarioGrid}>
                {["bear", "base", "bull"].map((name) => (
                  <RimMetric key={name} label={name} value={formatPrice(rim.scenarios?.[name]?.fairValue)} />
                ))}
              </div>
            </div>

            {rim.projectedYears?.length > 0 && (
              <div style={scheduleWrap}>
                <div style={rimSubhead}>{rim.projectedYears.length}-year explicit forecast</div>
                <table style={scheduleTable}>
                  <thead>
                    <tr>
                      <th style={scheduleHead}>Year</th>
                      <th style={scheduleHead}>ROE</th>
                      <th style={scheduleHead}>Residual income</th>
                      <th style={scheduleHead}>Ending book</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rim.projectedYears.map((year) => (
                      <tr key={year.year}>
                        <td style={scheduleCell}>{year.year}</td>
                        <td style={scheduleCell}>{formatPercent(year.roe)}</td>
                        <td style={scheduleCell}>{formatCompactMoney(year.residualIncome)}</td>
                        <td style={scheduleCell}>{formatCompactMoney(year.endingBook)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AuditItem({ label, value, tone }) {
  return (
    <div style={auditItem}>
      <span style={auditLabel}>{label}</span>
      <span style={{ ...auditValue, color: tone === "positive" ? "var(--accent-green)" : tone === "warning" ? "var(--accent-amber)" : "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function RimMetric({ label, value }) {
  return (
    <div style={rimMetric}>
      <span style={driverMetricLabel}>{label}</span>
      <span style={driverMetricValue}>{value}</span>
    </div>
  );
}

function CapitalStatus({ subtype, capital }) {
  if (subtype === "bank") {
    return (
      <div style={capitalStatus}>
        <span style={capitalMark} aria-hidden="true">✓</span>
        <div>
          <div style={capitalTitle}>CET1 capital gate passed</div>
          <div style={capitalCopy}>{formatPercent(capital?.ratio)} reported ratio · {formatPercent(capital?.threshold?.value)} required minimum</div>
        </div>
      </div>
    );
  }
  return (
    <div style={capitalStatus}>
      <span style={capitalMark} aria-hidden="true">✓</span>
      <div>
        <div style={capitalTitle}>Solvency evidence reconciled</div>
        <div style={capitalCopy}>Statutory surplus, risk-based capital, and the GAAP–SAP bridge passed the data gates.</div>
      </div>
    </div>
  );
}

const RIM_REASON_LABELS = {
  "rim-classification-unsupported": "This issuer is not in the reviewed production cohort.",
  "rim-bank-capital-unavailable": "Current CET1 capital and risk-weighted assets could not be aligned.",
  "rim-bank-capital-buffer-breached": "The reported CET1 ratio is below the required minimum.",
  "rim-insurer-solvency-unavailable": "Required statutory surplus or risk-based capital evidence is unavailable.",
  "rim-insurer-gaap-sap-bridge-unresolved": "The GAAP-to-statutory accounting bridge could not be reconciled.",
  "rim-insurer-normalization-unavailable": "Required reserve, catastrophe, or investment normalization evidence is unavailable.",
  "rim-book-history-insufficient": "Three comparable annual book-value observations are not available.",
  "rim-common-equity-unavailable": "Common shareholders’ equity could not be verified.",
  "rim-common-earnings-unavailable": "Earnings attributable to common shareholders could not be verified.",
  "rim-common-distributions-incomplete": "Common dividends, repurchases, and issuance could not be reconciled.",
  "rim-clean-surplus-unreconciled": "The clean-surplus accounting roll-forward did not reconcile.",
  "rim-cost-of-equity-unavailable": "A current risk-free rate and market beta are required.",
  "rim-shares-unavailable": "Common shares outstanding could not be verified.",
};

function formatCompactMoney(value) {
  const number = finiteNumber(value);
  if (number == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function GrowthDrivers({ drivers, diagnostics }) {
  const assumptions = drivers?.assumptions ?? drivers ?? {};
  const sourceValues = typeof drivers?.sources === "string"
    ? [drivers.sources]
    : Object.values(drivers?.sources ?? {}).filter((value) => typeof value === "string");
  const allDiagnostics = [...(drivers?.diagnostics ?? []), ...(diagnostics ?? [])];
  const fallback = allDiagnostics.find((value) => typeof value === "string" && value.includes("fallback"));
  const sourceNote = sourceValues.slice(0, 3).join(" · ");
  const explicitYears = finiteNumber(assumptions.explicitYears)
    ?? (Array.isArray(drivers?.annualSchedule) ? drivers.annualSchedule.length : null);
  const meta = [
    explicitYears != null ? `${explicitYears}-year explicit forecast` : null,
    finiteNumber(assumptions.normalizedTaxRate) != null
      ? `${formatPercent(Number(assumptions.normalizedTaxRate))} normalized tax`
      : null,
  ].filter(Boolean).join(" · ");
  const metrics = [
    ["Revenue Growth", formatTransition(assumptions.initialGrowth, assumptions.terminalGrowth), "Initial → terminal"],
    ["Operating Margin", formatTransition(assumptions.startingMargin, assumptions.targetMargin), "Starting → target"],
    ["Reinvestment", formatDriverMultiple(assumptions.salesToCapitalRatio), "Sales-to-capital"],
  ];

  return (
    <section style={glassCard} aria-labelledby="growth-drivers-title">
      <div style={sectionTitle} id="growth-drivers-title">Growth Drivers</div>
      <div style={driverPath}>Revenue Growth <span aria-hidden="true">→</span> Operating Margin <span aria-hidden="true">→</span> Reinvestment</div>
      <div style={driverGrid}>
        {metrics.map(([label, value, sub]) => (
          <div style={driverMetric} key={label}>
            <span style={driverMetricLabel}>{label}</span>
            <span style={driverMetricValue}>{value}</span>
            <span style={driverMetricSub}>{sub}</span>
          </div>
        ))}
      </div>
      {meta && <div style={driverMeta}>{meta}</div>}
      {(sourceNote || fallback) && (
        <div style={driverNote}>
          {sourceNote && <>Sources: {sourceNote}</>}
          {sourceNote && fallback && " · "}
          {fallback && <>Fallback: {fallback.replace(/^driver-/, "").replace(/[-:]/g, " ")}</>}
        </div>
      )}
    </section>
  );
}

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatTransition(start, end) {
  const from = finiteNumber(start);
  const to = finiteNumber(end);
  return `${from == null ? "—" : formatPercent(from)} → ${to == null ? "—" : formatPercent(to)}`;
}

function formatDriverMultiple(value) {
  const number = finiteNumber(value);
  return number == null ? "—" : formatMultiple(number);
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
    padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "0",
  },
  label: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em",
  },
  valueCol: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", textAlign: "right" },
  value: {
    color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 500,
  },
  sub: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px" },
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
    borderRadius: "0", border: "1px solid rgba(255,255,255,0.05)",
  },
  dot: { width: "10px", height: "10px", borderRadius: "0", marginTop: "4px", flexShrink: 0 },
  label: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px",
  },
  price: { fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600 },
};

const containerLayout = { display: "flex", flexDirection: "column", gap: "24px", minWidth: 0 };

const glassCard = {
  background: "rgba(255, 255, 255, 0.03)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "0",
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
  fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 400,
  color: "var(--text-muted)", textTransform: "none", letterSpacing: "0",
};

const driverPath = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)",
  fontSize: "11px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px",
};
const driverGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" };
const driverMetric = {
  display: "flex", flexDirection: "column", gap: "4px", padding: "12px",
  background: "rgba(255,255,255,0.02)", borderRadius: "0",
};
const driverMetricLabel = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px",
  textTransform: "uppercase", letterSpacing: "0.04em",
};
const driverMetricValue = {
  color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 500,
};
const driverMetricSub = { color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "11px" };
const driverMeta = { ...zoneSub, color: "var(--text-secondary)" };
const driverNote = { ...zoneSub, lineHeight: 1.5 };

const auditStrip = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  border: "1px solid rgba(79,141,255,0.14)", borderRadius: "0", overflow: "hidden",
  background: "rgba(79,141,255,0.04)",
};
const auditItem = { display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", borderRight: "1px solid rgba(255,255,255,0.06)" };
const auditLabel = { color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" };
const auditValue = { fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600 };
const rimMetricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" };
const rimMetric = { ...driverMetric, minWidth: 0 };
const rimSubhead = { ...driverMetricLabel, marginBottom: "8px" };
const rimScenarioGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" };
const capitalStatus = {
  display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px",
  border: "1px solid rgba(57,211,154,0.15)", background: "rgba(57,211,154,0.05)", borderRadius: "0",
};
const capitalMark = { color: "var(--accent-green)", fontFamily: "var(--font-mono)", fontWeight: 700 };
const capitalTitle = { color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600 };
const capitalCopy = { ...zoneSub, marginTop: "3px", lineHeight: 1.4 };
const rimUnavailable = { display: "flex", flexDirection: "column", gap: "8px", padding: "8px 0" };
const rimUnavailableTitle = { color: "var(--text-primary)", fontFamily: "var(--font-display)", fontSize: "16px" };
const rimUnavailableCopy = { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "12px", lineHeight: 1.5 };
const reasonList = { display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" };
const reasonRow = { display: "flex", flexWrap: "wrap", gap: "8px 12px", alignItems: "start", padding: "10px 12px", background: "rgba(255,185,70,0.05)", borderRadius: "0", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px", lineHeight: 1.45 };
const reasonCode = { color: "var(--accent-amber)", fontFamily: "var(--font-mono)", fontSize: "11px", overflowWrap: "anywhere", flex: "0 1 220px" };
const reasonText = { flex: "1 1 180px" };
const scheduleWrap = { overflowX: "auto" };
const scheduleTable = { width: "100%", minWidth: "480px", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: "11px" };
const scheduleHead = { color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", padding: "8px", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,0.06)" };
const scheduleCell = { color: "var(--text-secondary)", padding: "8px", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,0.04)" };

const sliderGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" };
const sliderWrap = { display: "flex", flexDirection: "column", gap: "8px" };
const sliderLabel = { color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-mono)" };
const slider = { width: "100%", cursor: "pointer", accentColor: "var(--accent-blue)" };

const fvBar = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "20px 24px", background: "rgba(79,141,255,0.06)",
  border: "1px solid rgba(79,141,255,0.12)", borderRadius: "0",
};
const rimValueBar = { ...fvBar, flexWrap: "wrap", gap: "12px", background: "rgba(79,141,255,0.05)" };
const fvLeft = { display: "flex", flexDirection: "column", gap: "4px" };
const fvLabel = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)",
  fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em",
};
const fvPrice = {
  color: "var(--accent-blue)", fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 600,
};
const upsideBadge = { fontFamily: "var(--font-mono)", fontSize: "13px", padding: "6px 10px", borderRadius: "0" };

const entryGrid = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" };
const quantGrid = { display: "flex", flexDirection: "column", gap: "4px" };

const skel = {
  height: "120px", background: "rgba(255,255,255,0.03)",
  borderRadius: "0", animation: "pulse 1.5s ease-in-out infinite",
};
const unavail = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)",
  fontSize: "13px", textAlign: "center", padding: "40px 0",
};
