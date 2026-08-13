import { listAtivosManuais } from "./ativosManuais";
import { listContasComSaldo } from "./contas";
import { listEmprestimos } from "./emprestimos";
import { listFaturasPendentesContexto } from "./faturasCartao";
import { listFinanciamentos } from "./financiamentos";
import type { ContextoVisualizacao, PatrimonioResumo } from "../types";
import { arredondarMoeda } from "../utils/format";

/**
 * Patrimônio líquido:
 * - Ativos = contas (exceto cartão) + ativos manuais (imóvel, veículo…)
 * - Dívidas = financiamentos + empréstimos + faturas abertas
 * - Caixa = banco/dinheiro/poupança (exclui cartão, investimento e ativos manuais)
 */
export async function getPatrimonioResumo(
  contexto?: ContextoVisualizacao,
): Promise<PatrimonioResumo> {
  const [contas, financiamentos, emprestimos, faturas, ativos] = await Promise.all([
    listContasComSaldo(contexto),
    listFinanciamentos(contexto),
    listEmprestimos(contexto),
    listFaturasPendentesContexto(contexto),
    listAtivosManuais(contexto),
  ]);

  const saldo_contas = arredondarMoeda(
    contas
      .filter((c) => c.tipo !== "cartao_credito")
      .reduce((s, c) => s + c.saldo, 0),
  );

  const ativos_manuais = arredondarMoeda(ativos.reduce((s, a) => s + a.valor, 0));

  const dividas_parceladas = arredondarMoeda(
    [...financiamentos, ...emprestimos].reduce((s, d) => s + d.valor_restante, 0),
  );

  const dividas_cartao = arredondarMoeda(
    faturas.reduce((s, f) => s + (f.total - (f.valor_pago ?? 0)), 0),
  );

  const dividas = arredondarMoeda(dividas_parceladas + dividas_cartao);

  const caixa_disponivel = arredondarMoeda(
    contas
      .filter((c) => c.tipo !== "cartao_credito" && c.tipo !== "investimento")
      .reduce((s, c) => s + c.saldo, 0),
  );

  return {
    saldo_contas,
    ativos_manuais,
    dividas,
    dividas_parceladas,
    dividas_cartao,
    patrimonio_liquido: arredondarMoeda(saldo_contas + ativos_manuais - dividas),
    caixa_disponivel,
  };
}

/** Atalho para saldo total das contas (usado internamente). */
export { getSaldoContextoAtual } from "./contas";
