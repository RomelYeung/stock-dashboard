// Market hours in ET (America/New_York)
// Pre-market:  04:00 – 09:30
// Regular:     09:30 – 16:00
// After-hours: 16:00 – 20:00
// Closed:      20:00 – 04:00 + weekends

function getEtParts() {
  const now = new Date();

  const day = now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });

  const time = now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m;

  return { day, totalMinutes, h, m };
}

export function getMarketStatus() {
  const { day, totalMinutes } = getEtParts();
  const isWeekend = day === "Sat" || day === "Sun";

  // Pre-market: 04:00 (240) – 09:30 (570)
  const isPreMarket = !isWeekend && totalMinutes >= 240 && totalMinutes < 570;
  // Regular: 09:30 (570) – 16:00 (960)
  const isOpen = !isWeekend && totalMinutes >= 570 && totalMinutes < 960;
  // After-hours: 16:00 (960) – 20:00 (1200)
  const isAfterHours = !isWeekend && totalMinutes >= 960 && totalMinutes < 1200;

  if (isOpen) {
    return { label: "Live", color: "var(--accent-green)", dotColor: "var(--accent-green)", isOpen: true };
  }
  if (isPreMarket) {
    return { label: "Pre-market", color: "var(--accent-yellow)", dotColor: "var(--accent-yellow)", isOpen: false };
  }
  if (isAfterHours) {
    return { label: "After-hours", color: "var(--accent-amber)", dotColor: "var(--accent-amber)", isOpen: false };
  }
  return { label: "Closed", color: "var(--text-secondary)", dotColor: "rgba(255,255,255,0.3)", isOpen: false };
}
