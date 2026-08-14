import { addMonths } from "./dates";
import { arredondarMoeda } from "./financiamentoCalc";

export interface PagamentoHistoricoRow {
  numero_parcela: number;
  data: string;
  valor: number;
}

export function gerarPagamentosHistoricosPadrao(
  quantidade: number,
  valoresPrevistos: number[],
  dataPrimeiraParcela: string,
): PagamentoHistoricoRow[] {
  if (quantidade <= 0) return [];
  return Array.from({ length: quantidade }, (_, i) => ({
    numero_parcela: i + 1,
    data: addMonths(dataPrimeiraParcela, i),
    valor: valoresPrevistos[i] ?? 0,
  }));
}

export function validarParcelasJaPagas(quantidade: number, totalParcelas: number): string | null {
  if (quantidade < 0 || !Number.isFinite(quantidade)) {
    return "Informe um número válido de parcelas já pagas.";
  }
  if (quantidade > totalParcelas) {
    return `Parcelas já pagas não pode ser maior que ${totalParcelas}.`;
  }
  return null;
}

export function validarPagamentosHistoricos(
  rows: PagamentoHistoricoRow[],
  totalParcelas: number,
): string | null {
  if (rows.length === 0) return null;

  const numeros = new Set<number>();
  for (const row of rows) {
    if (row.numero_parcela < 1 || row.numero_parcela > totalParcelas) {
      return `Parcela #${row.numero_parcela} inválida (máx. ${totalParcelas}).`;
    }
    if (numeros.has(row.numero_parcela)) {
      return `Parcela #${row.numero_parcela} duplicada.`;
    }
    numeros.add(row.numero_parcela);
    if (!row.data) return `Informe a data da parcela #${row.numero_parcela}.`;
    if (!row.valor || row.valor <= 0) {
      return `Informe o valor pago da parcela #${row.numero_parcela}.`;
    }
  }
  return null;
}

export function totalPagamentosHistoricos(rows: PagamentoHistoricoRow[]): number {
  return arredondarMoeda(rows.reduce((s, r) => s + r.valor, 0));
}
