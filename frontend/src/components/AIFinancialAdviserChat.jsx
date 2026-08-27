import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence, useDragControls, useMotionValue } from "framer-motion";
import { Plus, Sparkles, Loader2 } from "lucide-react";

const EMPTY_PROFILE = { riskTolerance: "", horizon: "", style: "", notes: "" };
const PROFILE_OPTIONS = {
  riskTolerance: [["CONSERVATIVE", "Conservative"], ["BALANCED", "Balanced"], ["AGGRESSIVE", "Aggressive"]],
  horizon: [["SHORT", "Short term"], ["MEDIUM", "Medium term"], ["LONG", "Long term"]],
  style: [["VALUE", "Value"], ["GROWTH", "Growth"], ["BLEND", "Blend"], ["INDEX", "Index"]],
};
const ADVISER_STAGES = [
  ["brief", "Brief"],
  ["memos", "Memos"],
  ["rebuttal", "Rebuttal"],
  ["synthesis", "Synthesis"],
];

const normalizeProfile = (profile) => ({
  riskTolerance: profile?.riskTolerance || "",
  horizon: profile?.horizon || "",
  style: profile?.style || "",
  notes: profile?.notes || "",
});
const isProfileComplete = (profile) => Boolean(profile?.riskTolerance && profile?.horizon && profile?.style);
const profileLabel = (value, options) => options.find(([key]) => key === value)?.[1] || value;
export const getDeepResearchPollError = (response, body) => response.ok
  ? ""
  : body?.error || `Server returned ${response.status}`;

