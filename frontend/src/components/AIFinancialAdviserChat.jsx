import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence, useDragControls, useMotionValue } from "framer-motion";
import { Plus, Sparkles, Loader2 } from "lucide-react";

export default function AIFinancialAdviserChat({ ticker }) {
  const [isOpen, setIsOpen] = useState(false);
  const [debateActive, setDebateActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sessionsList, setSessionsList] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [toolStatus, setToolStatus] = useState(null);
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const scrollRef = useRef(null);
  const windowRef = useRef(null);
  const dragControls = useDragControls();
  const abortControllerRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? parseInt(localStorage.getItem('aiAdviserWindowWidth')) || 400 : 400,
    height: typeof window !== 'undefined' ? parseInt(localStorage.getItem('aiAdviserWindowHeight')) || 600 : 600
  });
  const [bounds, setBounds] = useState({ width: 1000, height: 800 });

  const width = useMotionValue(windowSize.width);
  const height = useMotionValue(windowSize.height);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    setBounds({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => setBounds({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResizeStart = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width.get();
    const startHeight = height.get();
    const startPosX = x.get();
    const startPosY = y.get();

    const handlePointerMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startPosX;
      let newY = startPosY;

      const maxWidth = bounds.width * 0.9;
      const maxHeight = bounds.height * 0.9;

      if (direction.includes('left')) {
        const maxDeltaX = startWidth - 300;
        let actualDeltaX = Math.min(deltaX, maxDeltaX);
        newWidth = startWidth - actualDeltaX;
        if (newWidth > maxWidth) newWidth = maxWidth;
      }
      if (direction.includes('right')) {
        newWidth = Math.max(300, startWidth + deltaX);
        if (newWidth > maxWidth) newWidth = maxWidth;
        const widthDiff = newWidth - startWidth;
        newX = startPosX + widthDiff;
      }
      if (direction.includes('top')) {
        const maxDeltaY = startHeight - 400;
        let actualDeltaY = Math.min(deltaY, maxDeltaY);
        newHeight = startHeight - actualDeltaY;
        if (newHeight > maxHeight) newHeight = maxHeight;
      }
      if (direction.includes('bottom')) {
        newHeight = Math.max(400, startHeight + deltaY);
        if (newHeight > maxHeight) newHeight = maxHeight;
        const heightDiff = newHeight - startHeight;
        newY = startPosY + heightDiff;
      }

      width.set(newWidth);
      height.set(newHeight);
      x.set(newX);
      y.set(newY);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      const finalWidth = width.get();
      const finalHeight = height.get();
      
      setWindowSize({ width: finalWidth, height: finalHeight });
      localStorage.setItem('aiAdviserWindowWidth', finalWidth.toString());
      localStorage.setItem('aiAdviserWindowHeight', finalHeight.toString());
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  useEffect(() => {
    let isMounted = true;
    if (showSessions && ticker) {
      fetch(`/api/stocks/${ticker}/advisor-chat/sessions`)
        .then(r => r.json())
        .then(d => { if (d.success && isMounted) setSessionsList(d.data); })
        .catch(console.error);
    }
    return () => { isMounted = false; };
  }, [showSessions, ticker]);

  useEffect(() => {
    let isMounted = true;
    if (ticker) {
      fetch(`/api/stocks/${ticker}/advisor-chat/session?sessionId=${sessionId || ''}`)
        .then(r => r.json())
        .then(data => {
           if (!isMounted) return;
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
    return () => { isMounted = false; };
  }, [ticker, sessionId]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      if (!CSS.supports || !CSS.supports("scroll-initial-target", "nearest")) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [messages, currentAgent, isOpen]);

  const currentSuggestions = useMemo(() => {
     if (!messages.length) return [];
     const lastMsg = messages[messages.length - 1];
     if (lastMsg.role === 'model') {
       if (lastMsg.agent === 'Suggestions') {
         try {
           return JSON.parse(lastMsg.text);
         } catch(e) {}
       }
       const match = lastMsg.text.match(/(?:\[Suggestions\]|\*\*Suggestions\*\*|Suggestions:|### Suggestions)\s*[\n\r]*\s*(\[[\s\S]*?\])\s*$/i);
       if (match) {
         try {
           return JSON.parse(match[1]);
         } catch(e) {}
       }
     }
     return [];
  }, [messages]);

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

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`/api/stocks/${ticker}/advisor-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
        signal: abortControllerRef.current.signal
      });
      
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      if (!res.body) {
        throw new Error("Response body is empty");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); 
        
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
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error(err);
        setMessages(prev => [...prev, { role: "model", agent: "System", text: "Error connecting to advisor." }]);
      }
    } finally {
      setIsSending(false);
      setCurrentAgent(null);
      setToolStatus(null);
    }
  };

  const startDeepResearch = async () => {
    if (pollIntervalRef.current) return; // Prevent concurrent deep research requests

    setShowPlusMenu(false);
    setIsDeepResearching(true);
    setDebateActive(true);
    
    const DEEP_RESEARCH_PROMPT = `Role & Objective
You are an elite AI equity research assistant. Conduct a comprehensive, multi-step deep research investigation to generate a highly structured, data-driven fundamental analysis report on ${ticker} (${ticker}). 
Utilize your deep web search capabilities to locate the absolute latest SEC filings (10-K/10-Q), recent earnings call transcripts, real-time market data, and current news context.
 
Tone & Audience
Objectively evaluate both the Bull and Bear cases, then declare a synthesized, evidence-based stance. Remain highly analytical, objective, and institutional in tone. Do not use conversational filler. Deliver insights with maximum scannability for retail and sophisticated investors.
 
Required Structure & Data Integration
Organize the output exactly into the following sections using clear markdown headings:
 
1. Investment Overview
- State the core thesis focusing on primary macroeconomic, industry, or company-specific catalysts.
- Investment Highlights: Detail recent strategic moves and standout financial metrics from the latest earnings report.
- Investment Risks: Isolate the largest current drags on profitability, execution delays, or macroeconomic headwinds.
- Actionable Levels: Highlight a concrete "Price Watch Zone" (key support/resistance) and upcoming forward catalysts.
 
2. Company Profile & Macro Environment
- Detail the business model, core operating segments, and global market share.
- Identify the current stage of the company (e.g., Growth, Mature, Turnaround) and its primary KPI.
- Analyze current Macro & Sector headwinds/tailwinds affecting this specific business.
 
3. Financial Analysis
- Revenue & Growth: Integrate precise latest quarter metrics (YoY growth, margin expansion/contraction).
- Profitability & Cash Flow: FCF, ROIC vs. WACC, balance sheet health/Net Cash.
- Include a visual indicator (e.g., "Signal: 🟢 / 🟡 / 🔴") with a brief trailing summary at the end of each sub-section.
 
4. Company DNA & Governance
- Analyze management alignment, recent capital return programs, and insider vs. institutional ownership.
- Call out notable recent position shifts by major institutional funds.
- Highlight customer base dynamics (e.g., switching costs, recurring revenue stickiness).
 
5. Competitive Moat
- Define the overall moat rating (Wide, Narrow, None) and break down its core dimensions.
 
6. Valuation & Thesis
- Compare current valuation multiples against specific, named industry peers.
- Define a Fair Value Range and estimated safety margin.
- End with a definitive, single-sentence conclusion summarizing the investment thesis.`;

    try {
      const res = await fetch('/api/ai/deep-research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, prompt: DEEP_RESEARCH_PROMPT })
      });
      const body = await res.json();
      const interactionId = body.data?.interactionId;
      if (!interactionId) {
        throw new Error(body.error || "No interactionId returned");
      }

      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/ai/deep-research/status/${interactionId}`);
          const statusBody = await statusRes.json();
          const pollStatus = statusBody.data?.status;

          if (pollStatus === 'completed') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setIsDeepResearching(false);
            setMessages(prev => [...prev, { 
              role: 'model', 
              agent: 'Deep Research', 
              text: statusBody.data?.result || "Research completed but no output was returned." 
            }]);
          } else if (pollStatus === 'failed') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setIsDeepResearching(false);
            setMessages(prev => [...prev, { 
              role: 'model', 
              agent: 'System', 
              text: "Deep Research failed." + (statusBody.data?.error ? ` ${statusBody.data.error}` : "")
            }]);
          }
          // "in_progress" or any other status — continue polling
        } catch (e) {
          console.error("Polling error:", e);
          // Do not clear interval on transient network errors — retry on next tick
        }
      }, 10000);
      
    } catch (e) {
      console.error(e);
      setIsDeepResearching(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setMessages(prev => [...prev, { role: 'model', agent: 'System', text: "Failed to start Deep Research." }]);
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

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={windowRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={{ 
              left: -bounds.width + windowSize.width + 32, 
              right: 32, 
              top: -bounds.height + windowSize.height + 100, 
              bottom: 100 
            }}
            style={{
              ...floatingWindow,
              width,
              height,
              x,
              y
            }}
          >
            <div className="resize-handle resize-top" onPointerDown={(e) => handleResizeStart(e, 'top')} />
            <div className="resize-handle resize-right" onPointerDown={(e) => handleResizeStart(e, 'right')} />
            <div className="resize-handle resize-bottom" onPointerDown={(e) => handleResizeStart(e, 'bottom')} />
            <div className="resize-handle resize-left" onPointerDown={(e) => handleResizeStart(e, 'left')} />
            <div className="resize-handle resize-top-left" onPointerDown={(e) => handleResizeStart(e, 'top-left')} />
            <div className="resize-handle resize-top-right" onPointerDown={(e) => handleResizeStart(e, 'top-right')} />
            <div className="resize-handle resize-bottom-left" onPointerDown={(e) => handleResizeStart(e, 'bottom-left')} />
            <div className="resize-handle resize-bottom-right" onPointerDown={(e) => handleResizeStart(e, 'bottom-right')} />

            <div className="drag-handle" style={windowHeader} onPointerDown={(e) => dragControls.start(e)}>
              <div style={headerTitle}>
                <span style={{fontSize: "16px"}}>💬</span> AI Financial Adviser
              </div>
              <div style={{display: "flex", gap: "8px", alignItems: "center"}}>
                {debateActive && (
                  <>
                    <button style={headerBtn} onClick={exportChat}>Export</button>
                    <button style={headerBtn} onClick={() => { setSessionId(null); setMessages([]); setDebateActive(false); }}>New</button>
                  </>
                )}
                <button style={headerBtn} onClick={() => setShowSessions(!showSessions)}>History</button>
                <button style={closeBtn} onClick={() => setIsOpen(false)}>×</button>
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

            <div style={windowBody}>
              {!debateActive ? (
                <div style={debateSplash}>
                  <div style={debateSplashIcon}>💬</div>
                  <div style={debateSplashTitle}>Financial Adviser</div>
                  <div style={debateSplashDesc}>
                    Consult with a specialized AI financial advisory team about {ticker}'s valuation and risks.
                  </div>
                  <div style={{...chatInputWrap, marginTop: "20px"}}>
                    <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                      <button 
                        onClick={() => setShowPlusMenu(!showPlusMenu)}
                        style={{
                          position: "absolute",
                          left: "12px",
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          borderRadius: "50%",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                          transition: "all 0.2s",
                          zIndex: 2
                        }}
                      >
                        <Plus size={16} />
                      </button>
                      
                      <AnimatePresence>
                        {showPlusMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            style={{
                              position: "absolute",
                              bottom: "calc(100% + 12px)",
                              left: "0",
                              background: "rgba(30, 30, 30, 0.95)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              borderRadius: "12px",
                              padding: "8px",
                              backdropFilter: "blur(16px)",
                              WebkitBackdropFilter: "blur(16px)",
                              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                              zIndex: 100,
                              minWidth: "180px"
                            }}
                          >
                            <button
                              onClick={startDeepResearch}
                              disabled={isDeepResearching}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                width: "100%",
                                background: "transparent",
                                border: "none",
                                padding: "10px 12px",
                                color: isDeepResearching ? "var(--text-muted)" : "var(--text-primary)",
                                cursor: isDeepResearching ? "not-allowed" : "pointer",
                                borderRadius: "8px",
                                transition: "background 0.2s",
                                textAlign: "left",
                                fontSize: "13px",
                                opacity: isDeepResearching ? 0.5 : 1
                              }}
                              onMouseOver={(e) => { if (!isDeepResearching) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                              onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <Sparkles size={16} color={isDeepResearching ? "var(--text-muted)" : "var(--accent-purple)"} />
                              <span>{isDeepResearching ? "Research in progress..." : "Deep Research"}</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <input 
                        style={{...chatInput, paddingLeft: "44px"}} 
                        placeholder="Ask a question..." 
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage(inputValue)}
                        disabled={isSending}
                      />
                    </div>
                    <button style={chatSendBtn} onClick={() => sendMessage(inputValue)}>Send</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={chatScroll} className="chat-container" ref={scrollRef}>
                    {messages.map((msg, i) => {
                      const isUser = msg.role === "user";
                      const isLast = i === messages.length - 1;
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
                  
                  {isDeepResearching && (
                    <div style={{
                      padding: "10px 24px",
                      background: "rgba(162, 89, 255, 0.05)",
                      borderTop: "1px solid rgba(162, 89, 255, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "12px",
                      color: "var(--accent-purple)",
                      fontFamily: "var(--font-body)"
                    }}>
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} style={{ display: "flex" }}>
                        <Loader2 size={14} />
                      </motion.div>
                      <span>Deep Research in progress... This may take a few minutes.</span>
                    </div>
                  )}
                  <div style={{...chatInputWrap, flexDirection: "column", padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.03)", background: "rgba(0,0,0,0.3)"}}>
                    <div style={{display: "flex", gap: "12px", width: "100%", alignItems: "center"}}>
                      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                        <button 
                          onClick={() => setShowPlusMenu(!showPlusMenu)}
                          style={{
                            position: "absolute",
                            left: "12px",
                            background: "rgba(255,255,255,0.1)",
                            border: "none",
                            borderRadius: "50%",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            color: "var(--text-secondary)",
                            transition: "all 0.2s",
                            zIndex: 2
                          }}
                        >
                          <Plus size={16} />
                        </button>
                        
                        <AnimatePresence>
                          {showPlusMenu && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              style={{
                                position: "absolute",
                                bottom: "calc(100% + 12px)",
                                left: "0",
                                background: "rgba(30, 30, 30, 0.95)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "12px",
                                padding: "8px",
                                backdropFilter: "blur(16px)",
                                WebkitBackdropFilter: "blur(16px)",
                                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                                zIndex: 100,
                                minWidth: "180px"
                              }}
                            >
                              <button
                                onClick={startDeepResearch}
                                disabled={isDeepResearching}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  width: "100%",
                                  background: "transparent",
                                  border: "none",
                                  padding: "10px 12px",
                                  color: isDeepResearching ? "var(--text-muted)" : "var(--text-primary)",
                                  cursor: isDeepResearching ? "not-allowed" : "pointer",
                                  borderRadius: "8px",
                                  transition: "background 0.2s",
                                  textAlign: "left",
                                  fontSize: "13px",
                                  opacity: isDeepResearching ? 0.5 : 1
                                }}
                                onMouseOver={(e) => { if (!isDeepResearching) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                                onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                <Sparkles size={16} color={isDeepResearching ? "var(--text-muted)" : "var(--accent-purple)"} />
                                <span>{isDeepResearching ? "Research in progress..." : "Deep Research"}</span>
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <input 
                          className="modern-chat-input"
                          style={{...chatInput, paddingLeft: "44px"}} 
                          placeholder={isDeepResearching ? "Deep Research in progress..." : "Ask your financial adviser..."}
                          value={inputValue}
                          onChange={e => setInputValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && sendMessage(inputValue)}
                          disabled={isSending || isDeepResearching}
                        />
                      </div>
                      <button className="modern-chat-btn" style={{...chatSendBtn, opacity: isSending ? 0.5 : 1}} onClick={() => sendMessage(inputValue)} disabled={isSending}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={!isOpen && isDeepResearching ? "fab-siri-active" : ""}
        style={fabStyle}
        onClick={() => setIsOpen(!isOpen)}
        title="AI Financial Adviser"
      >
        {!isOpen && isDeepResearching ? (
          <div className="fab-siri-overlay">
            <span className="siri-emoji-pulsing" style={{ fontSize: "24px" }}>💬</span>
          </div>
        ) : (
          <span style={{ fontSize: "24px" }}>{isOpen ? "✕" : "💬"}</span>
        )}
      </motion.button>
    </>
  );
}

const floatingWindow = {
  position: "fixed",
  bottom: "100px",
  right: "32px",
  width: "400px",
  height: "600px",
  background: "rgba(20, 20, 20, 0.85)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "16px",
  boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
  display: "flex",
  flexDirection: "column",
  zIndex: 9999,
  overflow: "hidden",
  minWidth: "300px",
  minHeight: "400px",
  maxWidth: "90vw",
  maxHeight: "90vh",
};

const windowHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 20px",
  background: "rgba(255, 255, 255, 0.03)",
  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  cursor: "grab",
};

const windowBody = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
  position: "relative",
};

const headerTitle = {
  color: "var(--text-primary)",
  fontFamily: "var(--font-display)",
  fontSize: "14px",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const headerBtn = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px", padding: "4px 10px", color: "var(--text-secondary)",
  fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600,
  cursor: "pointer", transition: "all 0.2s"
};

const closeBtn = {
  background: "transparent",
  border: "none",
  color: "var(--text-secondary)",
  fontSize: "20px",
  cursor: "pointer",
  padding: "0 4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const fabStyle = {
  position: "fixed",
  bottom: "32px",
  right: "32px",
  width: "60px",
  height: "60px",
  borderRadius: "30px",
  background: "linear-gradient(135deg, var(--accent-blue) 0%, #a259ff 100%)",
  color: "white",
  border: "none",
  boxShadow: "0 8px 24px rgba(79, 141, 255, 0.4)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
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

const chatScroll = { display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", padding: "20px 24px", flex: 1, scrollBehavior: "smooth" };
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

const sessionsDrawer = {
  position: "absolute", top: "60px", right: "20px", width: "260px",
  background: "rgba(10,11,16,0.95)", border: "1px solid var(--accent-blue)",
  borderRadius: "0", padding: "16px", zIndex: 10,
  backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
  maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px",
  boxShadow: "-10px 0 30px rgba(0,240,255,0.1)"
};

const sessionItem = {
  padding: "10px", background: "rgba(0,240,255,0.02)", borderRadius: "0",
  cursor: "pointer", border: "1px solid var(--glass-border)", transition: "all 0.2s"
};

const suggestionChip = {
  background: "rgba(0, 240, 255, 0.05)", border: "1px solid var(--glass-border)",
  borderRadius: "0", padding: "8px 14px", color: "var(--accent-blue)",
  fontFamily: "var(--font-mono)", fontSize: "13px", cursor: "pointer",
  transition: "all 0.2s ease", whiteSpace: "normal", textAlign: "left",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  maxWidth: "100%", textTransform: "uppercase"
};

const pillStyle = {
  background: "rgba(0, 240, 255, 0.1)", border: "1px solid var(--accent-blue)",
  borderRadius: "0", padding: "2px 8px", textDecoration: "none",
  fontWeight: "700", display: "inline-block", margin: "0 2px", color: "var(--accent-blue)"
};
