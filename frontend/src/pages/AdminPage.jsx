import AdminDashboard from "../components/AdminDashboard";
import ErrorBoundary from "../components/ErrorBoundary";
import { useAuth } from "../context/AuthContext";

export default function AdminPage() {
  const { user } = useAuth();

  return (
    <ErrorBoundary>
      {user?.role === "ADMIN" ? (
        <AdminDashboard />
      ) : (
        <div style={styles.forbidden}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" opacity={0.3}>
            <circle cx="16" cy="16" r="14" stroke="var(--accent-red)" strokeWidth="1.5" />
            <path d="M12 20l8-8M20 20l-8-8" stroke="var(--accent-red)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h2 style={styles.forbiddenTitle}>Access Denied</h2>
          <p style={styles.forbiddenText}>You do not have permission to access the admin dashboard.</p>
        </div>
      )}
    </ErrorBoundary>
  );
}

const styles = {
  forbidden: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    justifyContent: "center",
    minHeight: "200px",
    textAlign: "center",
  },
  forbiddenTitle: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  forbiddenText: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    lineHeight: "1.5",
    maxWidth: "320px",
  },
};
