import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    if (mode === "register" && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      <div style={styles.wrapper}>
        <div style={styles.card}>
          {/* Logo */}
          <div style={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
              <polygon points="10,10 90,10 90,40 50,80 10,40" stroke="var(--accent-blue)" strokeWidth="4" fill="rgba(0,240,255,0.1)" />
              <polygon points="10,40 50,80 90,40" fill="var(--accent-blue)" opacity="0.5" />
              <line x1="20" y1="20" x2="80" y2="20" stroke="var(--accent-blue)" strokeWidth="4" />
              <line x1="50" y1="20" x2="50" y2="70" stroke="var(--accent-blue)" strokeWidth="4" />
            </svg>
            <span style={styles.logoText}>DUMB_MONEY.ST</span>
          </div>

          <p style={styles.subtitle}>
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </p>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                style={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                style={styles.input}
                placeholder={mode === "login" ? "Enter your password" : "At least 6 characters"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {mode === "register" && (
              <div style={styles.field}>
                <label style={styles.label} htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  style={styles.input}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                />
              </div>
            )}

            {error && <div style={styles.error}>{error}</div>}

            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                ...(submitting ? styles.submitBtnDisabled : {}),
              }}
              disabled={submitting}
            >
              {submitting ? (
                <span style={styles.spinner} />
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div style={styles.switch}>
            <span style={styles.switchText}>
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}
            </span>
            <button
              style={styles.switchBtn}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "24px",
    position: "relative",
    zIndex: 1,
  },
  card: {
    background: "rgba(10, 11, 16, 0.95)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid var(--accent-blue)",
    borderRadius: "0",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    boxShadow: "0 0 30px rgba(0, 240, 255, 0.1)",
    position: "relative",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },
  logoText: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "20px",
    fontWeight: 700,
    letterSpacing: "0.1em",
  },
  subtitle: {
    color: "var(--accent-blue)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    textAlign: "center",
    marginTop: "-8px",
    textTransform: "uppercase",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    fontWeight: 500,
    textTransform: "uppercase",
  },
  input: {
    background: "rgba(0, 240, 255, 0.05)",
    border: "1px solid var(--glass-border)",
    borderRadius: "0",
    color: "var(--accent-blue)",
    fontFamily: "var(--font-mono)",
    fontSize: "16px",
    padding: "10px 14px",
    outline: "none",
    transition: "all 0.15s",
    width: "100%",
  },
  error: {
    background: "rgba(255, 0, 60, 0.1)",
    border: "1px solid var(--accent-red)",
    borderRadius: "0",
    color: "var(--accent-red)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    padding: "8px 12px",
    textTransform: "uppercase",
  },
  submitBtn: {
    background: "var(--glass-bg)",
    border: "1px solid var(--accent-blue)",
    borderRadius: "0",
    color: "var(--accent-blue)",
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    fontSize: "14px",
    fontWeight: 700,
    padding: "11px 0",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "42px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  submitBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid rgba(0, 240, 255, 0.3)",
    borderTopColor: "var(--accent-blue)",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
  switch: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
  },
  switchText: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    textTransform: "uppercase",
  },
  switchBtn: {
    background: "none",
    border: "none",
    color: "var(--accent-blue)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    fontWeight: 700,
    padding: 0,
    textDecoration: "underline",
    textTransform: "uppercase",
  },
};
