import { motion } from "framer-motion";

const sessionIcons = {
  open: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <circle cx="5" cy="5" r="4" fill="currentColor" />
    </svg>
  ),
  "pre-market": (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 1v5M5 1L2 4M5 1l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  "after-hours": (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 9V4M5 9L2 6M5 9l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  closed: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  ),
};

/**
 * Visual badge indicating the current market session state.
 *
 * @param {object}  props
 * @param {object}  props.status  - Market status from getMarketStatus()
 * @param {'card'|'header'} [props.variant='card'] - Display variant
 */
export default function MarketSessionBadge({ status, variant = "card" }) {
  if (!status) return null;

  const icon = sessionIcons[status.session] || sessionIcons.closed;
  const isCard = variant === "card";

  const style = isCard ? cardStyles : headerStyles;

  return (
    <motion.div
      style={style.wrapper}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <span style={{ ...style.dot, color: status.badgeColor }}>{icon}</span>
      <span style={{ ...style.label, color: status.badgeColor }}>{status.label}</span>
    </motion.div>
  );
}

const cardStyles = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 10px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.04)",
    width: "fit-content",
    position: "relative",
    zIndex: 1,
  },
  dot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "10px",
    height: "10px",
  },
  label: {
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    fontWeight: 400,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
};

const headerStyles = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "4px 12px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  dot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "10px",
    height: "10px",
  },
  label: {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: 400,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
};
