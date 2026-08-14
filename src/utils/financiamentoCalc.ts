/** Divide valor total em N parcelas iguais; a última absorve centavos restantes */
import { arredondarMoeda } from "./format";

export interface FaixaInicialParcelas {
  qtd: number;
  valor: number;
}

export function dividirValorTotal(valorTotal: number, quantidade: number): number[] {
  if (quantidade <= 0) return [];
  if (quantidade === 1) return [Math.round(valorTotal * 100) / 100];

  const base = Math.floor((valorTotal / quantidade) * 100) / 100;
  const valores: number[] = [];
  let acumulado = 0;
  for (let i = 0; i < quantidade - 1; i++) {
    valores.push(base);
    acumulado += base;
  }
  valores.push(Math.round((valorTotal - acumulado) * 100) / 100);
  return valores;
}

export function normalizarFaixaInicial(
  qtd?: number | null,
  valor?: number | null,
): FaixaInicialParcelas | undefined {
  if (qtd == null || qtd <= 0 || valor == null || valor <= 0) return undefined;
  return { qtd, valor: arredondarMoeda(valor) };
}

export function validarFaixaInicial(
  faixa: FaixaInicialParcelas,
  totalParcelas: number,
): string | null {
  if (!Number.isInteger(faixa.qtd) || faixa.qtd < 1) {
    return "Informe quantas primeiras parcelas têm valor diferente.";
  }
  if (faixa.qtd >= totalParcelas) {
    return "As primeiras parcelas com outro valor precisam ser menos que o total.";
  }
  if (!(faixa.valor > 0)) {
    return "Informe o valor das primeiras parcelas.";
  }
  return null;
}

/**
 * Valor previsto de cada parcela. Com faixa, as N primeiras usam um valor e as demais
 * usam a parcela de referência; a última absorve o que faltar do total.
 */
export function gerarValoresPrevistos(
  valorTotal: number,
  valorParcela: number,
  quantidade: number,
  faixa?: FaixaInicialParcelas,
): number[] {
  if (quantidade <= 0) return [];
  if (quantidade === 1) {
    return [arredondarMoeda(Math.min(valorParcela, valorTotal))];
  }

  const qtdFaixa =
    faixa && faixa.qtd > 0 ? Math.min(faixa.qtd, quantidade - 1) : 0;
  const valorFaixa = faixa?.valor ?? valorParcela;
  const valores: number[] = [];

  for (let i = 0; i < quantidade - 1; i++) {
    valores.push(arredondarMoeda(i < qtdFaixa ? valorFaixa : valorParcela));
  }

  const acumulado = arredondarMoeda(valores.reduce((s, v) => s + v, 0));
  const ultima = arredondarMoeda(valorTotal - acumulado);
  valores.push(ultima > 0 ? ultima : arredondarMoeda(valorParcela));
  return valores;
}

export function agruparValoresIguais(
  valores: number[],
): { qtd: number; valor: number }[] {
  const grupos: { qtd: number; valor: number }[] = [];
  for (const bruto of valores) {
    const valor = arredondarMoeda(bruto);
    const last = grupos[grupos.length - 1];
    if (last && last.valor === valor) last.qtd += 1;
    else grupos.push({ qtd: 1, valor });
  }
  return grupos;
}

export function redistribuirPrevistosPendentes(
  saldoRestante: number,
  pendentes: { id: number; numero_parcela: number }[],
  valoresOriginais: number[],
): { id: number; previsto: number }[] {
  const ordered = [...pendentes].sort((a, b) => a.numero_parcela - b.numero_parcela);
  if (ordered.length === 0) return [];
  if (ordered.length === 1) {
    return [{ id: ordered[0].id, previsto: arredondarMoeda(Math.max(0, saldoRestante)) }];
  }

  const result: { id: number; previsto: number }[] = [];
  let alocado = 0;
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    let previsto: number;
    if (i === ordered.length - 1) {
      previsto = arredondarMoeda(Math.max(0, saldoRestante - alocado));
    } else {
      previsto = arredondarMoeda(valoresOriginais[p.numero_parcela - 1] ?? 0);
      alocado = arredondarMoeda(alocado + previsto);
    }
    result.push({ id: p.id, previsto });
  }
  return result;
}

export { arredondarMoeda } from "./format";
