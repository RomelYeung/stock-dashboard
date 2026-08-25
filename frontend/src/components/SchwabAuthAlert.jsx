import { useState, useEffect, useCallback, useRef } from "react";

const WARNING_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M8 2L14 13H2L8 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
  </svg>
);

const SUCCESS_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.5 8l2 2 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SPINNER_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="schwab-spinner">
    <circle cx="8" cy="8" r="6.5" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1.5" />
    <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CLOSE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const INFO_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="4.5" r="0.75" fill="currentColor" />
  </svg>
);

const CLIPBOARD_ICON = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path
      d="M10.5 2.5H12a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H4a1.5 1.5 0 01-1.5-1.5V4A1.5 1.5 0 014 2.5h1.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <rect x="5.5" y="1" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export default function SchwabAuthAlert() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [authState, setAuthState] = useState("idle");
  const [authMessage, setAuthMessage] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState(null);
  const aggressiveRef = useRef(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/stocks/schwab/health");
      if (!res.ok) throw new Error("Schwab health check failed");
      const data = await res.json();
      setStatus(data.status);
      setError(data.error || null);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  // Poll health every 60s; also check immediately on mount
  useEffect(() => {
    checkHealth();
    const id = setInterval(() => {
      checkHealth();
      setDismissed(false);
    }, 60000);
    return () => clearInterval(id);
  }, [checkHealth]);

  // Cleanup aggressive polling on unmount
  useEffect(() => {
    return () => {
      if (aggressiveRef.current) clearInterval(aggressiveRef.current);
    };
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    if (!showManualModal) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowManualModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showManualModal]);

  const handleAuthorize = async () => {
    if (aggressiveRef.current) clearInterval(aggressiveRef.current);

    setDismissed(false);
    setAuthState("waiting");
    setAuthMessage("Connecting...");

    try {
      const authRes = await fetch("/api/stocks/schwab/auth");
      if (!authRes.ok) throw new Error("Failed to get authorization URL");
      const { authUrl } = await authRes.json();
      window.open(authUrl, "_blank");

      let pollCount = 0;
      aggressiveRef.current = setInterval(async () => {
        pollCount++;
        const data = await checkHealth();

        if (data && data.status === "healthy") {
          clearInterval(aggressiveRef.current);
          aggressiveRef.current = null;
          setAuthState("success");
          setAuthMessage("Connected!");
          setDismissed(false);
          setTimeout(() => {
            setAuthState("idle");
            setAuthMessage("");
          }, 3000);
        } else if (pollCount >= 40) {
          clearInterval(aggressiveRef.current);
          aggressiveRef.current = null;
          setAuthState("error");
          setAuthMessage("Auth failed");
        }
      }, 3000);
    } catch (err) {
      setAuthState("error");
      setAuthMessage("Auth failed");
    }
  };

  const handleManualExchange = async (e) => {
    if (e) e.preventDefault();
    if (!manualInput.trim()) return;

    setManualSubmitting(true);
    setManualError(null);

    try {
      const res = await fetch("/api/stocks/schwab/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: manualInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to exchange authorization code");
      }

      if (aggressiveRef.current) {
        clearInterval(aggressiveRef.current);
        aggressiveRef.current = null;
      }

      setShowManualModal(false);
      setManualInput("");
      setAuthState("success");
      setAuthMessage("Connected!");
      setStatus(data.health?.status || "healthy");
      setError(null);
      setDismissed(false);

      setTimeout(() => {
        setAuthState("idle");
        setAuthMessage("");
      }, 3000);
    } catch (err) {
      setManualError(err.message);
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (aggressiveRef.current) {
      clearInterval(aggressiveRef.current);
      aggressiveRef.current = null;
    }
    setAuthState("idle");
    setAuthMessage("");
    setDismissed(true);
  };

  // Determine visibility
  const inAuthFlow = authState !== "idle";
  const isUnhealthy = status === "expired" || status === "expiring";
  const showBanner = inAuthFlow || (isUnhealthy && !dismissed) || (error && !dismissed);

  if (!showBanner && !showManualModal) return null;

  // Determine what to display
  let displayMessage;
  let messageColor = "var(--text-primary)";
  let iconColor;
  let icon = WARNING_ICON;

  if (inAuthFlow) {
    displayMessage = authMessage;
    if (authState === "success") {
      messageColor = "var(--accent-green)";
      iconColor = "var(--accent-green)";
      icon = SUCCESS_ICON;
    } else if (authState === "error") {
      messageColor = "var(--accent-red)";
      iconColor = "var(--accent-red)";
      icon = WARNING_ICON;
    } else {
      messageColor = "var(--text-primary)";
      iconColor = "var(--accent-blue)";
      icon = SPINNER_ICON;
    }
  } else if (error) {
    displayMessage = "Schwab credentials invalid or expired";
    messageColor = "var(--accent-red)";
    iconColor = "var(--accent-red)";
    icon = WARNING_ICON;
  } else if (status === "expired") {
    displayMessage = "Schwab connection expired";
    iconColor = "var(--accent-red)";
    icon = WARNING_ICON;
  } else {
    displayMessage = "Schwab connection expiring soon";
    iconColor = "var(--accent-amber)";
    icon = WARNING_ICON;
  }

  const showActions = !inAuthFlow || authState === "error";
  const showManualButton = inAuthFlow || status === "expired" || authState === "error" || error;

  return (
    <>
      {showBanner && (
        <div style={styles.pill} className="schwab-pill-container">
          <div style={styles.left}>
            <span style={{ ...styles.icon, color: iconColor }}>{icon}</span>
            <span style={{ ...styles.message, color: messageColor }}>
              {displayMessage}
            </span>
          </div>

          <div style={styles.actions}>
            {showActions && (
              <button className="schwab-auth-btn" onClick={handleAuthorize}>
                {authState === "error" ? "Retry" : "Authorize"}
              </button>
            )}
            {showManualButton && (
              <button
                className="schwab-manual-btn"
                onClick={() => {
                  setShowManualModal(true);
                  setManualError(null);
                }}
                title="Paste Schwab callback URL or authorization code"
              >
                {CLIPBOARD_ICON}
                <span>Paste URL</span>
              </button>
            )}
            <button
              className="schwab-dismiss-btn"
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              {CLOSE_ICON}
            </button>
          </div>
        </div>
      )}

      {/* Manual URL / Code Modal */}
      {showManualModal && (
        <div
          className="schwab-modal-backdrop"
          onClick={() => setShowManualModal(false)}
        >
          <div
            className="schwab-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schwab-modal-title"
          >
            <div className="schwab-modal-header">
              <div className="schwab-modal-title-wrap">
                <h3 id="schwab-modal-title" className="schwab-modal-title">
                  Charles Schwab Authorization
                </h3>
                <span className="schwab-modal-subtitle">
                  Manual Callback Exchange
                </span>
              </div>
              <button
                className="schwab-modal-close"
                onClick={() => setShowManualModal(false)}
                aria-label="Close modal"
              >
                {CLOSE_ICON}
              </button>
            </div>

            <div className="schwab-tip-box">
              <div className="schwab-tip-icon">{INFO_ICON}</div>
              <p className="schwab-tip-text">
                If Schwab redirects to a self-signed certificate warning (e.g. 127.0.0.1), you can either click <strong>Advanced &gt; Proceed</strong>, or copy the URL from your browser address bar and paste it here.
              </p>
            </div>

            <form onSubmit={handleManualExchange} className="schwab-modal-form">
              <label className="schwab-modal-label" htmlFor="schwab-manual-code-input">
                Callback URL or Authorization Code:
              </label>
              <input
                id="schwab-manual-code-input"
                type="text"
                className="schwab-modal-input"
                placeholder="https://127.0.0.1:3000/?code=... or authorization code"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                autoFocus
              />

              {manualError && (
                <div className="schwab-modal-error">
                  {WARNING_ICON}
                  <span>{manualError}</span>
                </div>
              )}

              <div className="schwab-modal-actions">
                <button
                  type="button"
                  className="schwab-modal-btn-secondary"
                  onClick={() => setShowManualModal(false)}
                  disabled={manualSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="schwab-modal-btn-primary"
                  disabled={manualSubmitting || !manualInput.trim()}
                >
                  {manualSubmitting ? (
                    <>
                      {SPINNER_ICON}
                      <span>Exchanging...</span>
                    </>
                  ) : (
                    "Submit"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes schwab-pill-in {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes schwab-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes schwab-scale-up {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes schwab-spin {
          to { transform: rotate(360deg); }
        }
        .schwab-spinner {
          animation: schwab-spin 0.8s linear infinite;
        }
        .schwab-auth-btn {
          align-items: center;
          background: rgba(79, 141, 255, 0.12);
          border: 1px solid rgba(79, 141, 255, 0.25);
          border-radius: 9999px;
          color: var(--accent-blue);
          cursor: pointer;
          display: flex;
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 600;
          padding: 5px 12px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(79, 141, 255, 0.15);
        }
        .schwab-auth-btn:hover {
          background: rgba(79, 141, 255, 0.2);
          border-color: rgba(79, 141, 255, 0.4);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 141, 255, 0.25);
        }
        .schwab-auth-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(79, 141, 255, 0.15);
        }
        .schwab-manual-btn {
          align-items: center;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 9999px;
          color: var(--text-primary);
          cursor: pointer;
          display: inline-flex;
          gap: 5px;
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 500;
          padding: 5px 11px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
        }
        .schwab-manual-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
          color: #fff;
          transform: translateY(-1px);
        }
        .schwab-manual-btn:active {
          transform: translateY(0);
        }
        .schwab-dismiss-btn {
          align-items: center;
          background: transparent;
          border: none;
          border-radius: 9999px;
          color: var(--text-secondary);
          cursor: pointer;
          display: flex;
          padding: 6px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .schwab-dismiss-btn:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.1);
          transform: scale(1.05);
        }
        .schwab-dismiss-btn:active {
          transform: scale(0.95);
        }
        
        /* Modal Styles */
        .schwab-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(5, 8, 15, 0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: schwab-fade-in 0.2s ease-out;
        }
        .schwab-modal-card {
          background: rgba(10, 14, 23, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7), 0 1px 2px rgba(255, 255, 255, 0.1) inset;
          width: 100%;
          max-width: 520px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: schwab-scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .schwab-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .schwab-modal-title-wrap {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .schwab-modal-title {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .schwab-modal-subtitle {
          font-family: var(--font-body);
          font-size: 12px;
          color: var(--accent-blue);
          font-weight: 500;
        }
        .schwab-modal-close {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .schwab-modal-close:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.08);
        }
        .schwab-tip-box {
          display: flex;
          gap: 12px;
          background: rgba(79, 141, 255, 0.08);
          border: 1px solid rgba(79, 141, 255, 0.2);
          border-radius: 10px;
          padding: 12px 14px;
          color: var(--text-primary);
        }
        .schwab-tip-icon {
          color: var(--accent-blue);
          flex-shrink: 0;
          margin-top: 2px;
        }
        .schwab-tip-text {
          font-family: var(--font-body);
          font-size: 12.5px;
          line-height: 1.5;
          margin: 0;
          color: #c0cddf;
        }
        .schwab-tip-text strong {
          color: var(--text-primary);
          font-weight: 600;
        }
        .schwab-modal-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .schwab-modal-label {
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .schwab-modal-input {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: var(--text-primary);
          font-family: var(--font-mono, monospace);
          font-size: 12.5px;
          padding: 10px 14px;
          width: 100%;
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .schwab-modal-input:focus {
          border-color: var(--accent-blue);
          background: rgba(255, 255, 255, 0.07);
          box-shadow: 0 0 0 2px rgba(79, 141, 255, 0.2);
        }
        .schwab-modal-input::placeholder {
          color: var(--text-muted);
          opacity: 0.6;
        }
        .schwab-modal-error {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 77, 109, 0.1);
          border: 1px solid rgba(255, 77, 109, 0.25);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--accent-red);
          font-family: var(--font-body);
        }
        .schwab-modal-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
          margin-top: 4px;
        }
        .schwab-modal-btn-secondary {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: var(--text-secondary);
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 500;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .schwab-modal-btn-secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-primary);
        }
        .schwab-modal-btn-primary {
          background: #4f8dff;
          border: none;
          border-radius: 8px;
          color: #ffffff;
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 600;
          padding: 8px 18px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
          box-shadow: 0 4px 14px rgba(79, 141, 255, 0.3);
        }
        .schwab-modal-btn-primary:hover:not(:disabled) {
          background: #3b7ced;
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(79, 141, 255, 0.4);
        }
        .schwab-modal-btn-primary:disabled,
        .schwab-modal-btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        @media (max-width: 640px) {
          .schwab-pill-container {
            left: 16px !important;
            bottom: 16px !important;
            max-width: calc(100vw - 32px) !important;
          }
        }
      `}</style>
    </>
  );
}

const styles = {
  pill: {
    position: "fixed",
    bottom: "24px",
    left: "24px",
    zIndex: 9999,
    animation: "schwab-pill-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    background: "rgba(10, 14, 23, 0.8)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "0",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(255, 255, 255, 0.1) inset",
    display: "flex",
    alignItems: "center",
    padding: "8px 10px 8px 16px",
    gap: "14px",
    maxWidth: "calc(100vw - 48px)",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  },
  icon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  message: {
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: "500",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    letterSpacing: "0.01em",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
};
