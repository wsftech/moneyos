export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return date.toISOString().slice(0, 10);
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
  return new Date().toISOString().slice(0, 10);
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
