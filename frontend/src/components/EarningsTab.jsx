import React, { useState, useEffect } from "react";
import { useEarningsData, useEarningsSentiment, useSecGuidance } from "../hooks/useStockData";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend, ComposedChart, Line, Cell } from "recharts";
import PeriodToggle from "./PeriodToggle";

// ─── Responsive hook ───────────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    let timeout;
    const handleResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setWidth(window.innerWidth), 150);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeout);
    };
  }, []);
  return width;
}

// ─── Formatters ────────────────────────────────────────────────────────────
// Parse an ISO date string into a local-timezone Date at midnight (date-only)
function parseDateOnly(isoString) {
  const [y, m, d] = isoString.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}

const formatPercent = (val) => {
  if (val == null) return "N/A";
  return `${(val * 100).toFixed(2)}%`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const tooltipStyle = {
  backgroundColor: "rgba(9,13,23,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  padding: "10px 14px"
};

// ─── Reusable Components ───────────────────────────────────────────────────
function Section({ title, children, fullHeight = false, rightAction = null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: fullHeight ? "100%" : "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "30px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px" }}>
        <h3 style={{ ...styles.sectionTitle, borderBottom: "none", paddingBottom: 0, margin: 0 }}>{title}</h3>
        {rightAction}
      </div>
      <div style={{ ...styles.glassCard, flex: fullHeight ? 1 : "none" }}>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ 
      display: "flex", alignItems: "center", justifyContent: "center", 
      height: "100%", minHeight: "150px", color: "var(--text-muted)", 
      fontSize: "12px", fontFamily: "var(--font-body)",
      background: "rgba(255,255,255,0.01)", borderRadius: "0",
      border: "1px dashed rgba(255,255,255,0.05)"
    }}>
      {message}
    </div>
  );
}

function StatBox({ label, value, sub }) {
  return (
    <div style={styles.statBox}>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value}</span>
      {sub && <span style={styles.statSub}>{sub}</span>}
    </div>
  );
}

// ─── Feature Components ────────────────────────────────────────────────────

