import { useParams, useNavigate } from "react-router-dom";
import StockAnalysisPage from "../components/StockAnalysisPage";
import ErrorBoundary from "../components/ErrorBoundary";

export default function StockAnalysisPageRoute({ liveData }) {
  const { ticker } = useParams();
  const navigate = useNavigate();

  // Gracefully handle a missing ticker param.
  if (!ticker) {
    return (
      <div style={styles.empty}>
        <h2 style={styles.emptyTitle}>No ticker selected</h2>
        <p style={styles.emptyText}>
          Choose a stock from your portfolio to view its full analysis.
        </p>
        <button style={styles.backBtn} onClick={() => navigate("/")}>
          Back to Portfolio
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <StockAnalysisPage
        ticker={ticker}
        livePriceData={liveData?.[ticker]}
        onBack={() => navigate(-1)}
      />
    </ErrorBoundary>
  );
}

const styles = {
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    justifyContent: "center",
    minHeight: "200px",
    textAlign: "center",
  },
  emptyTitle: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 600,
  },
  emptyText: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    maxWidth: "320px",
  },
  backBtn: {
    marginTop: "8px",
    background: "rgba(0,240,255,0.05)",
    border: "1px solid var(--accent-blue)",
    borderRadius: "0",
    color: "var(--accent-blue)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    padding: "8px 16px",
    textTransform: "uppercase",
  },
};