export default function AIFinancialAdviserChat({ ticker }) {
  const [isOpen, setIsOpen] = useState(false);
  const [debateActive, setDebateActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [sessionToLoad, setSessionToLoad] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sessionsList, setSessionsList] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [toolStatus, setToolStatus] = useState(null);
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [profileState, setProfileState] = useState("loading");
  const [profileError, setProfileError] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileRefresh, setProfileRefresh] = useState(0);
  const [fullPanel, setFullPanel] = useState(false);
  const [fullPanelNotice, setFullPanelNotice] = useState("");
  const [adviserStage, setAdviserStage] = useState(null);
  const scrollRef = useRef(null);
  const windowRef = useRef(null);
  const dragControls = useDragControls();
  const abortControllerRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const loadedTickerRef = useRef(null);
  const sessionLoadRequestRef = useRef(0);
  const persistentToolStatusRef = useRef(false);

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

  useEffect(() => {
    const controller = new AbortController();
    setProfileState("loading");
    setProfileError("");
    setIsEditingProfile(false);

    fetch("/api/profile/investor", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setProfile(null);
          setProfileForm(EMPTY_PROFILE);
          setProfileState("unauthorized");
          return;
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          throw new Error(body.error || "Unable to load your investor profile.");
        }
        const nextProfile = normalizeProfile(body.profile);
        setProfile(nextProfile);
        setProfileForm(nextProfile);
        setProfileState("idle");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setProfileState("error");
        setProfileError(error.message);
      });

    return () => controller.abort();
  }, [ticker, profileRefresh]);

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
    const requestId = ++sessionLoadRequestRef.current;
    const tickerChanged = loadedTickerRef.current !== ticker;
    loadedTickerRef.current = ticker;

    if (tickerChanged && sessionToLoad !== null) {
      setSessionToLoad(null);
      return;
    }
    if (!ticker || sessionToLoad === false) return;

    const controller = new AbortController();
    fetch(`/api/stocks/${ticker}/advisor-chat/session?sessionId=${sessionToLoad || ''}`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => {
           if (requestId !== sessionLoadRequestRef.current) return;
           if (data.success && data.data) {
             if (data.data.history && data.data.history.length > 0) {
               setMessages(data.data.history);
               setDebateActive(true);
             } else {
               setMessages([]);
               setDebateActive(false);
             }
             setSessionId(data.data.sessionId || null);
           }
        })
        .catch(e => { if (e.name !== "AbortError") console.error(e); });

    return () => controller.abort();
  }, [ticker, sessionToLoad]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current);
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

  const openProfileEditor = () => {
    setProfileForm(normalizeProfile(profile));
    setProfileError("");
    setProfileState((state) => state === "saved" ? "idle" : state);
    setIsEditingProfile(true);
  };

  const cancelProfileEdit = () => {
    setProfileForm(normalizeProfile(profile));
    setProfileError("");
    setProfileState((state) => state === "saving" ? state : "idle");
    setIsEditingProfile(false);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileState("saving");
    setProfileError("");

    const payload = {
      riskTolerance: profileForm.riskTolerance,
      horizon: profileForm.horizon,
      style: profileForm.style,
      notes: profileForm.notes.trim(),
    };

    try {
      const response = await fetch("/api/profile/investor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        setProfile(null);
        setProfileForm(EMPTY_PROFILE);
        setProfileState("unauthorized");
        setIsEditingProfile(false);
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Unable to save your investor profile.");
      }
      const savedProfile = normalizeProfile(body.profile);
      setProfile(savedProfile);
      setProfileForm(savedProfile);
      setProfileState("saved");
      setIsEditingProfile(false);
    } catch (error) {
      setProfileState("error");
      setProfileError(error.message);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    if (profileState === "loading" || profileState === "unauthorized") return;
    setDebateActive(true);
    setMessages(prev => [...prev, { role: "user", agent: "User", text }]);
    setInputValue("");
    setIsSending(true);
    setToolStatus(null);
    persistentToolStatusRef.current = false;
    setAdviserStage(null);
    setFullPanelNotice("");
    setCurrentAgent("Coordinator");

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`/api/stocks/${ticker}/advisor-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ...(sessionId ? { sessionId } : {}), ...(fullPanel ? { forceDeep: true } : {}) }),
        signal: abortControllerRef.current.signal
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 501 && fullPanel) {
          setFullPanel(false);
          setFullPanelNotice("Full Panel is not enabled on this server. Fast chat is ready; your question has been restored.");
          setInputValue(text);
          setMessages((current) => current.slice(0, -1));
          if (messages.length === 0) setDebateActive(false);
          return;
        }
        throw new Error(body.error || `Server returned ${res.status}`);
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
                 if (/fallback/i.test(parsed.message || "")) {
                   persistentToolStatusRef.current = true;
                   setAdviserStage(null);
                   setToolStatus(parsed.message);
                 } else if (!persistentToolStatusRef.current) {
                   setToolStatus(parsed.message);
                 }
               } else if (parsed.type === 'stage') {
                 if (!persistentToolStatusRef.current) setAdviserStage(parsed);
               } else if (parsed.type === 'error') {
                 persistentToolStatusRef.current = true;
                 setAdviserStage(null);
                 setToolStatus(parsed.message || parsed.error || "The adviser encountered an error.");
               } else if (parsed.agent && parsed.chunk) {
                 if (!persistentToolStatusRef.current) setToolStatus(null);
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
        setMessages(prev => [...prev, { role: "model", agent: "System", text: err.message || "Error connecting to advisor." }]);
      }
    } finally {
      setIsSending(false);
      setCurrentAgent(null);
      setAdviserStage(null);
      if (!persistentToolStatusRef.current) setToolStatus(null);
      persistentToolStatusRef.current = false;
    }
  };

  const startDeepResearch = async () => {
    if (profileState === "loading" || profileState === "unauthorized" || pollIntervalRef.current) return;

    setShowPlusMenu(false);
    setIsDeepResearching(true);
    setDebateActive(true);

    try {
      const res = await fetch('/api/ai/deep-research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker })
      });
      const body = await res.json();
      const interactionId = body.data?.interactionId;
      if (!interactionId) {
        throw new Error(body.error || "No interactionId returned");
      }

      const pollDeepResearch = async () => {
        try {
          const statusRes = await fetch(`/api/ai/deep-research/status/${interactionId}`);
          const statusBody = await statusRes.json().catch(() => ({}));
          const pollError = getDeepResearchPollError(statusRes, statusBody);
          if (pollError) {
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setIsDeepResearching(false);
            setAdviserStage(null);
            setToolStatus(null);
            setMessages(prev => [...prev, {
              role: 'model',
              agent: 'System',
              text: `Deep Research stopped. ${pollError} Please retry.`
            }]);
            return;
          }
          const pollStatus = statusBody.data?.status;

          if (pollStatus === 'completed') {
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setIsDeepResearching(false);
            setMessages(prev => [...prev, { 
              role: 'model', 
              agent: 'Deep Research', 
              text: statusBody.data?.result || "Research completed but no output was returned." 
            }]);
            return;
          } else if (pollStatus === 'failed') {
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setIsDeepResearching(false);
            setMessages(prev => [...prev, { 
              role: 'model', 
              agent: 'System', 
              text: "Deep Research failed." + (statusBody.data?.error ? ` ${statusBody.data.error}` : "")
            }]);
            return;
          }
          // "in_progress" or any other status — continue polling
        } catch (e) {
          console.error("Polling error:", e);
          // Do not clear the timer on transient network errors — retry on next tick
        }
        if (pollIntervalRef.current !== null) {
          pollIntervalRef.current = setTimeout(pollDeepResearch, 10000);
        }
      };
      pollIntervalRef.current = setTimeout(pollDeepResearch, 10000);
      
    } catch (e) {
      console.error(e);
      setIsDeepResearching(false);
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current);
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

  const profileComplete = isProfileComplete(profile);
  const stageIndex = adviserStage ? ADVISER_STAGES.findIndex(([stage]) => stage === adviserStage.stage) : -1;
  const profileAccessBlocked = profileState === "loading" || profileState === "unauthorized";
  const chatDisabled = isSending || profileAccessBlocked;
  const deepResearchDisabled = isDeepResearching || profileAccessBlocked;
  const deepResearchLabel = profileState === "loading"
    ? "Loading profile..."
    : profileState === "unauthorized"
      ? "Sign in for Deep Research"
      : isDeepResearching ? "Research in progress..." : "Deep Research";
  const activityInProgress = isSending || isDeepResearching;

  const startNewChat = () => {
    if (activityInProgress) return;
    sessionLoadRequestRef.current += 1;
    setSessionToLoad(false);
    setSessionId(null);
    setMessages([]);
    setDebateActive(false);
  };

  const loadSession = (id) => {
    setSessionId(id);
    setSessionToLoad(id);
    setShowSessions(false);
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
                    <button style={headerBtn} onClick={startNewChat} disabled={activityInProgress}>New</button>
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
                   <div key={s.id} style={sessionItem} onClick={() => loadSession(s.id)}>
                     <div style={{color: "var(--text-primary)", fontSize: "13px", marginBottom: "4px"}}>{s.snippet}</div>
                     <div style={{color: "var(--text-muted)", fontSize: "11px"}}>{new Date(s.updatedAt).toLocaleString()}</div>
                   </div>
                 ))}
                 {sessionsList.length === 0 && <div style={{color: "var(--text-muted)", fontSize: "12px"}}>No past sessions found.</div>}
              </div>
            )}

            <div style={windowBody}>
              <div style={controlRail}>
                <span style={controlRailSignal} aria-hidden="true" />
                <div style={profileControl}>
                  <span style={controlEyebrow}>Investor profile</span>
                  {profileState === "loading" ? (
                    <span style={controlMeta} role="status">Loading...</span>
                  ) : profileState === "unauthorized" ? (
                    <a href="/login" style={signInLink}>Sign in to use adviser chat</a>
                  ) : profileState === "error" && !isEditingProfile ? (
                    <span style={controlInlineError} role="alert">
                      Profile unavailable
                      <button type="button" style={textButton} onClick={() => setProfileRefresh((value) => value + 1)}>Retry</button>
                    </span>
                  ) : profileComplete ? (
                    <button
                      type="button"
                      style={profileChip}
                      onClick={openProfileEditor}
                      aria-expanded={isEditingProfile}
                      aria-controls="adviser-profile-form"
                    >
                      {profileLabel(profile.riskTolerance, PROFILE_OPTIONS.riskTolerance)} · {profileLabel(profile.horizon, PROFILE_OPTIONS.horizon)} · {profileLabel(profile.style, PROFILE_OPTIONS.style)}
                      <span aria-hidden="true"> ↗</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={setupProfileButton}
                      onClick={openProfileEditor}
                      aria-expanded={isEditingProfile}
                      aria-controls="adviser-profile-form"
                    >
                      Set up profile
                    </button>
                  )}
                  {profileState === "saved" && <span style={savedStatus} role="status">Profile saved.</span>}
                </div>

                <div style={fullPanelControl}>
                  <span>
                    <span style={controlEyebrow}>Full Panel</span>
                    <span style={controlMeta}>4-stage debate</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={fullPanel}
                    aria-label="Use Full Panel for adviser messages"
                    disabled={isSending}
                    onClick={() => {
                      setFullPanel((enabled) => !enabled);
                      setFullPanelNotice("");
                    }}
                    style={{ ...switchTrack, ...(fullPanel ? switchTrackEnabled : {}), opacity: isSending ? 0.55 : 1 }}
                  >
                    <span aria-hidden="true" style={{ ...switchThumb, transform: fullPanel ? "translateX(16px)" : "translateX(0)" }} />
                  </button>
                </div>

                {fullPanelNotice && <div style={fullPanelStatus} role="status">{fullPanelNotice}</div>}
              </div>

              {isEditingProfile && (
                <form id="adviser-profile-form" style={profileFormPanel} onSubmit={saveProfile}>
                  <div style={profileFormHeading}>
                    <div>
                      <div style={profileFormTitle}>{profileComplete ? "Edit investor profile" : "Set up investor profile"}</div>
                      <div style={profileFormHelp}>Personalize suitability and time-horizon context. Chat remains available.</div>
                    </div>
                  </div>

                  <div style={profileFieldGrid}>
                    <label style={fieldLabel}>
                      Risk tolerance
                      <select
                        required
                        style={profileField}
                        value={profileForm.riskTolerance}
                        onChange={(event) => setProfileForm((current) => ({ ...current, riskTolerance: event.target.value }))}
                      >
                        <option value="">Select risk</option>
                        {PROFILE_OPTIONS.riskTolerance.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label style={fieldLabel}>
                      Investment horizon
                      <select
                        required
                        style={profileField}
                        value={profileForm.horizon}
                        onChange={(event) => setProfileForm((current) => ({ ...current, horizon: event.target.value }))}
                      >
                        <option value="">Select horizon</option>
                        {PROFILE_OPTIONS.horizon.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label style={fieldLabel}>
                      Investment style
                      <select
                        required
                        style={profileField}
                        value={profileForm.style}
                        onChange={(event) => setProfileForm((current) => ({ ...current, style: event.target.value }))}
                      >
                        <option value="">Select style</option>
                        {PROFILE_OPTIONS.style.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>

                  <label style={fieldLabel}>
                    Notes <span style={optionalLabel}>(optional)</span>
                    <textarea
                      style={{ ...profileField, minHeight: "64px", resize: "vertical" }}
                      value={profileForm.notes}
                      maxLength={1000}
                      placeholder="Income needs, exclusions, concentrated positions, or other context"
                      onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>

                  {profileError && <div style={profileFormError} role="alert">{profileError}</div>}
                  <div style={profileFormActions}>
                    <span style={notesCount}>{profileForm.notes.length}/1000</span>
                    <button type="button" style={profileCancelButton} onClick={cancelProfileEdit} disabled={profileState === "saving"}>Cancel</button>
                    <button type="submit" style={profileSaveButton} disabled={profileState === "saving"}>
                      {profileState === "saving" ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </form>
              )}

              {adviserStage && stageIndex >= 0 && (
                <div style={stageProgress} role="status" aria-live="polite">
                  <span style={stageProgressLabel}>Full Panel</span>
                  <div style={stageSteps}>
                    {ADVISER_STAGES.map(([stage, label], index) => (
                      <span key={stage} style={{ ...stageStep, ...(index <= stageIndex ? stageStepReached : {}) }}>
                        <span style={{ ...stageDot, ...(index === stageIndex ? stageDotActive : {}) }} aria-hidden="true" />
                        {label}
                      </span>
                    ))}
                  </div>
                  {adviserStage.total && <span style={stageAvailability}>{adviserStage.available}/{adviserStage.total} ready</span>}
                </div>
              )}

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
                          borderRadius: "0",
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
                              borderRadius: "0",
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
                              disabled={deepResearchDisabled}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                width: "100%",
                                background: "transparent",
                                border: "none",
                                padding: "10px 12px",
                                color: deepResearchDisabled ? "var(--text-muted)" : "var(--text-primary)",
                                cursor: deepResearchDisabled ? "not-allowed" : "pointer",
                                borderRadius: "0",
                                transition: "background 0.2s",
                                textAlign: "left",
                                fontSize: "13px",
                                opacity: deepResearchDisabled ? 0.5 : 1
                              }}
                              onMouseOver={(e) => { if (!deepResearchDisabled) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                              onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <Sparkles size={16} color={deepResearchDisabled ? "var(--text-muted)" : "var(--accent-purple)"} />
                              <span>{deepResearchLabel}</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <input 
                        style={{...chatInput, paddingLeft: "44px"}} 
                        placeholder={profileState === "loading" ? "Loading your profile..." : profileState === "unauthorized" ? "Sign in to use adviser chat" : "Ask a question..."}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage(inputValue)}
                        disabled={chatDisabled}
                      />
                    </div>
                    <button style={chatSendBtn} onClick={() => sendMessage(inputValue)} disabled={chatDisabled}>Send</button>
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
                      <div style={{ ...chatBubbleWrapper, alignItems: "center", opacity: 0.7 }} role="status" aria-live="polite">
                        <div style={{ background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "0", fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                           <span style={{...typingDot, background: "var(--accent-blue)", animationDelay: "0ms", width: "4px", height: "4px"}} />
                           {toolStatus}
                        </div>
                      </div>
                    )}
                    {currentSuggestions.length > 0 && !isSending && (
                      <div style={{display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px", padding: "0 4px"}}>
                        {currentSuggestions.map((s, idx) => (
                          <button key={idx} className="suggestion-chip" style={suggestionChip} onClick={() => sendMessage(s)} disabled={profileAccessBlocked}>{s}</button>
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
                            borderRadius: "0",
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
                                borderRadius: "0",
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
                                disabled={deepResearchDisabled}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  width: "100%",
                                  background: "transparent",
                                  border: "none",
                                  padding: "10px 12px",
                                  color: deepResearchDisabled ? "var(--text-muted)" : "var(--text-primary)",
                                  cursor: deepResearchDisabled ? "not-allowed" : "pointer",
                                  borderRadius: "0",
                                  transition: "background 0.2s",
                                  textAlign: "left",
                                  fontSize: "13px",
                                  opacity: deepResearchDisabled ? 0.5 : 1
                                }}
                                onMouseOver={(e) => { if (!deepResearchDisabled) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                                onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                <Sparkles size={16} color={deepResearchDisabled ? "var(--text-muted)" : "var(--accent-purple)"} />
                                <span>{deepResearchLabel}</span>
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <input 
                          className="modern-chat-input"
                          style={{...chatInput, paddingLeft: "44px"}} 
                          placeholder={profileState === "loading" ? "Loading your profile..." : profileState === "unauthorized" ? "Sign in to use adviser chat" : isDeepResearching ? "Deep Research in progress..." : "Ask your financial adviser..."}
                          value={inputValue}
                          onChange={e => setInputValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && sendMessage(inputValue)}
                          disabled={chatDisabled || isDeepResearching}
                        />
                      </div>
                      <button className="modern-chat-btn" style={{...chatSendBtn, opacity: chatDisabled ? 0.5 : 1}} onClick={() => sendMessage(inputValue)} disabled={chatDisabled}>
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
  borderRadius: "0",
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
  borderRadius: "0", padding: "4px 10px", color: "var(--text-secondary)",
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
  borderRadius: "0",
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
  "Alex Meridian": "var(--accent-blue)",
  "Viktor Hale": "var(--accent-amber)",
  "Mina Okafor": "var(--accent-green)",
  "Sam Reyes": "#ff6b8a",
  "Coordinator": "var(--accent-blue)",
  "Data Analyst": "var(--accent-green)",
  "Trading Analyst": "var(--accent-amber)",
  "Execution Analyst": "var(--accent-purple)",
  "Risk Evaluation Agent": "var(--accent-red)",
  "System": "var(--text-secondary)"
};

const controlRail = {
  position: "relative", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
  padding: "10px 16px 10px 20px", background: "rgba(0, 240, 255, 0.025)",
  borderBottom: "1px solid rgba(0, 240, 255, 0.14)", flexShrink: 0,
};
const controlRailSignal = {
  position: "absolute", inset: "0 auto 0 0", width: "3px",
  background: "linear-gradient(180deg, var(--accent-blue) 0%, var(--accent-purple) 100%)",
  boxShadow: "0 0 14px rgba(0, 240, 255, 0.35)",
};
const profileControl = { display: "flex", alignItems: "center", gap: "8px", flex: "1 1 190px", minWidth: 0, flexWrap: "wrap" };
const fullPanelControl = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flex: "0 1 128px" };
const controlEyebrow = {
  display: "block", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "10px",
  fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap",
};
const controlMeta = { display: "block", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "10px", lineHeight: 1.3 };
const profileChip = {
  maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  background: "rgba(57, 255, 20, 0.07)", border: "1px solid rgba(57, 255, 20, 0.3)",
  color: "#9cff8a", padding: "5px 8px", fontFamily: "var(--font-mono)", fontSize: "10px", cursor: "pointer",
};
const setupProfileButton = {
  background: "transparent", border: "none", borderBottom: "1px solid var(--accent-blue)",
  color: "var(--accent-blue)", padding: "3px 0", fontFamily: "var(--font-body)", fontSize: "11px", cursor: "pointer",
};
const signInLink = { ...setupProfileButton, textDecoration: "none" };
const textButton = { ...setupProfileButton, marginLeft: "7px", fontSize: "10px" };
const savedStatus = { color: "#9cff8a", fontFamily: "var(--font-body)", fontSize: "10px" };
const controlInlineError = { color: "#ff8aa2", fontFamily: "var(--font-body)", fontSize: "10px" };
const switchTrack = {
  width: "38px", height: "22px", padding: "2px", flexShrink: 0, display: "flex", alignItems: "center",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(168,185,211,0.5)", cursor: "pointer",
};
const switchTrackEnabled = { background: "rgba(0, 240, 255, 0.15)", borderColor: "var(--accent-blue)" };
const switchThumb = { display: "block", width: "16px", height: "16px", background: "var(--text-secondary)" };
const fullPanelStatus = {
  flex: "1 0 100%", color: "var(--accent-amber)", fontFamily: "var(--font-body)", fontSize: "11px", lineHeight: 1.4,
  paddingLeft: "2px",
};
const profileFormPanel = {
  padding: "14px 16px", background: "rgba(10,11,16,0.98)", borderBottom: "1px solid rgba(178,0,255,0.28)",
  display: "flex", flexDirection: "column", gap: "12px", maxHeight: "330px", overflowY: "auto", flexShrink: 0,
};
const profileFormHeading = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" };
const profileFormTitle = { color: "var(--text-primary)", fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 700 };
const profileFormHelp = { color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "10px", lineHeight: 1.4, marginTop: "4px" };
const profileFieldGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" };
const fieldLabel = { display: "flex", flexDirection: "column", gap: "5px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px" };
const optionalLabel = { color: "var(--text-muted)", fontSize: "10px" };
const profileField = {
  width: "100%", background: "var(--bg-surface)", border: "1px solid rgba(168,185,211,0.38)", color: "var(--text-primary)",
  padding: "9px 10px", fontFamily: "var(--font-body)", fontSize: "12px", lineHeight: 1.3,
};
const profileFormError = { color: "#ff8aa2", fontFamily: "var(--font-body)", fontSize: "11px", lineHeight: 1.4 };
const profileFormActions = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" };
const notesCount = { marginRight: "auto", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "9px" };
const profileCancelButton = {
  background: "transparent", border: "1px solid rgba(168,185,211,0.42)", color: "var(--text-secondary)",
  padding: "7px 10px", fontFamily: "var(--font-body)", fontSize: "11px", cursor: "pointer",
};
const profileSaveButton = {
  background: "var(--accent-blue)", border: "1px solid var(--accent-blue)", color: "#020203",
  padding: "7px 11px", fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 700, cursor: "pointer",
};
const stageProgress = {
  display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px", flexShrink: 0,
  background: "rgba(178,0,255,0.06)", borderBottom: "1px solid rgba(178,0,255,0.2)", overflowX: "auto",
};
const stageProgressLabel = { color: "#d38cff", fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" };
const stageSteps = { display: "flex", alignItems: "center", gap: "9px", minWidth: "max-content" };
const stageStep = { display: "flex", alignItems: "center", gap: "4px", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "9px" };
const stageStepReached = { color: "var(--text-secondary)" };
const stageDot = { width: "5px", height: "5px", background: "rgba(168,185,211,0.35)", flexShrink: 0 };
const stageDotActive = { background: "var(--accent-blue)", boxShadow: "0 0 8px rgba(0,240,255,0.65)" };
const stageAvailability = { marginLeft: "auto", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", whiteSpace: "nowrap" };

const debateSplash = { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", gap: "16px", flex: 1 };
const debateSplashIcon = { fontSize: "48px", opacity: 0.8 };
const debateSplashTitle = { color: "var(--text-primary)", fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700 };
const debateSplashDesc = { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "13px", textAlign: "center", lineHeight: 1.6 };

const chatInputWrap = { display: "flex", gap: "8px", width: "100%" };
const chatInput = {
  flex: 1, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0", padding: "14px 20px", color: "var(--text-primary)", fontFamily: "var(--font-body)",
  fontSize: "14px", outline: "none", transition: "all 0.3s ease",
  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)"
};
const chatSendBtn = {
  background: "linear-gradient(135deg, var(--accent-blue) 0%, #a259ff 100%)", color: "#fff", border: "none", 
  borderRadius: "0", width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", 
  boxShadow: "0 4px 12px rgba(79, 141, 255, 0.4)", flexShrink: 0
};

const chatScroll = { display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", padding: "20px 24px", flex: 1, scrollBehavior: "smooth" };
const chatBubbleWrapper = { display: "flex", flexDirection: "column", gap: "6px", width: "100%" };
const chatAgentLabel = { fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, letterSpacing: "0.02em" };
const chatBubble = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "0", padding: "14px 20px",
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "14px", lineHeight: 1.6,
  whiteSpace: "pre-wrap", boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", maxWidth: "90%"
};

const typingDot = { width: "6px", height: "6px", background: "currentColor", borderRadius: "0", animation: "pulse 1.5s infinite" };

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