function AISentimentCard({ ticker }) {
  const { data: aiSentiment, loading, error } = useEarningsSentiment(ticker);

  if (loading) {
    return (
      <div style={{ ...styles.glassCard, display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "18px", height: "18px", borderRadius: "0", background: "rgba(255,255,255,0.1)", animation: "pulse 1.5s infinite" }} />
          <div style={{ width: "150px", height: "14px", background: "rgba(255,255,255,0.1)", borderRadius: "0", animation: "pulse 1.5s infinite" }} />
        </div>
        <div style={{ width: "100%", height: "40px", background: "rgba(255,255,255,0.05)", borderRadius: "0", animation: "pulse 1.5s infinite" }} />
      </div>
    );
  }

  if (error || !aiSentiment) return null;

  const isBullish = aiSentiment.score === "Bullish";
  const isBearish = aiSentiment.score === "Bearish";
  const scoreColor = isBullish ? "var(--accent-green)" : isBearish ? "var(--accent-red)" : "var(--accent-blue)";
  const bgGradient = isBullish 
    ? "linear-gradient(135deg, rgba(0,229,160,0.1) 0%, rgba(0,229,160,0.02) 100%)"
    : isBearish
      ? "linear-gradient(135deg, rgba(255,77,109,0.1) 0%, rgba(255,77,109,0.02) 100%)"
      : "linear-gradient(135deg, rgba(79,141,255,0.1) 0%, rgba(79,141,255,0.02) 100%)";

  return (
    <div style={{ ...styles.glassCard, backgroundImage: bgGradient, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-blue)" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.05em" }}>
            AI EARNINGS FORENSICS
          </span>
        </div>
        <span style={{
          background: `rgba(${isBullish ? "0,229,160" : isBearish ? "255,77,109" : "79,141,255"}, 0.15)`,
          color: scoreColor,
          padding: "4px 10px",
          borderRadius: "0",
          fontFamily: "var(--font-display)",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em"
        }}>
          {aiSentiment.score}
        </span>
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", lineHeight: 1.6, color: "rgba(255,255,255,0.85)", margin: 0 }}>
        {aiSentiment.summary}
      </p>
      <div style={{ marginTop: "16px", fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Generated: {new Date().toLocaleDateString()} • Sources: Yahoo Finance, Earnings Transcripts
      </div>
    </div>
  );
}

function EpsSurpriseChart({ surprises }) {
  if (!surprises || surprises.length === 0) return <EmptyState message="No EPS surprise data available" />;

  const data = [...surprises].sort((a, b) => new Date(a.date) - new Date(b.date)).map(s => ({
    quarter: s.date ? new Date(s.date).toISOString().split('T')[0] : "Unknown",
    Actual: s.actual,
    Estimate: s.estimate,
    surprisePct: s.surprisePercent,
    isBeat: s.actual >= s.estimate
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={tooltipStyle}>
          <div style={{ color: "var(--text-secondary)", marginBottom: "8px" }}>{label}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "4px" }}>
            <span>Estimate:</span>
            <span>${data.Estimate?.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "8px" }}>
            <span>Actual:</span>
            <span style={{ color: data.isBeat ? "var(--accent-green)" : "var(--accent-red)" }}>${data.Actual?.toFixed(2)}</span>
          </div>
          <div style={{ paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.1)", color: data.isBeat ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 600 }}>
            {data.isBeat ? "BEAT" : "MISS"} by {(data.surprisePct * 100).toFixed(2)}%
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="quarter" stroke="var(--text-tick)" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} />
        <YAxis stroke="var(--text-tick)" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.02)" }} content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "var(--font-body)", paddingTop: "10px" }} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
        <Bar dataKey="Estimate" fill="rgba(255,255,255,0.15)" radius={[4,4,0,0]} barSize={24} />
        <Bar dataKey="Actual" fill="var(--accent-green)" radius={[4,4,0,0]} barSize={24}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.isBeat ? "var(--accent-green)" : "var(--accent-red)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RevenueChart({ incomeData, annualIncome, period = "annual" }) {
  const rawData = incomeData || annualIncome || [];
  if (!rawData || rawData.length === 0) return <EmptyState message="No revenue data available" />;

  const data = [...rawData]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(s => {
      let periodLabel = "Unknown";
      if (s.date) {
        const d = new Date(s.date);
        if (!isNaN(d.getTime())) {
          if (period === "quarterly") {
            const q = Math.floor(d.getUTCMonth() / 3) + 1;
            const yy = String(d.getUTCFullYear()).slice(-2);
            periodLabel = `Q${q} '${yy}`;
          } else {
            periodLabel = d.getUTCFullYear().toString();
          }
        }
      }
      return {
        periodLabel,
        Revenue: s.totalRevenue,
        NetIncome: s.netIncome,
      };
    });

  data.forEach((d, i) => {
    if (i > 0 && data[i-1].Revenue) {
      d.Growth = ((d.Revenue - data[i-1].Revenue) / Math.abs(data[i-1].Revenue)) * 100;
    } else {
      d.Growth = 0;
    }
  });

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data} margin={{ top: 20, right: 0, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="periodLabel" stroke="var(--text-tick)" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" stroke="var(--text-tick)" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1e9).toFixed(0)}B`} />
        <YAxis yAxisId="right" orientation="right" stroke="var(--text-tick)" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
        <Tooltip 
          cursor={{ fill: "rgba(255,255,255,0.02)" }} 
          contentStyle={tooltipStyle}
          formatter={(value, name) => [
            name === "Growth" ? `${value.toFixed(2)}%` : `$${(value/1e9).toFixed(2)}B`, 
            name
          ]}
        />
        <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "var(--font-body)", paddingTop: "10px" }} />
        <Bar yAxisId="left" dataKey="Revenue" fill="var(--accent-blue)" radius={[4,4,0,0]} barSize={30} />
        <Line yAxisId="right" type="monotone" dataKey="Growth" name="Growth %" stroke="var(--accent-green)" strokeWidth={2} dot={{ r: 4, fill: "var(--bg-surface)", stroke: "var(--accent-green)", strokeWidth: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function NextEarningsCard({ dateStr }) {
  if (!dateStr) return <EmptyState message="No upcoming earnings date announced" />;
  
  const date = parseDateOnly(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = date - today;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const isPast = diffDays < 0;
  const isUrgent = !isPast && diffDays <= 7;
  
  return (
    <div style={{ 
      display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%",
      background: isUrgent ? "linear-gradient(135deg, rgba(255, 181, 71, 0.1) 0%, rgba(255, 181, 71, 0.02) 100%)" : "transparent" 
    }}>
      <div>
        <div style={{ color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Expected Report Date</div>
        <div style={{ fontSize: "20px", fontFamily: "var(--font-display)", fontWeight: 600, color: isUrgent ? "var(--accent-amber)" : "var(--text-primary)" }}>
          {date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "32px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>
          {isPast ? "-" : diffDays}
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase" }}>Days Away</div>
      </div>
    </div>
  );
}

function ForwardEstimates({ estimates }) {
  if (!estimates) return <EmptyState message="No forward estimates available" />;
  
  const renderBox = (label, data) => {
    if (!data) return <StatBox label={label} value="N/A" />;
    
    const isObj = typeof data === 'object' && data !== null;
    const avg = isObj ? data.avg : data;
    const low = isObj ? data.low : null;
    const high = isObj ? data.high : null;
    const analysts = isObj ? data.numberOfAnalysts : null;
    const revUp = isObj ? data.revisionUp : null;
    const revDown = isObj ? data.revisionDown : null;
    
    return (
      <div style={styles.statBox}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={styles.statLabel}>{label}</span>
          {analysts && <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "0" }}>{analysts} Analysts</span>}
        </div>
        
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
          <span style={styles.statValue}>{avg != null ? `$${avg.toFixed(2)}` : "N/A"}</span>
          {(revUp > 0 || revDown > 0) && (
            <span style={{ fontSize: "11px", color: revUp > revDown ? "var(--accent-green)" : "var(--accent-red)" }}>
              {revUp > revDown ? "↑" : "↓"} {Math.max(revUp, revDown)} rev
            </span>
          )}
        </div>
        
        {low != null && high != null && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
              <span>${low.toFixed(2)}</span>
              <span>Range</span>
              <span>${high.toFixed(2)}</span>
            </div>
            <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "0", position: "relative" }}>
              <div style={{ 
                position: "absolute", 
                left: `${Math.max(0, Math.min(100, ((avg - low) / (high - low)) * 100))}%`, 
                top: "-2px", 
                width: "8px", 
                height: "8px", 
                background: "var(--accent-blue)", 
                borderRadius: "0",
                transform: "translateX(-50%)"
              }} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {renderBox("Next Quarter EPS", estimates.nextQuarter)}
      {renderBox("Current Year EPS", estimates.currentYear)}
      {renderBox("Next Year EPS", estimates.nextYear)}
    </div>
  );
}

function EarningsHistoryTable({ surprises }) {
  if (!surprises || !surprises.length) return <EmptyState message="No earnings history available" />;
  
  const sorted = [...surprises].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <th style={{ ...styles.th, textAlign: "left" }}>Quarter</th>
            <th style={styles.th}>Estimate</th>
            <th style={styles.th}>Actual</th>
            <th style={styles.th}>Surprise</th>
            <th style={styles.th}>Result</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const isBeat = s.actual >= s.estimate;
            const pct = s.surprisePercent;
            return (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ ...styles.td, textAlign: "left" }}>{formatDate(s.date)}</td>
                <td style={styles.td}>${s.estimate?.toFixed(2) || "N/A"}</td>
                <td style={styles.td}>${s.actual?.toFixed(2) || "N/A"}</td>
                <td style={{ ...styles.td, color: pct > 0 ? "var(--accent-green)" : pct < 0 ? "var(--accent-red)" : "var(--text-primary)" }}>
                  {pct > 0 ? "+" : ""}{(pct * 100).toFixed(2)}%
                </td>
                <td style={styles.td}>
                  <span style={{ 
                    padding: "4px 8px", borderRadius: "0", fontSize: "11px", fontWeight: 600,
                    background: isBeat ? "rgba(0,229,160,0.1)" : "rgba(255,77,109,0.1)",
                    color: isBeat ? "var(--accent-green)" : "var(--accent-red)"
                  }}>
                    {isBeat ? "BEAT" : "MISS"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PeerComparison({ peers, ticker }) {
  if (!peers || !peers.length) return <EmptyState message="No peer data available" />;
  
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <th style={{ ...styles.th, textAlign: "left" }}>Symbol</th>
            <th style={styles.th}>P/E</th>
            <th style={styles.th}>Fwd P/E</th>
            <th style={styles.th}>Rev Growth</th>
            <th style={styles.th}>Profit Margin</th>
          </tr>
        </thead>
        <tbody>
          {peers.map((p, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)", background: p.ticker === ticker ? "rgba(255,255,255,0.02)" : "transparent" }}>
              <td style={{ ...styles.td, textAlign: "left", fontWeight: p.ticker === ticker ? 700 : 400, color: p.ticker === ticker ? "var(--accent-blue)" : "var(--text-primary)" }}>{p.ticker}</td>
              <td style={styles.td}>{p.trailingPE?.toFixed(1) || "N/A"}</td>
              <td style={styles.td}>{p.forwardPE?.toFixed(1) || "N/A"}</td>
              <td style={{ ...styles.td, color: p.revenueGrowth > 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {formatPercent(p.revenueGrowth)}
              </td>
              <td style={styles.td}>{formatPercent(p.profitMargins)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecGuidanceCard({ ticker }) {
  const { data: secData, loading, error } = useSecGuidance(ticker);

  if (loading && !secData) {
    return (
      <div style={{ ...styles.glassCard, display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "18px", height: "18px", borderRadius: "0", background: "rgba(255,255,255,0.1)", animation: "pulse 1.5s infinite" }} />
          <div style={{ width: "120px", height: "14px", background: "rgba(255,255,255,0.1)", borderRadius: "0", animation: "pulse 1.5s infinite" }} />
        </div>
        <div style={{ width: "100%", height: "60px", background: "rgba(255,255,255,0.05)", borderRadius: "0", animation: "pulse 1.5s infinite" }} />
        <div style={{ width: "80%", height: "40px", background: "rgba(255,255,255,0.03)", borderRadius: "0", animation: "pulse 1.5s infinite" }} />
      </div>
    );
  }

  if (error || !secData || !secData.filings || secData.filings.length === 0) return null;

  // Only show filings that have actual guidance content
  const filingsWithContent = secData.filings.filter(
    (f) => f.forwardLooking.length > 0 || f.guidanceSnippets.length > 0
  );

  if (filingsWithContent.length === 0) return null;

  // Collect all guidance figures across filings for a top-level summary
  const allGuidanceSnippets = filingsWithContent.flatMap((f) =>
    f.guidanceSnippets.map((s) => ({ text: s, date: f.filingDate }))
  );

  // Item code to readable short name
  const itemLabels = {
    "2.02": "Results & Financial Condition",
    "7.01": "Reg FD Disclosure",
    "8.01": "Other Events",
    "9.01": "Financials & Exhibits",
  };

  return (
    <div style={{
      ...styles.glassCard,
      backgroundImage: "linear-gradient(135deg, rgba(255,181,71,0.08) 0%, rgba(255,181,71,0.01) 100%)",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: "20px"
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-amber)" }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.05em" }}>
            SEC 8-K FORWARD GUIDANCE
          </span>
        </div>
        <span style={{
          background: "rgba(255,181,71,0.15)",
          color: "var(--accent-amber)",
          padding: "4px 10px",
          borderRadius: "0",
          fontFamily: "var(--font-display)",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em"
        }}>
          {filingsWithContent.length} Filing{filingsWithContent.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Key Financial Figures — shown prominently at top */}
      {allGuidanceSnippets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{
            fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600,
            color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em"
          }}>
            Key Figures
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {allGuidanceSnippets.slice(0, 8).map((item, j) => (
              <div key={j} style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "rgba(0,229,160,0.08)",
                border: "1px solid rgba(0,229,160,0.18)",
                padding: "6px 12px", borderRadius: "0"
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600,
                  color: "var(--accent-green)", letterSpacing: "0.02em"
                }}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filing Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {filingsWithContent.map((filing, i) => {
          const hasQuotes = filing.forwardLooking.length > 0;
          const hasSnippets = filing.guidanceSnippets.length > 0;

          return (
            <div key={i} style={{
              background: "rgba(0,0,0,0.2)",
              borderRadius: "0",
              padding: "16px 18px",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}>
              {/* Filing header: date + items */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "12px",
                    color: "var(--text-primary)", fontWeight: 500
                  }}>
                    {new Date(filing.filingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {filing.isAmendment && (
                    <span style={{
                      background: "rgba(255,181,71,0.1)", color: "var(--accent-amber)",
                      padding: "2px 6px", borderRadius: "0", fontSize: "11px",
                      fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.05em"
                    }}>
                      AMENDED
                    </span>
                  )}
                </div>

                {filing.items.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {filing.items.map((item, j) => (
                      <span key={j} style={{
                        background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: "3px 8px", borderRadius: "0", fontSize: "11px",
                        fontFamily: "var(--font-mono)", fontWeight: 500
                      }}>
                        {itemLabels[item.code] || `Item ${item.code}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Forward-looking statements */}
              {hasQuotes && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {filing.forwardLooking.slice(0, 3).map((quote, j) => (
                    <div key={j} style={{
                      padding: "12px 16px",
                      background: "rgba(255,181,71,0.04)",
                      borderRadius: "0",
                      borderLeft: "3px solid rgba(255,181,71,0.4)",
                      fontFamily: "var(--font-body)",
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.8)",
                      lineHeight: 1.65,
                      fontStyle: "italic",
                    }}>
                      "{quote}"
                    </div>
                  ))}
                </div>
              )}

              {/* Guidance snippets inline (per-filing, only if not already shown at top) */}
              {hasSnippets && !hasQuotes && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {filing.guidanceSnippets.slice(0, 4).map((snippet, j) => (
                    <span key={j} style={{
                      fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500,
                      color: "var(--accent-green)", background: "rgba(0,229,160,0.06)",
                      border: "1px solid rgba(0,229,160,0.15)",
                      padding: "4px 10px", borderRadius: "0"
                    }}>
                      {snippet}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Source: SEC EDGAR • Cached 24h
      </div>
    </div>
  );
}

function AnalystRevisions({ recommendationTrend, upgradesDowngrades }) {
  if ((!recommendationTrend || !recommendationTrend.length) && (!upgradesDowngrades || !upgradesDowngrades.length)) {
    return <EmptyState message="No analyst revision data available" />;
  }

  const current = recommendationTrend?.[0];
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {current && (
        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>Consensus Rating</div>
          <div style={{ display: "flex", height: "8px", borderRadius: "0", overflow: "hidden", gap: "2px", marginBottom: "8px" }}>
            <div style={{ flex: current.strongBuy || 0, background: "var(--accent-green)" }} title={`Strong Buy: ${current.strongBuy}`} />
            <div style={{ flex: current.buy || 0, background: "rgba(0, 229, 160, 0.6)" }} title={`Buy: ${current.buy}`} />
            <div style={{ flex: current.hold || 0, background: "var(--accent-amber)" }} title={`Hold: ${current.hold}`} />
            <div style={{ flex: current.sell || 0, background: "rgba(255, 77, 109, 0.6)" }} title={`Sell: ${current.sell}`} />
            <div style={{ flex: current.strongSell || 0, background: "var(--accent-red)" }} title={`Strong Sell: ${current.strongSell}`} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            <span>Buy</span>
            <span>Hold</span>
            <span>Sell</span>
          </div>
        </div>
      )}

      {upgradesDowngrades && upgradesDowngrades.length > 0 && (
        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>Recent Actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {upgradesDowngrades.slice(0, 4).map((item, i) => {
              const isUp = item.action === "up" || (item.action === "init" && item.toGrade?.includes("Buy"));
              const isDown = item.action === "down";
              const color = isUp ? "var(--accent-green)" : isDown ? "var(--accent-red)" : "var(--text-secondary)";
              const bgMap = { "var(--accent-green)": "var(--accent-green-dim)", "var(--accent-red)": "var(--accent-red-dim)" };
              const bg = bgMap[color] || "rgba(255,255,255,0.05)";
              
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)" }}>{item.firm}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {item.fromGrade ? `${item.fromGrade} → ` : ""}{item.toGrade}
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color, background: bg, padding: "4px 8px", borderRadius: "0" }}>
                    {item.action === "up" ? "UPGRADE" : item.action === "down" ? "DOWNGRADE" : "INITIATED"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BeatMissRatio({ surprises }) {
  if (!surprises || !surprises.length) return <EmptyState message="No data" />;
  
  const beats = surprises.filter(s => s.actual >= s.estimate).length;
  const total = surprises.length;
  const beatPct = (beats / total) * 100;
  
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px" }}>
      <div style={{ position: "relative", width: "100px", height: "100px", borderRadius: "0", background: `conic-gradient(var(--accent-green) ${beatPct}%, rgba(255,255,255,0.05) 0)` }}>
        <div style={{ position: "absolute", inset: "8px", background: "var(--bg-surface)", borderRadius: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{beatPct.toFixed(0)}%</span>
        </div>
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)", textAlign: "center" }}>
        Beat EPS in <strong style={{ color: "var(--text-primary)" }}>{beats}</strong> of last {total} quarters
      </div>
    </div>
  );
}

// ─── Main Export ────────────────────────────────────────────────────────────
export default function EarningsTab({ ticker }) {
  const { data, loading, error, refetch } = useEarningsData(ticker);
  const [periodMode, setPeriodMode] = useState("annual");
  const width = useWindowWidth();
  const isMobile = width < 768;
  const isTablet = width < 1024;

  if (loading && !data) {
    return (
      <div style={styles.skeletonContainer}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: i === 1 ? "150px" : "250px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "0",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={styles.errorContainer}>
        <p>{error}</p>
        <button onClick={refetch} style={styles.retryButton}>Try Again</button>
      </div>
    );
  }

  if (!data) return null;

  const { epsSurprises, estimates, annualIncome, quarterlyIncome, peers, earningsDate, recommendationTrend, upgradesDowngrades } = data;

  const incomeData = periodMode === "quarterly" && quarterlyIncome?.length
    ? quarterlyIncome
    : annualIncome;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* 1. AI Sentiment Card (Hero) */}
      <AISentimentCard ticker={ticker} />

      {/* 2. SEC 8-K Guidance */}
      <SecGuidanceCard ticker={ticker} />

      {/* Dashboard Grid */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(12, 1fr)", 
        gap: "24px",
        alignItems: "stretch"
      }}>
        
        {/* Row 1: Charts */}
        <div style={{ gridColumn: isMobile ? "1 / -1" : isTablet ? "1 / -1" : "span 6" }}>
          <Section title="EPS Surprise History">
            <EpsSurpriseChart surprises={epsSurprises} />
          </Section>
        </div>

        <div style={{ gridColumn: isMobile ? "1 / -1" : isTablet ? "1 / -1" : "span 6" }}>
          <Section
            title={periodMode === "quarterly" ? "Quarterly Revenue & Growth" : "Annual Revenue & Growth"}
            rightAction={<PeriodToggle value={periodMode} onChange={setPeriodMode} size="sm" />}
          >
            <RevenueChart incomeData={incomeData} annualIncome={annualIncome} period={periodMode} />
          </Section>
        </div>

        {/* Row 2: Estimates & Next Earnings */}
        <div style={{ gridColumn: isMobile ? "1 / -1" : isTablet ? "span 1" : "span 4", display: "flex", flexDirection: "column", gap: "24px" }}>
          <Section title="Next Earnings Report">
            <NextEarningsCard dateStr={earningsDate} />
          </Section>
          <Section title="Beat / Miss Track Record" fullHeight>
            <BeatMissRatio surprises={epsSurprises} />
          </Section>
        </div>

        <div style={{ gridColumn: isMobile ? "1 / -1" : isTablet ? "span 1" : "span 4" }}>
          <Section title="Analyst Forward Estimates" fullHeight>
            <ForwardEstimates estimates={estimates} />
          </Section>
        </div>

        <div style={{ gridColumn: isMobile ? "1 / -1" : isTablet ? "1 / -1" : "span 4" }}>
          <Section title="Analyst Revisions & Sentiment" fullHeight>
            <AnalystRevisions recommendationTrend={recommendationTrend} upgradesDowngrades={upgradesDowngrades} />
          </Section>
        </div>

        {/* Row 3: Tables */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Section title="Detailed Earnings History">
            <EarningsHistoryTable surprises={epsSurprises} />
          </Section>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <Section title="Peer Comparison">
            <PeerComparison peers={peers} ticker={ticker} />
          </Section>
        </div>

      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  glassCard: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(16px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "0",
    padding: "24px",
  },
  sectionTitle: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-display)",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "8px",
    margin: 0,
  },
  statBox: {
    background: "rgba(255,255,255,0.035)",
    borderRadius: "0",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statLabel: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: 400,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  statValue: { 
    fontFamily: "var(--font-mono)", 
    fontSize: "15px", 
    fontWeight: 500, 
    color: "var(--text-primary)" 
  },
  statSub: { 
    color: "var(--text-secondary)", 
    fontFamily: "var(--font-body)", 
    fontSize: "11px" 
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "right",
  },
  th: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-display)",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding: "12px 16px",
  },
  td: {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    color: "var(--text-primary)",
    padding: "12px 16px",
  },
  skeletonContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    padding: "20px 0",
  },
  errorContainer: {
    color: "var(--accent-red)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    padding: "40px 0",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  retryButton: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "0",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    padding: "8px 16px",
  }
};
