import React, { useMemo, useState } from "react";
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { useOptionsScanner } from "../hooks/useStockData";
import { formatPrice } from "../utils/formatters";

const Plot = createPlotlyComponent(Plotly);

export default function OptionsScannerTab({ ticker }) {
  const { data, loading, error } = useOptionsScanner(ticker);
  const [selectedDte, setSelectedDte] = useState("all");
  const [selectedContract, setSelectedContract] = useState(null);
  const [flashChain, setFlashChain] = useState(false);

  const {
    underlyingPrice,
    context,
    expirations,
    bestOpportunities,
    gexProfile,
    scatterData,
    surfaceData,
  } = useMemo(() => {
    if (!data) return {};

    const bestOpp = [];
    const gexMap = {};
    const scatterX = [];
    const scatterY = [];
    const scatterZ = [];
    const scatterColor = [];
    const scatterText = [];
    const scatterCustomData = [];
    const surfaceX = [];
    const surfaceY = [];
    const surfaceZ = [];

    data.expirations.forEach((exp) => {
      exp.options.forEach((opt) => {
        // GEX Profile (DTE <= 30)
        if (exp.dte <= 30) {
          if (!gexMap[opt.strike]) gexMap[opt.strike] = { strike: opt.strike, callGex: 0, putGex: 0 };
          const gex = opt.gamma * opt.openInterest * 100 * data.underlyingPrice;
          if (opt.type.toLowerCase() === "call") {
            gexMap[opt.strike].callGex += gex;
          } else {
            gexMap[opt.strike].putGex -= gex;
          }
        }

        // Best opportunities — quality-filtered for tradeability
        if (
          opt.adjustedEdge &&
          Math.abs(opt.adjustedEdge) > 0.005 &&
          exp.dte >= 1 &&
          // Liquidity: must have volume or meaningful open interest
          (opt.volume > 0 || opt.openInterest >= 10) &&
          // Moneyness: strike within 15% of underlying price
          data.underlyingPrice > 0 &&
          Math.abs(opt.strike - data.underlyingPrice) / data.underlyingPrice <= 0.15
        ) {
          bestOpp.push({ ...opt, expirationStr: exp.date, dte: exp.dte });
        }

        // Chart data
        if (opt.iv != null && opt.strike > 0) {
          scatterX.push(opt.strike);
          scatterY.push(exp.dte);
          scatterZ.push(opt.iv);
          
          let color = "rgba(255, 255, 255, 0.4)";
          let edgeText = "N/A";
          let pricingText = "Neutral";

          if (opt.adjustedEdge != null) {
            if (opt.adjustedEdge > 0.01) {
              color = "rgba(0, 229, 160, 0.9)"; // Green: underpriced
              pricingText = "Underpriced (Below Surface)";
            } else if (opt.adjustedEdge < -0.01) {
              color = "rgba(255, 77, 109, 0.9)"; // Red: overpriced
              pricingText = "Overpriced (Above Surface)";
            }
            edgeText = (opt.adjustedEdge * 100).toFixed(1) + "%";
          }
          
          scatterColor.push(color);
          scatterText.push(`Strike: ${opt.strike}<br>DTE: ${exp.dte}<br>IV: ${(opt.iv * 100).toFixed(1)}%<br>Edge: ${edgeText}<br>Status: ${pricingText}`);
          scatterCustomData.push({ strike: opt.strike, dte: exp.dte, type: opt.type });
        }
        if (opt.sviIv != null && opt.strike > 0) {
          surfaceX.push(opt.strike);
          surfaceY.push(exp.dte);
          surfaceZ.push(opt.sviIv);
        }
      });
    });

    bestOpp.sort((a, b) => Math.abs(b.adjustedEdge) - Math.abs(a.adjustedEdge));

    const TOP_5_COLORS = [
      "rgba(255, 215, 0, 0.9)",   // Gold
      "rgba(0, 229, 255, 0.9)",   // Cyan
      "rgba(255, 0, 255, 0.9)",   // Magenta
      "rgba(255, 165, 0, 0.9)",   // Orange
      "rgba(173, 255, 47, 0.9)"   // GreenYellow
    ];

    const scatterSize = new Array(scatterX.length).fill(3);

    bestOpp.forEach((opt, index) => {
      if (index < 5) {
        opt.topColor = TOP_5_COLORS[index];
        opt.topRank = index + 1;
        
        const idx = scatterCustomData.findIndex(c => c.strike === opt.strike && c.dte === opt.dte && c.type === opt.type);
        if (idx !== -1) {
          scatterColor[idx] = opt.topColor;
          scatterSize[idx] = 6;
          scatterText[idx] = `<b><span style="color:${opt.topColor.replace('0.9)', '1)')}">★ Top ${opt.topRank} Opportunity</span></b><br>` + scatterText[idx];
        }
      }
    });

    const gexProfile = Object.values(gexMap).sort((a, b) => a.strike - b.strike);

    return {
      underlyingPrice: data.underlyingPrice,
      context: data.context,
      expirations: data.expirations,
      bestOpportunities: bestOpp,
      gexProfile,
      scatterData: { x: scatterX, y: scatterY, z: scatterZ, color: scatterColor, size: scatterSize, text: scatterText, customdata: scatterCustomData },
      surfaceData: { x: surfaceX, y: surfaceY, z: surfaceZ },
    };
  }, [data]);

  const plotScatterData = useMemo(() => {
    if (!scatterData) return null;
    if (selectedDte === "all") return scatterData;
    
    return {
      ...scatterData,
      color: scatterData.color.map((c, i) => {
        const isSelected = scatterData.y[i] === selectedDte;
        if (isSelected) return c;
        return c.replace(/[\d.]+\)$/, "0.05)");
      })
    };
  }, [scatterData, selectedDte]);

  const filteredBestOpportunities = useMemo(() => {
    if (!bestOpportunities) return [];
    if (selectedDte === "all") return bestOpportunities.slice(0, 5);
    return bestOpportunities.filter(opt => opt.dte === selectedDte).slice(0, 5);
  }, [bestOpportunities, selectedDte]);

  const selectedExpiration = useMemo(() => {
    if (!data || !data.expirations) return null;
    if (selectedDte !== "all") {
      return data.expirations.find((e) => e.dte === selectedDte) || null;
    }
    return data.expirations[0] || null;
  }, [data, selectedDte]);

  const optionChainData = useMemo(() => {
    if (!selectedExpiration || !data) return { calls: [], puts: [], atmStrike: null };

    console.log('[DEBUG] selectedExpiration.options length:', selectedExpiration.options.length);
    console.log('[DEBUG] underlyingPrice:', data.underlyingPrice);
    console.log('[DEBUG] minStrike:', data.underlyingPrice * 0.9, 'maxStrike:', data.underlyingPrice * 1.1);

    const minStrike = data.underlyingPrice * 0.9;
    const maxStrike = data.underlyingPrice * 1.1;

    const calls = [];
    const puts = [];
    let closestStrike = null;
    let minDiff = Infinity;

    selectedExpiration.options.forEach(opt => {
      console.log('[DEBUG] opt.type:', JSON.stringify(opt.type), 'strike:', opt.strike, 'raw type value:', typeof opt.type, opt.type);
      if (opt.strike >= minStrike && opt.strike <= maxStrike) {
        const type = (opt.type || '').toLowerCase();
        console.log('[DEBUG] after toLowerCase:', JSON.stringify(type), 'isCall:', type === 'call');
        if (type === 'call') calls.push(opt);
        else puts.push(opt);

        const diff = Math.abs(opt.strike - data.underlyingPrice);
        if (diff < minDiff) {
          minDiff = diff;
          closestStrike = opt.strike;
        }
      }
    });

    console.log('[DEBUG] calls count:', calls.length, 'puts count:', puts.length);
    console.log('[DEBUG] calls strikes:', calls.map(c => c.strike));
    console.log('[DEBUG] puts strikes:', puts.map(p => p.strike));

    calls.sort((a, b) => b.strike - a.strike);
    puts.sort((a, b) => a.strike - b.strike);

    return { calls, puts, atmStrike: closestStrike };
  }, [selectedExpiration, data]);

  if (loading) {
    return (
      <div style={styles.loadingState}>
        <div style={styles.spinner} />
        <span>Scanning options...</span>
      </div>
    );
  }

  if (error) {
    return <div style={styles.errorState}>{error}</div>;
  }

  if (!data) return null;

  return (
    <div style={styles.container}>
      <div style={styles.mainContent}>
        {/* Global Controls */}
        <div style={styles.controlsCard}>
          <div style={styles.controlGroup}>
            <label style={styles.controlLabel}>Expiration Date</label>
            <select 
              style={styles.globalSelect} 
              value={selectedDte} 
              onChange={(e) => setSelectedDte(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All Expirations</option>
              {expirations.map((exp) => (
                <option key={exp.dte} value={exp.dte}>
                  {exp.date} ({exp.dte} DTE)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3D Surface Chart */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Volatility Surface</h3>
          <div style={styles.chartWrapper}>
            <Plot
              data={[
                {
                  type: "mesh3d",
                  x: surfaceData.x,
                  y: surfaceData.y,
                  z: surfaceData.z,
                  opacity: 0.3,
                  color: "rgba(79, 141, 255, 0.3)",
                  name: "SVI Surface",
                },
                {
                  type: "scatter3d",
                  mode: "markers",
                  x: plotScatterData.x,
                  y: plotScatterData.y,
                  z: plotScatterData.z,
                  text: plotScatterData.text,
                  customdata: plotScatterData.customdata,
                  hoverinfo: "text",
                  marker: {
                    size: plotScatterData.size,
                    color: plotScatterData.color,
                  },
                  name: "Market IV",
                },
              ]}
              onClick={(e) => {
                if (e.points && e.points.length > 0) {
                  const point = e.points.find(p => p.customdata && p.customdata.strike);
                  if (point) {
                    const { strike, dte, type } = point.customdata;
                    setSelectedContract({ strike, dte, type });
                    if (selectedDte !== dte) {
                      setSelectedDte(dte);
                    }
                    
                    setFlashChain(true);
                    setTimeout(() => setFlashChain(false), 1000);
                    
                    setTimeout(() => {
                      const rowEl = document.getElementById("selected-contract-row");
                      if (rowEl) {
                        rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
                      } else {
                        const chainEl = document.getElementById("option-chain-section");
                        if (chainEl) chainEl.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }, 100);
                  }
                }
              }}
              layout={{
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                margin: { l: 0, r: 0, t: 0, b: 0 },
                scene: {
                  xaxis: { title: "Strike", gridcolor: "rgba(255,255,255,0.1)", zerolinecolor: "rgba(255,255,255,0.1)" },
                  yaxis: { title: "DTE", gridcolor: "rgba(255,255,255,0.1)", zerolinecolor: "rgba(255,255,255,0.1)" },
                  zaxis: { title: "IV", gridcolor: "rgba(255,255,255,0.1)", zerolinecolor: "rgba(255,255,255,0.1)" },
                  bgcolor: "transparent",
                },
                font: { color: "var(--text-secondary)", family: "var(--font-mono)" },
                showlegend: false,
              }}
              config={{ displayModeBar: false }}
              style={{ width: "100%", height: "400px" }}
            />
          </div>
          <p style={styles.chartDescription}>
            <span style={{color: "rgba(0, 229, 160, 0.9)", fontWeight: "bold"}}>Green points</span> are underpriced (below surface, positive edge). 
            <span style={{color: "rgba(255, 77, 109, 0.9)", fontWeight: "bold", marginLeft: "8px"}}>Red points</span> are overpriced (above surface, negative edge).
            <span style={{color: "rgba(255, 255, 255, 0.4)", fontWeight: "bold", marginLeft: "8px"}}>White points</span> are fairly priced.
            Hover over points for exact theoretical edge.
          </p>
        </div>

        {/* Data Table (Hybrid View) */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Best Opportunities</h3>
          <div style={styles.tableWrapper}>
            <table className="options-table" style={styles.table}>
              <thead>
                <tr>
                  <th style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: 'inline-block', minWidth: '18px' }}></span>
                    Exp
                  </th>
                  <th>Strike</th>
                  <th>Type</th>
                  <th>IV</th>
                  <th>Edge</th>
                  <th>Adj Edge</th>
                </tr>
              </thead>
              <tbody>
                {filteredBestOpportunities.map((opt, i) => (
                  <tr key={i} style={{ 
                    background: opt.topColor ? opt.topColor.replace("0.9)", "0.05)") : "transparent",
                    borderLeft: opt.topColor ? `4px solid ${opt.topColor}` : "4px solid transparent" 
                  }}>
                    <td style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {opt.topRank ? (
                        <span style={{ 
                          display: 'inline-block', 
                          minWidth: '18px', 
                          height: '18px', 
                          borderRadius: '4px', 
                          backgroundColor: opt.topColor,
                          color: '#000',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          lineHeight: '18px',
                        }}>{opt.topRank}</span>
                      ) : (
                        <span style={{ minWidth: '18px' }}></span>
                      )}
                      {opt.expirationStr}
                    </td>
                    <td>{opt.strike}</td>
                    <td style={{ color: opt.type.toLowerCase() === "call" ? "var(--accent-green)" : "var(--accent-red)" }}>
                      {opt.type.toUpperCase()}
                    </td>
                    <td>{(opt.iv * 100).toFixed(1)}%</td>
                    <td style={{ color: opt.rawEdge > 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                      {(opt.rawEdge * 100).toFixed(1)}%
                    </td>
                    <td style={{ color: opt.adjustedEdge > 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                      {(opt.adjustedEdge * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div id="option-chain-section" className={flashChain ? "flash-chain" : ""} style={styles.card}>
          <div style={styles.chainHeader}>
            <h3 style={styles.cardTitle}>
              Option Chain {selectedDte !== "all" ? `(${selectedExpiration?.date})` : ""}
            </h3>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              Spot: {formatPrice(data.underlyingPrice)} (±10%)
            </span>
          </div>
          {selectedDte === "all" ? (
            <div style={styles.emptyState}>
              Select a specific expiration date above to view the full option chain.
            </div>
          ) : (
            <div className="chain-grid" style={styles.chainGrid}>
              <div className="chain-half" style={styles.chainHalf}>
                <h4 style={{...styles.cardTitle, fontSize: "14px", color: "var(--accent-green)", textAlign: "center", marginBottom: "8px"}}>Calls</h4>
                <div style={styles.tableWrapper}>
                  <table className="options-table compact-table" style={styles.table}>
                    <thead>
                      <tr>
                        <th>Strike</th>
                        <th>Bid</th>
                        <th>Ask</th>
                        <th>Vol</th>
                        <th>OI</th>
                        <th>IV</th>
                        <th>Edge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionChainData.calls.map((opt, i) => {
                        const isSelected = selectedContract && 
                          selectedContract.strike === opt.strike && 
                          selectedContract.type === opt.type && 
                          selectedContract.dte === selectedExpiration.dte;
                        const isAtm = opt.strike === optionChainData.atmStrike;
                        
                        return (
                        <tr key={i} id={isSelected ? "selected-contract-row" : undefined} style={{ 
                          background: isSelected ? "rgba(79, 141, 255, 0.15)" : (isAtm ? "rgba(255, 255, 255, 0.08)" : (opt.adjustedEdge > 0.01 ? "rgba(0, 229, 160, 0.05)" : (opt.adjustedEdge < -0.01 ? "rgba(255, 77, 109, 0.05)" : "transparent"))),
                          outline: isSelected ? "1px solid var(--accent-blue)" : "none",
                          boxShadow: isAtm ? "inset 0 0 10px rgba(255,255,255,0.05)" : "none",
                          transition: "background 0.3s, outline 0.3s"
                        }}>
                          <td style={{ fontWeight: isAtm ? "bold" : "normal", color: isAtm ? "var(--text-primary)" : "inherit" }}>{opt.strike}</td>
                          <td>{opt.bid}</td>
                          <td>{opt.ask}</td>
                          <td>{opt.volume}</td>
                          <td>{opt.openInterest}</td>
                          <td>{opt.iv != null ? (opt.iv * 100).toFixed(1) + "%" : "-"}</td>
                          <td style={{ color: opt.adjustedEdge > 0 ? "var(--accent-green)" : (opt.adjustedEdge < 0 ? "var(--accent-red)" : "inherit") }}>
                            {opt.adjustedEdge != null ? (opt.adjustedEdge * 100).toFixed(1) + "%" : "-"}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="chain-half" style={styles.chainHalf}>
                <h4 style={{...styles.cardTitle, fontSize: "14px", color: "var(--accent-red)", textAlign: "center", marginBottom: "8px"}}>Puts</h4>
                <div style={styles.tableWrapper}>
                  <table className="options-table compact-table" style={styles.table}>
                    <thead>
                      <tr>
                        <th>Strike</th>
                        <th>Bid</th>
                        <th>Ask</th>
                        <th>Vol</th>
                        <th>OI</th>
                        <th>IV</th>
                        <th>Edge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionChainData.puts.map((opt, i) => {
                        const isSelected = selectedContract && 
                          selectedContract.strike === opt.strike && 
                          selectedContract.type === opt.type && 
                          selectedContract.dte === selectedExpiration.dte;
                        const isAtm = opt.strike === optionChainData.atmStrike;
                        
                        return (
                        <tr key={i} id={isSelected ? "selected-contract-row" : undefined} style={{ 
                          background: isSelected ? "rgba(79, 141, 255, 0.15)" : (isAtm ? "rgba(255, 255, 255, 0.08)" : (opt.adjustedEdge > 0.01 ? "rgba(0, 229, 160, 0.05)" : (opt.adjustedEdge < -0.01 ? "rgba(255, 77, 109, 0.05)" : "transparent"))),
                          outline: isSelected ? "1px solid var(--accent-blue)" : "none",
                          boxShadow: isAtm ? "inset 0 0 10px rgba(255,255,255,0.05)" : "none",
                          transition: "background 0.3s, outline 0.3s"
                        }}>
                          <td style={{ fontWeight: isAtm ? "bold" : "normal", color: isAtm ? "var(--text-primary)" : "inherit" }}>{opt.strike}</td>
                          <td>{opt.bid}</td>
                          <td>{opt.ask}</td>
                          <td>{opt.volume}</td>
                          <td>{opt.openInterest}</td>
                          <td>{opt.iv != null ? (opt.iv * 100).toFixed(1) + "%" : "-"}</td>
                          <td style={{ color: opt.adjustedEdge > 0 ? "var(--accent-green)" : (opt.adjustedEdge < 0 ? "var(--accent-red)" : "inherit") }}>
                            {opt.adjustedEdge != null ? (opt.adjustedEdge * 100).toFixed(1) + "%" : "-"}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Context Metrics</h3>
          <div style={styles.metricRow}>
            <span style={styles.metricLabel}>20-Day RV</span>
            <span style={styles.metricValue}>{(context.rv * 100).toFixed(1)}%</span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricLabel}>IV Rank (Proxy)</span>
            <span style={styles.metricValue}>{(context.ivr.ivr * 100).toFixed(1)}%</span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricLabel}>IV Percentile (Proxy)</span>
            <span style={styles.metricValue}>{(context.ivp.value * 100).toFixed(1)}%</span>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>GEX Profile (≤30 DTE)</h3>
          <div style={styles.chartWrapper}>
            <Plot
              data={[
                {
                  type: "bar",
                  x: gexProfile.map((g) => g.strike),
                  y: gexProfile.map((g) => g.callGex),
                  name: "Call GEX",
                  marker: { color: "rgba(0, 229, 160, 0.8)" },
                },
                {
                  type: "bar",
                  x: gexProfile.map((g) => g.strike),
                  y: gexProfile.map((g) => g.putGex),
                  name: "Put GEX",
                  marker: { color: "rgba(255, 77, 109, 0.8)" },
                },
              ]}
              layout={{
                barmode: "relative",
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                margin: { l: 40, r: 10, t: 10, b: 40 },
                xaxis: { title: "Strike", gridcolor: "rgba(255,255,255,0.05)" },
                yaxis: { gridcolor: "rgba(255,255,255,0.05)" },
                font: { color: "var(--text-secondary)", family: "var(--font-mono)", size: 10 },
                showlegend: false,
              }}
              config={{ displayModeBar: false }}
              style={{ width: "100%", height: "300px" }}
            />
          </div>
          <p style={styles.chartDescription}>
            <strong style={{color: "rgba(0, 229, 160, 0.9)"}}>Positive GEX (Calls)</strong> acts as a magnet, reducing volatility as dealers hedge by trading against the trend. 
            <strong style={{color: "rgba(255, 77, 109, 0.9)", marginLeft: "8px"}}>Negative GEX (Puts)</strong> acts as a repellant, increasing volatility as dealers trade with the trend. 
            High GEX strikes often act as support/resistance or "pinning" levels.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    gap: "24px",
    alignItems: "flex-start",
  },
  mainContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    minWidth: 0,
  },
  sidebar: {
    width: "300px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    flexShrink: 0,
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: "12px",
    padding: "20px",
  },
  cardTitle: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 600,
    margin: "0 0 16px 0",
  },
  chartWrapper: {
    borderRadius: "8px",
    overflow: "hidden",
    background: "rgba(0,0,0,0.2)",
  },
  chartDescription: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    marginTop: "12px",
    fontStyle: "italic",
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    textAlign: "right",
  },
  chainHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  select: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    padding: "6px 12px",
    outline: "none",
  },
  metricRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  metricLabel: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
  },
  metricValue: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    fontWeight: 500,
  },
  loadingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 0",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    gap: "16px",
  },
  spinner: {
    width: "24px",
    height: "24px",
    border: "2px solid rgba(255,255,255,0.1)",
    borderTopColor: "var(--accent-blue)",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  errorState: {
    color: "var(--accent-red)",
    padding: "40px",
    textAlign: "center",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
  },
  controlsCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: "24px",
    backdropFilter: "blur(10px)",
  },
  controlGroup: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  controlLabel: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  globalSelect: {
    background: "rgba(0,0,0,0.2)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    padding: "8px 16px",
    outline: "none",
    cursor: "pointer",
    transition: "border-color 0.2s",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
  },
  chainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  chainHalf: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
};

// Add global styles for the table and spinner if not already present
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    .options-table th {
      color: var(--text-secondary);
      font-weight: 500;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .options-table td {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.02);
      color: var(--text-primary);
    }
    .compact-table th {
      padding: 4px 8px;
      font-size: 11px;
    }
    .compact-table td {
      padding: 4px 8px;
      font-size: 11px;
    }
    @media (max-width: 1024px) {
      .chain-grid {
        grid-template-columns: 1fr !important;
      }
    }
    @keyframes flashHighlight {
      0% { box-shadow: 0 0 0 0 rgba(79, 141, 255, 0); border-color: rgba(255,255,255,0.05); }
      20% { box-shadow: 0 0 30px 5px rgba(79, 141, 255, 0.4); border-color: rgba(79, 141, 255, 0.8); }
      100% { box-shadow: 0 0 0 0 rgba(79, 141, 255, 0); border-color: rgba(255,255,255,0.05); }
    }
    .flash-chain {
      animation: flashHighlight 1s ease-out;
    }
  `;
  document.head.appendChild(style);
}
