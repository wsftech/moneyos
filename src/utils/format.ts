export function arredondarMoeda(valor: number): number {
  const arredondado = Math.round(valor * 100) / 100;
  // Evita -0,00 por imprecisão de ponto flutuante (ex.: 1000 - 333,33 - 333,33 - 333,34)
  return Math.abs(arredondado) < 0.005 ? 0 : arredondado;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(arredondarMoeda(value));
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function mesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Último dia do mês anterior a `mesReferencia` (formato YYYY-MM). */
export function ultimoDiaMesAnterior(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split("-").map(Number);
  const d = new Date(ano, mes - 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function labelMes(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split("-");
  const date = new Date(Number(ano), Number(mes) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function labelTipoConta(tipo: string): string {
  const map: Record<string, string> = {
    banco: "Banco",
    dinheiro: "Dinheiro",
    cartao_credito: "Cartão de crédito",
    poupanca: "Poupança",
    investimento: "Investimento",
  };
  return map[tipo] ?? tipo;
}

export function labelStatusPagarReceber(status: string): string {
  const map: Record<string, string> = {
    pendente: "Pendente",
    pago: "Pago",
    atrasado: "Atrasado",
  };
  return map[status] ?? status;
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function mesesAnteriores(quantidade: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = quantidade - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

/** Meses ao redor de uma referência (ex.: 2 anteriores + atual + 3 seguintes). */
export function mesesAoRedor(
  mesReferencia: string,
  anteriores: number,
  seguintes: number,
): string[] {
  const [ano, mes] = mesReferencia.split("-").map(Number);
  const result: string[] = [];
  for (let i = -anteriores; i <= seguintes; i++) {
    const d = new Date(ano, mes - 1 + i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}
