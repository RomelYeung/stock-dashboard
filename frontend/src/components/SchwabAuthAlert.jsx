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

export default function SchwabAuthAlert() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [authState, setAuthState] = useState("idle");
  const [authMessage, setAuthMessage] = useState("");
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

  if (!showBanner) return null;

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

  return (
    <>
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
          <button
            className="schwab-dismiss-btn"
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            {CLOSE_ICON}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes schwab-pill-in {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
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
    borderRadius: "9999px",
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
