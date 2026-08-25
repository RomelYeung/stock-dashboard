export default function AdviserPage() {
  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>AI Financial Adviser</h2>
      <p style={styles.text}>
        The AI Financial Adviser experience is coming in Phase 3. This route is
        wired up for deep-linking but its full content is not yet available.
      </p>
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    justifyContent: "center",
    minHeight: "200px",
    textAlign: "center",
  },
  title: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 600,
  },
  text: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    maxWidth: "420px",
    margin: "0 auto",
    lineHeight: 1.5,
  },
};
