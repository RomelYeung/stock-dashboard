import { useState, useEffect, useCallback, useRef } from "react";

const WARNING_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M8 2L14 13H2L8 2Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M8 6V8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="8" cy="11" r="0.6" fill="currentColor" />
  </svg>
);

const CLOSE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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
      setError(null);
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
    setAuthMessage("Waiting for authorization...");

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
          setAuthMessage("Authorization did not complete. Please try again.");
        }
      }, 3000);
    } catch (err) {
      setAuthState("error");
      setAuthMessage(err.message);
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
  let messageColor = "var(--text-secondary)";
  let iconColor;

  if (inAuthFlow) {
    displayMessage = authMessage;
    if (authState === "success") messageColor = "var(--accent-green)";
    else if (authState === "error") messageColor = "var(--accent-red)";
    iconColor = messageColor;
  } else if (error) {
    displayMessage = error;
    messageColor = "var(--accent-red)";
    iconColor = messageColor;
  } else if (status === "expired") {
    displayMessage =
      "Schwab connection expired. Re-authorize to restore real-time market data.";
    iconColor = "var(--accent-red)";
  } else {
    displayMessage =
      "Schwab connection expiring soon. Re-authorize to avoid interruption.";
    iconColor = "var(--accent-amber)";
  }

  const isSuccess = authState === "success";
  const showActions = !inAuthFlow || authState === "error";

  return (
    <>
      <div style={styles.banner}>
        <div style={styles.bannerInner}>
          {/* Left: icon + message */}
          <div style={styles.left}>
            <span style={{ ...styles.icon, color: iconColor }}>{WARNING_ICON}</span>
            <span
              style={{
                ...styles.message,
                color: messageColor,
                ...(isSuccess ? styles.messageSuccess : {}),
              }}
            >
              {displayMessage}
            </span>
          </div>

          {/* Right: actions */}
          <div style={styles.actions}>
            {showActions && (
              <button style={styles.authBtn} onClick={handleAuthorize}>
                Authorize with Schwab
              </button>
            )}
            <button
              style={styles.dismissBtn}
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              {CLOSE_ICON}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes schwab-banner-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

const styles = {
  banner: {
    animation: "schwab-banner-in 0.25s ease-out",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    background: "rgba(5, 8, 15, 0.85)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    position: "relative",
    zIndex: 60,
    width: "100%",
  },
  bannerInner: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    margin: "0 auto",
    maxWidth: "1400px",
    padding: "10px 32px",
    gap: "16px",
  },
  left: {
    alignItems: "center",
    display: "flex",
    gap: "10px",
    flex: "1 1 auto",
    minWidth: 0,
  },
  icon: {
    display: "flex",
    flexShrink: 0,
  },
  message: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    lineHeight: "1.5",
  },
  messageSuccess: {
    fontWeight: 500,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: "8px",
    flexShrink: 0,
  },
  authBtn: {
    alignItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(79, 141, 255, 0.3)",
    borderRadius: "8px",
    color: "var(--accent-blue)",
    cursor: "pointer",
    display: "flex",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    fontWeight: 500,
    gap: "6px",
    padding: "6px 12px",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  dismissBtn: {
    alignItems: "center",
    background: "transparent",
    border: "none",
    borderRadius: "6px",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    padding: "4px",
    transition: "color 0.15s",
  },
};
