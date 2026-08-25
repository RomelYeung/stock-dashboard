import React from "react";

export default function PeriodToggle({
  value = "annual",
  onChange,
  options = [
    { id: "annual", label: "Annual" },
    { id: "quarterly", label: "Quarterly" },
  ],
  size = "md",
}) {
  return (
    <div
      className={`period-toggle-container period-toggle-${size}`}
      role="group"
      aria-label="Period mode selector"
    >
      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className={`period-toggle-btn ${isActive ? "active" : ""}`}
            onClick={() => onChange && onChange(opt.id)}
            aria-pressed={isActive}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
