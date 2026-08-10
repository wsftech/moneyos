import { getSaldoContextoAtual, listContasComSaldo } from "./contas";
import { listEmprestimos } from "./emprestimos";
import { listFinanciamentos } from "./financiamentos";
import type { ContextoVisualizacao, PatrimonioResumo } from "../types";
import { arredondarMoeda } from "../utils/format";

export async function getPatrimonioResumo(
  contexto?: ContextoVisualizacao,
): Promise<PatrimonioResumo> {
  const [contas, financiamentos, emprestimos] = await Promise.all([
    listContasComSaldo(contexto),
    listFinanciamentos(contexto),
    listEmprestimos(contexto),
  ]);

  const saldo_contas = arredondarMoeda(contas.reduce((s, c) => s + c.saldo, 0));
  const dividas = arredondarMoeda(
    [...financiamentos, ...emprestimos].reduce((s, d) => s + d.valor_restante, 0),
  );
  const caixa_disponivel = arredondarMoeda(
    contas
      .filter((c) => c.tipo !== "cartao_credito" && c.tipo !== "investimento")
      .reduce((s, c) => s + Math.max(0, c.saldo), 0),
  );

  return {
    saldo_contas,
    dividas,
    patrimonio_liquido: arredondarMoeda(saldo_contas - dividas),
    caixa_disponivel,
  };
}

/** Atalho para saldo total das contas (usado internamente). */
export { getSaldoContextoAtual };
