export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const yy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function mesFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function isSameMonth(dateStr: string, mesReferencia: string): boolean {
  return dateStr.startsWith(mesReferencia);
}

export function isCurrentMonth(dateStr: string): boolean {
  const now = new Date();
  const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return dateStr.startsWith(mes);
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Soma dias a uma data ISO (YYYY-MM-DD), em calendário local. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Primeiro e último dia de um mês (YYYY-MM) */
export function intervaloDoMes(mesReferencia: string): { inicio: string; fim: string } {
  const [y, m] = mesReferencia.split("-").map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return {
    inicio: `${y}-${mm}-01`,
    fim: `${y}-${mm}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

export function intervaloMesAtual(): { inicio: string; fim: string } {
  const now = new Date();
  const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return intervaloDoMes(mes);
}

export function atualizarStatusParcela(
  vencimento: string,
  statusAtual: "pendente" | "paga" | "atrasada",
): "pendente" | "paga" | "atrasada" {
  if (statusAtual === "paga") return "paga";
  if (vencimento < todayIsoDate()) return "atrasada";
  return "pendente";
}
