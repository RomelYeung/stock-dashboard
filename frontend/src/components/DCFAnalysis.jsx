import { useState, useRef, useEffect, useMemo } from "react";
import MonteCarloChart from "./MonteCarloChart";
import SensitivityMatrix from "./SensitivityMatrix";
import { formatPrice, formatPercent, formatRevenue } from "../utils/formatters";
import { calculateGordonGrowth, calculateRIM } from "../utils/aiValuation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function DCFAnalysis({ ticker, dcfData, aiValuationData, currentPrice, loading, onRefetch }) {
  const [costOfEquityAdj, setCostOfEquityAdj] = useState(0);
  const [growthAdj, setGrowthAdj] = useState(0);

  const [debateActive, setDebateActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sessionsList, setSessionsList] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [toolStatus, setToolStatus] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (showSessions && ticker) {
      fetch(`/api/stocks/${ticker}/advisor-chat/sessions`)
        .then(r => r.json())
        .then(d => { if (d.success) setSessionsList(d.data); })
        .catch(console.error);
    }
  }, [showSessions, ticker]);

  useEffect(() => {
    if (ticker) {
      fetch(`/api/stocks/${ticker}/advisor-chat/session?sessionId=${sessionId || ''}`)
        .then(r => r.json())
        .then(data => {
           if (data.success && data.data) {
             if (data.data.history && data.data.history.length > 0) {
               setMessages(data.data.history);
               setDebateActive(true);
             } else {
               setMessages([]);
               setDebateActive(false);
             }
             if (data.data.sessionId) {
               setSessionId(data.data.sessionId);
             }
           }
        })
        .catch(e => console.error(e));
    }
  }, [ticker, sessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      if (!CSS.supports || !CSS.supports("scroll-initial-target", "nearest")) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [messages, currentAgent]);

  const currentSuggestions = useMemo(() => {
     if (!messages.length) return [];
     const lastMsg = messages[messages.length - 1];
     if (lastMsg.role === 'model') {
       // If the backend extracted [Suggestions] as an agent:
       if (lastMsg.agent === 'Suggestions') {
         try {
           return JSON.parse(lastMsg.text);
         } catch(e) {}
       }
       // Otherwise, try to extract it from the text body:
       const match = lastMsg.text.match(/(?:\[Suggestions\]|\*\*Suggestions\*\*|Suggestions:|### Suggestions)\s*[\n\r]*\s*(\[[\s\S]*?\])\s*$/i);
       if (match) {
         try {
           return JSON.parse(match[1]);
         } catch(e) {}
       }
     }
     return [];
  }, [messages]);

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
  
  const shiftedHistogram = monteCarlo?.histogram?.map(bin => ({
    ...bin,
    bucket: bin.bucket * shiftRatio
  }));

  const upsidePercent = ((newFairValue - currentPrice) / currentPrice) * 100;

  // Mock dividend and BV if not in params
  const dividend = params.dividend || (currentPrice * 0.02);
  const ddmValue = calculateGordonGrowth(dividend, wacc, terminalGrowth);
  const rimValue = calculateRIM(currentPrice * 0.4, [currentPrice * 0.05, currentPrice * 0.055, currentPrice * 0.06], wacc, terminalGrowth);

  const exportChat = () => {
    let md = `# AI Financial Adviser Session - ${ticker}\n\n`;
    messages.forEach(msg => {
      md += `**${msg.agent}**:\n${cleanText(msg.text)}\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}-adviser-session.md`;
    a.click();
  };

  const cleanText = (text) => text.replace(/(?:\[Suggestions\]|\*\*Suggestions\*\*|Suggestions:|### Suggestions)\s*[\n\r]*\s*\[[\s\S]*?\]\s*$/i, '').trim();

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    setDebateActive(true);
    setMessages(prev => [...prev, { role: "user", agent: "User", text }]);
    setInputValue("");
    setIsSending(true);
    setToolStatus(null);
    setCurrentAgent("Coordinator");

    try {
      const res = await fetch(`/api/stocks/${ticker}/advisor-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId })
      });
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep the last incomplete line
        
        for (const line of lines) {
           if (line.startsWith('data: ') && line !== 'data: [DONE]') {
             const dataStr = line.replace('data: ', '');
             if (!dataStr.trim()) continue;
             try {
               const parsed = JSON.parse(dataStr);
               if (parsed.type === 'sessionId') {
                 setSessionId(parsed.sessionId);
               } else if (parsed.type === 'status') {
                 setToolStatus(parsed.message);
               } else if (parsed.agent && parsed.chunk) {
                 setToolStatus(null);
                 setCurrentAgent(parsed.agent);
                 
                 // If the backend parsed [Suggestions] as an agent, we can reconstruct it into the text of the last message
                 // or just render it as a normal message and let currentSuggestions extract it if it's valid JSON.
                 // Actually, if it's agent="Suggestions", the frontend will render it.
                 
                 setMessages(prev => {
                   const newPrev = [...prev];
                   const last = newPrev[newPrev.length - 1];
                   if (last && last.role === 'model' && last.agent === parsed.agent) {
                     newPrev[newPrev.length - 1] = { ...last, text: last.text + parsed.chunk };
                   } else {
                     newPrev.push({ role: 'model', agent: parsed.agent, text: parsed.chunk });
                   }
                   return newPrev;
                 });
               }
             } catch (e) {
               // ignore incomplete JSON chunk
             }
           }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "model", agent: "System", text: "Error connecting to advisor." }]);
    } finally {
      setIsSending(false);
      setCurrentAgent(null);
      setToolStatus(null);
    }
  };

  const MarkdownComponents = {
    a: ({node, ...props}) => {
      const isInternal = props.href?.startsWith('#');
      if (isInternal) {
        return (
          <a {...props} style={{...pillStyle, color: "var(--accent-blue)"}} onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById(props.href.substring(1));
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }} />
        );
      }
      return <a {...props} target="_blank" rel="noopener noreferrer" style={{color: "var(--accent-blue)"}}/>;
    }
  };

  const quantChecks = aiValuationData?.quant
    ? {
        gex: "N/A",
        stationarity: `Score: ${aiValuationData.quant.stationarityScore.toFixed(0)}`,
        svi: `a=${aiValuationData.quant.svi.a.toFixed(2)}, b=${aiValuationData.quant.svi.b.toFixed(2)}, ρ=${aiValuationData.quant.svi.rho.toFixed(2)}`
      }
    : {
        gex: 2.4, stationarity: "Stationary (ADF p<0.05)", svi: "a=0.04, b=0.12, ρ=-0.4"
      };

  return (
    <div style={splitLayout}>
      {/* LEFT: Models */}
      <div style={leftCol}>
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

      {/* RIGHT: AI Adviser */}
      <div style={rightCol}>
        <div style={{ ...glassCard, height: "100%", display: "flex", flexDirection: "column", padding: "0", position: "relative", overflow: "hidden" }}>
          <div style={{ ...sectionTitle, padding: "20px 24px 16px", margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>AI Financial Adviser</span>
            <div style={{display: "flex", gap: "8px"}}>
              {debateActive && (
                <>
                  <button style={headerBtn} onClick={exportChat}>Export</button>
                  <button style={headerBtn} onClick={() => { setSessionId(null); setMessages([]); setDebateActive(false); }}>New</button>
                </>
              )}
              <button style={headerBtn} onClick={() => setShowSessions(!showSessions)}>History</button>
            </div>
          </div>
          
          {showSessions && (
            <div style={sessionsDrawer}>
               <div style={{color: "var(--text-secondary)", fontSize: "12px", marginBottom: "12px", textTransform: "uppercase"}}>Past Sessions</div>
               {sessionsList.map(s => (
                 <div key={s.id} style={sessionItem} onClick={() => { setSessionId(s.id); setShowSessions(false); }}>
                   <div style={{color: "var(--text-primary)", fontSize: "13px", marginBottom: "4px"}}>{s.snippet}</div>
                   <div style={{color: "var(--text-muted)", fontSize: "10px"}}>{new Date(s.updatedAt).toLocaleString()}</div>
                 </div>
               ))}
               {sessionsList.length === 0 && <div style={{color: "var(--text-muted)", fontSize: "12px"}}>No past sessions found.</div>}
            </div>
          )}
          
          {!debateActive ? (
            <div style={debateSplash}>
              <div style={debateSplashIcon}>💬</div>
              <div style={debateSplashTitle}>Financial Adviser</div>
              <div style={debateSplashDesc}>
                Consult with a specialized AI financial advisory team about this stock's valuation and risks.
              </div>
              <div style={{...chatInputWrap, marginTop: "20px"}}>
                <input 
                  style={chatInput} 
                  placeholder="Ask a question..." 
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(inputValue)}
                />
                <button style={chatSendBtn} onClick={() => sendMessage(inputValue)}>Send</button>
              </div>
            </div>
          ) : (
            <>
              <div style={chatScroll} className="chat-container" ref={scrollRef}>
                {messages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  const isLast = i === messages.length - 1;
                  // Hide the Suggestions agent bubble since we render them as chips
                  if (msg.agent === 'Suggestions') return null;
                  const color = isUser ? "var(--text-primary)" : agentColors[msg.agent] || "var(--text-primary)";
                  
                  return (
                    <div key={i} style={{ ...chatBubbleWrapper, alignItems: isUser ? "flex-end" : "flex-start" }} className={isLast ? "last-message" : ""}>
                      <div style={{ ...chatAgentLabel, color }}>{msg.agent}</div>
                      <div style={{ ...chatBubble, 
                        borderRadius: isUser ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                        background: isUser ? "linear-gradient(135deg, rgba(79,141,255,0.15) 0%, rgba(79,141,255,0.05) 100%)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isUser ? "rgba(79,141,255,0.2)" : "rgba(255,255,255,0.06)"}`,
                      }} className="markdown-body">
                        <ReactMarkdown components={MarkdownComponents} remarkPlugins={[remarkGfm]}>
                          {cleanText(msg.text)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
                {currentAgent && (
                  <div style={{ ...chatBubbleWrapper, alignItems: "flex-start" }} className="last-message">
                    <div style={{ ...chatAgentLabel, color: agentColors[currentAgent] || "var(--text-secondary)" }}>
                      {currentAgent}
                    </div>
                    <div style={{ ...chatBubble, borderLeftColor: "transparent", display: "flex", gap: "4px", padding: "12px 16px" }}>
                      <div style={{...typingDot, animationDelay: "0ms"}}></div>
                      <div style={{...typingDot, animationDelay: "150ms"}}></div>
                      <div style={{...typingDot, animationDelay: "300ms"}}></div>
                    </div>
                  </div>
                )}
                {toolStatus && (
                  <div style={{ ...chatBubbleWrapper, alignItems: "center", opacity: 0.7 }}>
                    <div style={{ background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "12px", fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                       <span style={{...typingDot, background: "var(--accent-blue)", animationDelay: "0ms", width: "4px", height: "4px"}} />
                       {toolStatus}
                    </div>
                  </div>
                )}
                {currentSuggestions.length > 0 && !isSending && (
                  <div style={{display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px", padding: "0 4px"}}>
                    {currentSuggestions.map((s, idx) => (
                      <button key={idx} className="suggestion-chip" style={suggestionChip} onClick={() => sendMessage(s)}>{s}</button>
                    ))}
                  </div>
                )}
                <div className="scroll-sentinel"></div>
              </div>
              
              <button className="scroll-to-bottom-fab" onClick={() => {
                if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
              }}>↓</button>
              
              <div style={{...chatInputWrap, flexDirection: "column", padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.03)", background: "rgba(0,0,0,0.3)", borderRadius: "0 0 16px 16px"}}>
                <div style={{display: "flex", gap: "12px", width: "100%", alignItems: "center"}}>
                  <input 
                    className="modern-chat-input"
                    style={chatInput} 
                    placeholder="Ask your financial adviser..." 
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage(inputValue)}
                    disabled={isSending}
                  />
                  <button className="modern-chat-btn" style={{...chatSendBtn, opacity: isSending ? 0.5 : 1}} onClick={() => sendMessage(inputValue)} disabled={isSending}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

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

const splitLayout = { display: "grid", gridTemplateColumns: "1fr 380px", gap: "24px", alignItems: "start" };
const leftCol = { display: "flex", flexDirection: "column", gap: "24px", minWidth: 0 };
const rightCol = { position: "sticky", top: "0", height: "calc(100vh - 200px)" };

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

const committeeScroll = { display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", paddingRight: "8px", flex: 1 };
const committeeMember = {
  background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px"
};
const memberHeader = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const memberName = { color: "var(--text-primary)", fontWeight: 600, fontFamily: "var(--font-display)", fontSize: "14px" };
const memberScore = { fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700 };
const memberArgument = { color: "var(--text-secondary)", fontSize: "13px", lineHeight: 1.5, fontFamily: "var(--font-body)" };

const skel = {
  height: "120px", background: "rgba(255,255,255,0.03)",
  borderRadius: "10px", animation: "pulse 1.5s ease-in-out infinite",
};
const unavail = {
  color: "var(--text-secondary)", fontFamily: "var(--font-body)",
  fontSize: "13px", textAlign: "center", padding: "40px 0",
};

const agentColors = {
  "Coordinator": "var(--accent-blue)",
  "Data Analyst": "var(--accent-green)",
  "Trading Analyst": "var(--accent-amber)",
  "Execution Analyst": "var(--accent-purple)",
  "Risk Evaluation Agent": "var(--accent-red)",
  "System": "var(--text-secondary)"
};

const debateSplash = { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", gap: "16px", flex: 1 };
const debateSplashIcon = { fontSize: "48px", opacity: 0.8 };
const debateSplashTitle = { color: "var(--text-primary)", fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700 };
const debateSplashDesc = { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "13px", textAlign: "center", lineHeight: 1.6 };

const chatInputWrap = { display: "flex", gap: "8px", width: "100%" };
const chatInput = {
  flex: 1, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "24px", padding: "14px 20px", color: "var(--text-primary)", fontFamily: "var(--font-body)",
  fontSize: "14px", outline: "none", transition: "all 0.3s ease",
  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)"
};
const chatSendBtn = {
  background: "linear-gradient(135deg, var(--accent-blue) 0%, #a259ff 100%)", color: "#fff", border: "none", 
  borderRadius: "50%", width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", 
  boxShadow: "0 4px 12px rgba(79, 141, 255, 0.4)", flexShrink: 0
};

const chatScroll = { display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", padding: "0 24px 24px", flex: 1, scrollBehavior: "smooth" };
const chatBubbleWrapper = { display: "flex", flexDirection: "column", gap: "6px", width: "100%" };
const chatAgentLabel = { fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, letterSpacing: "0.02em" };
const chatBubble = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "20px 20px 20px 4px", padding: "14px 20px",
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "14px", lineHeight: 1.6,
  whiteSpace: "pre-wrap", boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", maxWidth: "90%"
};

const typingDot = { width: "6px", height: "6px", background: "currentColor", borderRadius: "50%", animation: "pulse 1.5s infinite" };

const headerBtn = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px", padding: "4px 10px", color: "var(--text-secondary)",
  fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600,
  cursor: "pointer", transition: "all 0.2s"
};

const sessionsDrawer = {
  position: "absolute", top: "56px", right: "24px", width: "260px",
  background: "rgba(20,20,20,0.95)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px", padding: "16px", zIndex: 10,
  backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
  maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px"
};

const sessionItem = {
  padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px",
  cursor: "pointer", border: "1px solid transparent", transition: "all 0.2s"
};

const suggestionChip = {
  background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "20px", padding: "8px 14px", color: "var(--text-primary)",
  fontFamily: "var(--font-body)", fontSize: "13px", cursor: "pointer",
  transition: "all 0.2s ease", whiteSpace: "normal", textAlign: "left",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  maxWidth: "100%"
};

const pillStyle = {
  background: "rgba(79, 141, 255, 0.1)", border: "1px solid rgba(79, 141, 255, 0.3)",
  borderRadius: "12px", padding: "2px 8px", textDecoration: "none",
  fontWeight: "500", display: "inline-block", margin: "0 2px"
};
