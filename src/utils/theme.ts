/** Paleta Money OS — indigo (receitas) + magenta (despesas) */
export const THEME = {
  income: "#6366f1",
  incomeGlow: "#818cf8",
  expense: "#ff2d55",
  expenseGlow: "#ff6b8a",
  accent: "#bf5af2",
  bg: "#121212",
  panel: "#1c1c1e",
  card: "#252528",
  chartGrid: "rgba(255,255,255,0.06)",
  tooltipBg: "#1c1c1e",
  tooltipBorder: "rgba(255,255,255,0.08)",
  tick: "#8e8e93",
  categories: ["#6366f1", "#fbbf24", "#34d399", "#a78bfa", "#ff2d55", "#94a3b8"],
} as const;

export const chartTooltipStyle = {
  background: THEME.tooltipBg,
  border: `1px solid ${THEME.tooltipBorder}`,
  borderRadius: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};
