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
            <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
              <path d="M2 14l4-4 3 3 4-5 4 2" stroke="var(--accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="2" cy="14" r="1.5" fill="var(--accent-green)" />
              <circle cx="18" cy="10" r="1.5" fill="var(--accent-green)" />
            </svg>
            <span style={styles.logoText}>Portfolio Monitor</span>
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
    background: "rgba(13, 18, 32, 0.85)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "20px",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
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
    fontSize: "17px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  subtitle: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    textAlign: "center",
    marginTop: "-8px",
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
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    fontWeight: 500,
  },
  input: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    padding: "10px 14px",
    outline: "none",
    transition: "border-color 0.15s",
    width: "100%",
  },
  error: {
    background: "var(--accent-red-dim)",
    border: "1px solid rgba(255,77,109,0.2)",
    borderRadius: "8px",
    color: "var(--accent-red)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    padding: "8px 12px",
  },
  submitBtn: {
    background: "var(--accent-blue)",
    border: "none",
    borderRadius: "10px",
    color: "white",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    fontWeight: 500,
    padding: "11px 0",
    transition: "opacity 0.15s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "42px",
  },
  submitBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "white",
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
    fontFamily: "var(--font-body)",
    fontSize: "12px",
  },
  switchBtn: {
    background: "none",
    border: "none",
    color: "var(--accent-blue)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    fontWeight: 500,
    padding: 0,
    textDecoration: "underline",
  },
};
