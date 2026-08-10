/** Divide valor total em N parcelas iguais; a última absorve centavos restantes */
import { arredondarMoeda } from "./format";

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

/**
 * Valor previsto exibido em cada parcela: usa a parcela de referência informada no cadastro.
 * A última parcela absorve o que faltar do total do contrato (se couber); caso contrário mantém a referência.
 * O saldo devedor continua sendo valor_total − soma dos pagamentos reais.
 */
export function gerarValoresPrevistos(
  valorTotal: number,
  valorParcela: number,
  quantidade: number,
): number[] {
  if (quantidade <= 0) return [];
  if (quantidade === 1) {
    return [arredondarMoeda(Math.min(valorParcela, valorTotal))];
  }

  const valores: number[] = [];
  for (let i = 0; i < quantidade - 1; i++) {
    valores.push(valorParcela);
  }
  const acumulado = valorParcela * (quantidade - 1);
  const ultima = arredondarMoeda(valorTotal - acumulado);
  valores.push(ultima > 0 ? ultima : valorParcela);
  return valores;
}

export { arredondarMoeda } from "./format";
