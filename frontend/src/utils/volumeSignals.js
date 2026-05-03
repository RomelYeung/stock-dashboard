export function getVolumeSignal(obvChange, cmf) {
  if (obvChange == null || cmf == null) {
    return { label: "—", color: "var(--text-secondary)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" };
  }

  const nullish = (v) => v === null || v === undefined || Number.isNaN(v);
  if (nullish(obvChange) || nullish(cmf)) {
    return { label: "—", color: "var(--text-secondary)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" };
  }

  // Distribution: OBV falling, CMF negative
  if (obvChange < -5 && cmf < -0.05) {
    return { label: "Distribution", color: "#ef4444", bg: "rgba(239, 68, 68, 0.10)", border: "rgba(239, 68, 68, 0.25)" };
  }

  // Accumulating: both OBV and CMF positive
  if (obvChange > 5 && cmf > 0.05) {
    return { label: "Accumulating", color: "#10b981", bg: "rgba(16, 185, 129, 0.10)", border: "rgba(16, 185, 129, 0.25)" };
  }

  // Volume churn: OBV rising but CMF flat/weak
  if (obvChange > 5 && cmf <= 0.05) {
    return { label: "Churn", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.25)" };
  }

  // Quiet breakout: OBV flat but CMF positive
  if (obvChange <= 5 && cmf > 0.05) {
    return { label: "Building", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.25)" };
  }

  // Mixed: everything else
  return { label: "Mixed", color: "var(--text-secondary)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" };
}
