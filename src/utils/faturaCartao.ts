/** Período de fatura do cartão para o mês de fechamento informado (YYYY-MM). */
export function periodoFaturaCartao(
  mesFechamento: string,
  diaFechamento: number,
  diaVencimento: number,
): { inicio: string; fim: string; vencimento: string } {
  const [ano, mes] = mesFechamento.split("-").map(Number);

  const fimDia = Math.min(diaFechamento, new Date(ano, mes, 0).getDate());
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(fimDia).padStart(2, "0")}`;

  const prev = new Date(ano, mes - 2, 1);
  const prevAno = prev.getFullYear();
  const prevMes = prev.getMonth() + 1;
  const inicioDia = Math.min(diaFechamento, new Date(prevAno, prevMes, 0).getDate()) + 1;
  const ultimoPrev = new Date(prevAno, prevMes, 0).getDate();
  const inicio =
    inicioDia > ultimoPrev
      ? `${prevAno}-${String(prevMes).padStart(2, "0")}-${String(ultimoPrev).padStart(2, "0")}`
      : `${prevAno}-${String(prevMes).padStart(2, "0")}-${String(inicioDia).padStart(2, "0")}`;

  const venc = new Date(ano, mes - 1, 1);
  venc.setMonth(venc.getMonth() + 1);
  const vAno = venc.getFullYear();
  const vMes = venc.getMonth() + 1;
  const vDia = Math.min(diaVencimento, new Date(vAno, vMes, 0).getDate());
  const vencimento = `${vAno}-${String(vMes).padStart(2, "0")}-${String(vDia).padStart(2, "0")}`;

  return { inicio, fim, vencimento };
}

/** Mês de fechamento (YYYY-MM) ao qual uma data de compra pertence. */
export function mesFechamentoParaData(data: string, diaFechamento: number): string {
  const [y, m, d] = data.split("-").map(Number);
  if (d <= diaFechamento) {
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  const next = new Date(y, m - 1 + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function mesFechamentoAtual(diaFechamento: number, hoje?: string): string {
  const ref = hoje ?? new Date().toISOString().slice(0, 10);
  return mesFechamentoParaData(ref, diaFechamento);
}
