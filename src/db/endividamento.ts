import { getDatabase } from "./connection";
import { listContas } from "./contas";
import { listEmprestimos } from "./emprestimos";
import { listFaturasPendentesContexto } from "./faturasCartao";
import { listFinanciamentos } from "./financiamentos";
import { getPatrimonioResumo } from "./patrimonio";
import { applyContextoFilter, buildContextoFilter, withDatabase } from "./utils";
import type { ContextoVisualizacao, ItemEndividamento, RelatorioEndividamento } from "../types";
import { arredondarMoeda, mesAtual } from "../utils/format";

async function parcelasVencendoNoMes(
  contexto: ContextoVisualizacao | undefined,
  mesReferencia: string,
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto, "f.contexto");
    const inicio = `${mesReferencia}-01`;
    const fim = `${mesReferencia}-31`;

    const { query: qFin, params: pFin } = applyContextoFilter(
      `SELECT COALESCE(SUM(fp.valor_previsto), 0) as total
       FROM financiamento_parcelas fp
       JOIN financiamentos f ON f.id = fp.financiamento_id
       WHERE f.ativo = 1 AND fp.status IN ('pendente', 'atrasada')
         AND fp.vencimento >= $1 AND fp.vencimento <= $2${filter.clause}`,
      filter,
      3,
    );

    const { query: qEmp, params: pEmp } = applyContextoFilter(
      `SELECT COALESCE(SUM(fp.valor_previsto), 0) as total
       FROM emprestimo_parcelas fp
       JOIN emprestimos f ON f.id = fp.emprestimo_id
       WHERE f.ativo = 1 AND fp.status IN ('pendente', 'atrasada')
         AND fp.vencimento >= $1 AND fp.vencimento <= $2${filter.clause}`,
      filter,
      3,
    );

    const params = [inicio, fim];
    const [fin, emp] = await Promise.all([
      db.select<{ total: number }[]>(qFin, [...params, ...pFin]),
      db.select<{ total: number }[]>(qEmp, [...params, ...pEmp]),
    ]);

    return arredondarMoeda((fin[0]?.total ?? 0) + (emp[0]?.total ?? 0));
  });
}

export async function getRelatorioEndividamento(
  contexto?: ContextoVisualizacao,
  mesReferencia?: string,
): Promise<RelatorioEndividamento> {
  const mes = mesReferencia ?? mesAtual();

  const [patrimonio, financiamentos, emprestimos, faturas, parcelasMes, contas] = await Promise.all([
    getPatrimonioResumo(contexto),
    listFinanciamentos(contexto),
    listEmprestimos(contexto),
    listFaturasPendentesContexto(contexto),
    parcelasVencendoNoMes(contexto, mes),
    listContas(contexto),
  ]);

  const contextoPorConta = new Map(contas.map((c) => [c.id, c.contexto]));

  const itens: ItemEndividamento[] = [
    ...financiamentos.map((f) => ({
      id: f.id,
      tipo: "financiamento" as const,
      descricao: f.descricao,
      contexto: f.contexto,
      valor_total: f.valor_total_contrato,
      valor_pago: f.valor_pago,
      valor_restante: f.valor_restante,
      percentual_pago: f.percentual_pago,
      proximo_vencimento: f.proximo_vencimento,
      parcelas_restantes: f.parcelas_restantes,
    })),
    ...emprestimos.map((e) => ({
      id: e.id,
      tipo: "emprestimo" as const,
      descricao: e.descricao,
      contexto: e.contexto,
      valor_total: e.valor_total_contrato,
      valor_pago: e.valor_pago,
      valor_restante: e.valor_restante,
      percentual_pago: e.percentual_pago,
      proximo_vencimento: e.proximo_vencimento,
      parcelas_restantes: e.parcelas_restantes,
    })),
    ...faturas.map((f) => ({
      id: f.id ?? f.conta_id,
      tipo: "fatura_cartao" as const,
      descricao: `${f.conta_nome} — ${f.mes_referencia}`,
      contexto: contextoPorConta.get(f.conta_id) ?? "pessoal",
      valor_total: f.total,
      valor_pago: f.valor_pago ?? 0,
      valor_restante: arredondarMoeda(f.total - (f.valor_pago ?? 0)),
      percentual_pago:
        f.total > 0 ? Math.min(Math.round(((f.valor_pago ?? 0) / f.total) * 100), 100) : 0,
      proximo_vencimento: f.vencimento,
      parcelas_restantes: null,
    })),
  ].sort((a, b) => b.valor_restante - a.valor_restante);

  const total_faturas_cartao = arredondarMoeda(
    faturas.reduce((s, f) => s + f.total - (f.valor_pago ?? 0), 0),
  );

  const cobertura_caixa =
    patrimonio.dividas > 0 ? arredondarMoeda(patrimonio.caixa_disponivel / patrimonio.dividas) : null;

  const divida_sobre_patrimonio =
    patrimonio.saldo_contas > 0
      ? arredondarMoeda(patrimonio.dividas / patrimonio.saldo_contas)
      : null;

  const meses_caixa_para_divida =
    parcelasMes > 0 && patrimonio.caixa_disponivel > 0
      ? arredondarMoeda(patrimonio.dividas / parcelasMes)
      : null;

  return {
    patrimonio,
    itens,
    total_dividas: patrimonio.dividas,
    total_faturas_cartao,
    parcelas_mes_atual: parcelasMes,
    indicadores: {
      cobertura_caixa,
      divida_sobre_patrimonio,
      meses_caixa_para_divida,
    },
  };
}
