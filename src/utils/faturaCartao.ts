import type { StatusFaturaCartao } from "../types";
import { addDays, addMonths, todayIsoDate } from "./dates";

/** Período de fatura do cartão para o mês de fechamento informado (YYYY-MM). */
export function periodoFaturaCartao(
  mesFechamento: string,
  diaFechamento: number,
  diaVencimento: number,
): { inicio: string; fim: string; vencimento: string } {
  const [ano, mes] = mesFechamento.split("-").map(Number);

  // `fim` é o dia de corte (exibição). Compra nesse dia já entra na próxima.
  const fimDia = Math.min(diaFechamento, new Date(ano, mes, 0).getDate());
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(fimDia).padStart(2, "0")}`;

  const prev = new Date(ano, mes - 2, 1);
  const prevAno = prev.getFullYear();
  const prevMes = prev.getMonth() + 1;
  const inicioDia = Math.min(diaFechamento, new Date(prevAno, prevMes, 0).getDate());
  const inicio = `${prevAno}-${String(prevMes).padStart(2, "0")}-${String(inicioDia).padStart(2, "0")}`;

  // Vence no mês do fechamento quando o dia de vencimento é depois do fechamento
  // (ex.: fecha 3, vence 7 → 07/09). Se o vencimento for no dia do fechamento ou
  // antes, cai no mês seguinte (ex.: fecha 25, vence 10 → 10/10).
  const mesmoMes = diaVencimento > diaFechamento;
  const venc = new Date(ano, mes - 1 + (mesmoMes ? 0 : 1), 1);
  const vAno = venc.getFullYear();
  const vMes = venc.getMonth() + 1;
  const vDia = Math.min(diaVencimento, new Date(vAno, vMes, 0).getDate());
  const vencimento = `${vAno}-${String(vMes).padStart(2, "0")}-${String(vDia).padStart(2, "0")}`;

  return { inicio, fim, vencimento };
}

/** Último dia de compras da fatura (o dia do fechamento já é da próxima). */
export function ultimoDiaComprasFatura(periodoFim: string): string {
  return addDays(periodoFim, -1);
}

/**
 * Mês de fechamento (YYYY-MM) ao qual uma data de compra pertence.
 * Compra no dia do fechamento (ou depois) cai na próxima fatura.
 */
export function mesFechamentoParaData(data: string, diaFechamento: number): string {
  const [y, m, d] = data.split("-").map(Number);
  if (d < diaFechamento) {
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  const next = new Date(y, m - 1 + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function mesFechamentoAtual(diaFechamento: number, hoje?: string): string {
  const ref = hoje ?? todayIsoDate();
  return mesFechamentoParaData(ref, diaFechamento);
}

/** Data usada para achar o ciclo da fatura: parcela N cai N−1 meses depois da compra. */
export function dataCicloParcelaCartao(
  dataCompra: string,
  parcelaNumero?: number | null,
): string {
  const n = parcelaNumero ?? 1;
  if (n <= 1) return dataCompra;
  return addMonths(dataCompra, n - 1);
}

/**
 * Mês pelo qual a fatura é chamada (competência das compras), não o mês
 * civil do fechamento. Fecha 03/09 (período 04/08–03/09) → agosto.
 * Fecha na segunda quinzena (ex.: 16/08) → o próprio mês do fechamento.
 */
export function mesCompetenciaFatura(periodoInicio: string, periodoFim: string): string {
  const diaFim = Number(periodoFim.slice(8, 10));
  if (diaFim <= 15) return periodoInicio.slice(0, 7);
  return periodoFim.slice(0, 7);
}

export function mesCompetenciaParaData(data: string, diaFechamento: number): string {
  const mesFechamento = mesFechamentoParaData(data, diaFechamento);
  const { inicio, fim } = periodoFaturaCartao(
    mesFechamento,
    diaFechamento,
    diaFechamento,
  );
  return mesCompetenciaFatura(inicio, fim);
}

/** Status exibido: ciclo ainda não começou = futura (parcelas à frente). */
export function statusFaturaPorPeriodo(
  row: {
    status: string;
    periodo_inicio: string;
    periodo_fim: string;
    valor_pago?: number | null;
    total: number;
  },
  hoje: string,
): StatusFaturaCartao {
  if (
    row.status === "paga" ||
    (row.valor_pago != null && row.valor_pago >= row.total && row.total > 0)
  ) {
    return "paga";
  }
  if (hoje >= row.periodo_fim) return "fechada";
  if (hoje < row.periodo_inicio) return "futura";
  return "aberta";
}

/** Só os valores gravados no CHECK do SQLite. */
export function statusFaturaPersistido(
  row: Parameters<typeof statusFaturaPorPeriodo>[0],
  hoje: string,
): "aberta" | "fechada" | "paga" {
  const status = statusFaturaPorPeriodo(row, hoje);
  return status === "futura" ? "aberta" : status;
}
