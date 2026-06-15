// src/lib/chartTheme.js
// Shared Recharts styling for consistent tooltips/legends across pages.

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
  },
  labelStyle: { fontWeight: 600, color: "#334155" },
};

export const CHART_LEGEND_STYLE = {
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
  iconType: "circle",
};
