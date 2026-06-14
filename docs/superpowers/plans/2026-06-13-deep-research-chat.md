# Deep Research Chat Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimalistic tools menu to the AI Financial Adviser chat input to trigger and poll a "Deep Research" process, injecting the result into the chat.

**Architecture:** We will add state variables to `AIFinancialAdviserChat.jsx` to manage the popover visibility and polling status. We will use a `useEffect` hook with `setInterval` to poll the status endpoint while research is active. We will update the UI to include the `+` button, the popover menu, and an in-progress indicator.

**Tech Stack:** React, Framer Motion, Fetch API.

---

### Task 1: Add State and Polling Logic

**Files:**
- Modify: `frontend/src/components/AIFinancialAdviserChat.jsx`

- [ ] **Step 1: Add state variables**
Add the following state variables near the top of the component:
```javascript
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [deepResearchInteractionId, setDeepResearchInteractionId] = useState(null);
```

- [ ] **Step 2: Add Deep Research trigger function**
Add the function to start the deep research:
```javascript
  const startDeepResearch = async () => {
    setShowToolsMenu(false);
    setIsDeepResearching(true);
    setDeepResearchInteractionId(null);
    
    try {
      const res = await fetch(`/api/ai/deep-research/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ticker, 
          prompt: `Generate a deep research report on ${ticker}` 
        })
      });
      const data = await res.json();
      if (data.interactionId) {
        setDeepResearchInteractionId(data.interactionId);
      } else {
        setIsDeepResearching(false);
        setMessages(prev => [...prev, { role: "model", agent: "System", text: "Failed to start deep research." }]);
      }
    } catch (err) {
      console.error(err);
      setIsDeepResearching(false);
      setMessages(prev => [...prev, { role: "model", agent: "System", text: "Error connecting to deep research service." }]);
    }
  };
```

- [ ] **Step 3: Add polling `useEffect`**
Add the effect to poll the status:
```javascript
  useEffect(() => {
    let interval;
    if (isDeepResearching && deepResearchInteractionId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/ai/deep-research/status/${deepResearchInteractionId}`);
          const data = await res.json();
          if (data.status === 'completed') {
            setIsDeepResearching(false);
            setDeepResearchInteractionId(null);
            clearInterval(interval);
            setMessages(prev => [...prev, { role: 'model', agent: 'Deep Research', text: data.result }]);
            // Try to play a subtle beep
            try {
              const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
              const oscillator = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              oscillator.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              oscillator.type = 'sine';
              oscillator.frequency.value = 800;
              gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
              oscillator.start();
              gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
              oscillator.stop(audioCtx.currentTime + 0.5);
            } catch (e) { /* ignore audio errors */ }
          } else if (data.status === 'failed') {
            setIsDeepResearching(false);
            setDeepResearchInteractionId(null);
            clearInterval(interval);
            setMessages(prev => [...prev, { role: "model", agent: "System", text: "Deep research failed." }]);
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isDeepResearching, deepResearchInteractionId]);
```

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/AIFinancialAdviserChat.jsx
git commit -m "feat: add deep research state and polling logic"
```

### Task 2: Update UI for Tools Menu and Indicator

**Files:**
- Modify: `frontend/src/components/AIFinancialAdviserChat.jsx`

- [ ] **Step 1: Update chat input wrapper**
Change the input wrapper to relative and add the `+` button inside it.
Find:
```javascript
                    <div style={{display: "flex", gap: "12px", width: "100%", alignItems: "center"}}>
                      <input 
                        className="modern-chat-input"
                        style={chatInput} 
```
Replace with:
```javascript
                    {isDeepResearching && (
                      <div style={{ fontSize: "12px", color: "var(--accent-blue)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{...typingDot, background: "var(--accent-blue)", animationDelay: "0ms", width: "6px", height: "6px"}} />
                        Deep Research in progress...
                      </div>
                    )}
                    <div style={{display: "flex", gap: "12px", width: "100%", alignItems: "center"}}>
                      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                        <button 
                          className="tools-menu-btn"
                          style={{
                            position: "absolute", left: "12px", background: "transparent", border: "none",
                            color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center",
                            justifyContent: "center", width: "24px", height: "24px", borderRadius: "50%",
                            transition: "all 0.2s", zIndex: 2
                          }}
                          onClick={() => setShowToolsMenu(!showToolsMenu)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                        
                        <AnimatePresence>
                          {showToolsMenu && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              style={{
                                position: "absolute", bottom: "100%", left: "0", marginBottom: "12px",
                                background: "rgba(30,30,30,0.95)", border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "12px", padding: "8px", zIndex: 10,
                                backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                                minWidth: "160px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
                              }}
                            >
                              <button
                                style={{
                                  width: "100%", background: "transparent", border: "none", padding: "10px 12px",
                                  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "13px",
                                  textAlign: "left", cursor: "pointer", borderRadius: "6px", transition: "background 0.2s",
                                  display: "flex", alignItems: "center", gap: "8px"
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                onClick={startDeepResearch}
                                disabled={isDeepResearching}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                Deep Research
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <input 
                          className="modern-chat-input"
                          style={{...chatInput, paddingLeft: "44px"}} 
```

- [ ] **Step 2: Add CSS for tools button hover**
In `frontend/src/styles/index.css`, add:
```css
.tools-menu-btn:hover {
  background: rgba(255, 255, 255, 0.1) !important;
  color: var(--text-primary) !important;
}
```

- [ ] **Step 3: Add Deep Research Agent Color**
In `AIFinancialAdviserChat.jsx`, update `agentColors`:
```javascript
const agentColors = {
  "Coordinator": "var(--accent-blue)",
  "Data Analyst": "var(--accent-green)",
  "Trading Analyst": "var(--accent-amber)",
  "Execution Analyst": "var(--accent-purple)",
  "Risk Evaluation Agent": "var(--accent-red)",
  "Deep Research": "var(--accent-purple)",
  "System": "var(--text-secondary)"
};
```

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/AIFinancialAdviserChat.jsx frontend/src/styles/index.css
git commit -m "feat: add tools menu UI for deep research"
```

### Task 3: Release Notes

**Files:**
- Modify: `frontend/public/release-notes.html`

- [ ] **Step 1: Add release note entry**
Add an entry for the new Deep Research feature in the current month section.

- [ ] **Step 2: Commit**
```bash
git add frontend/public/release-notes.html
git commit -m "docs: add release note for deep research chat tool"
```
