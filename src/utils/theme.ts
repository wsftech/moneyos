/** Paleta WSF Money — teal escuro + verde (receitas) / vermelho (despesas) */
export const THEME = {
  income: "#16a34a",
  incomeGlow: "#4ade80",
  expense: "#dc2626",
  expenseGlow: "#f87171",
  accent: "#0d9488",
  primary: "#0a2533",
  bg: "#eef1f4",
  panel: "#ffffff",
  card: "#ffffff",
  chartGrid: "rgba(15, 23, 42, 0.08)",
  tooltipBg: "#ffffff",
  tooltipBorder: "rgba(15, 23, 42, 0.1)",
  tick: "#64748b",
  categories: ["#7c3aed", "#f59e0b", "#16a34a", "#0ea5e9", "#dc2626", "#94a3b8"],
} as const;

export const chartTooltipStyle = {
  background: THEME.tooltipBg,
  border: `1px solid ${THEME.tooltipBorder}`,
  borderRadius: 12,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
  color: "#0f172a",
};
