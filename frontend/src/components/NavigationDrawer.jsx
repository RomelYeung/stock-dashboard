import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { label: "Portfolio", path: "/", match: (p) => p === "/" || p.startsWith("/stock") },
  { label: "Market Indicators", path: "/indicators", match: (p) => p.startsWith("/indicators") },
  { label: "Guru Tracker", path: "/gurus", match: (p) => p.startsWith("/gurus") },
  // AdviserPage, GuruPage, and SecPage are intentionally NOT exposed here until Phase 3.
];

export default function NavigationDrawer({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const pathname = location.pathname;

  const handleNavigate = (path) => {
    navigate(path);
    onClose();
  };

  const isActive = (item) => item.match(pathname);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.drawerBackdrop}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            style={styles.drawer}
          >
            <div style={styles.drawerHeader}>
              <div style={styles.logo}>
                <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
                  <polygon points="10,10 90,10 90,40 50,80 10,40" stroke="var(--accent-blue)" strokeWidth="4" fill="rgba(0,240,255,0.1)" />
                  <polygon points="10,40 50,80 90,40" fill="var(--accent-blue)" opacity="0.5" />
                  <line x1="20" y1="20" x2="80" y2="20" stroke="var(--accent-blue)" strokeWidth="4" />
                  <line x1="50" y1="20" x2="50" y2="70" stroke="var(--accent-blue)" strokeWidth="4" />
                </svg>
                <span style={styles.logoText}>DUMB_MONEY.ST</span>
              </div>
              <button style={styles.drawerClose} onClick={onClose}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div style={styles.drawerNav}>
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.path}
                  className={`drawer-nav-item ${isActive(item) ? "drawer-nav-item-active" : ""}`}
                  onClick={() => handleNavigate(item.path)}
                >
                  {item.label}
                </button>
              ))}
              {user?.role === "ADMIN" && (
                <button
                  className={`drawer-nav-item ${pathname.startsWith("/admin") ? "drawer-nav-item-active" : ""}`}
                  onClick={() => handleNavigate("/admin")}
                >
                  Admin
                </button>
              )}
            </div>
            <div style={styles.drawerFooter}>
              <div style={styles.drawerUserSection}>
                <div style={styles.drawerUserAvatar}>
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <div style={styles.drawerUserDetails}>
                  <span style={styles.drawerUserLabel}>Logged in as</span>
                  <span style={styles.drawerUserEmail} title={user?.email}>{user?.email}</span>
                </div>
              </div>
              <button className="drawer-logout-btn" onClick={logout}>
                Logout
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const styles = {
  drawerBackdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0, 0, 0, 0.5)",
    backdropFilter: "blur(4px)",
    zIndex: 100,
  },
  drawer: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "280px",
    height: "100vh",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--accent-blue)",
    zIndex: 101,
    display: "flex",
    flexDirection: "column",
  },
  drawerHeader: {
    padding: "24px",
    borderBottom: "1px solid var(--glass-border)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  drawerClose: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    alignItems: "center",
    display: "flex",
    gap: "10px",
  },
  logoText: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "15px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  drawerNav: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: 1,
  },
  drawerFooter: {
    padding: "24px",
    borderTop: "1px solid var(--glass-border)",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    background: "var(--bg-surface)",
  },
  drawerUserSection: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  drawerUserAvatar: {
    width: "38px",
    height: "38px",
    borderRadius: "0",
    border: "1px solid var(--accent-blue)",
    background: "rgba(0, 240, 255, 0.1)",
    color: "var(--accent-blue)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "18px",
    fontFamily: "var(--font-display)",
    boxShadow: "var(--glow-blue)",
    textShadow: "0 0 5px var(--accent-blue)",
  },
  drawerUserDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  drawerUserLabel: {
    fontSize: "11px",
    color: "var(--text-muted)",
    fontFamily: "var(--font-body)",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  drawerUserEmail: {
    fontSize: "14px",
    color: "var(--text-primary)",
    fontWeight: 500,
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    letterSpacing: "0.01em",
  },
};
