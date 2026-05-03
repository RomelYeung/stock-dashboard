import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "40px",
          color: "var(--accent-red)",
          fontFamily: "var(--font-body)",
          background: "var(--bg-base)",
          minHeight: "100vh",
        }}>
          <h2>Something went wrong</h2>
          <pre style={{ fontSize: "12px", marginTop: "16px", color: "var(--text-secondary)" }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: "16px",
              padding: "8px 16px",
              background: "var(--accent-red-dim)",
              border: "1px solid var(--accent-red)",
              borderRadius: "6px",
              color: "var(--accent-red)",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
