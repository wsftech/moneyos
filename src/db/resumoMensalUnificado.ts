import { getDatabase } from "./connection";
import { listFaturasPendentesContexto } from "./faturasCartao";
import { sincronizarStatusContasPagarReceber } from "./contasPagarReceber";
import { sincronizarStatusParcelas as sincronizarFinanciamentos } from "./financiamentos";
import { sincronizarStatusParcelas as sincronizarEmprestimos } from "./emprestimos";
import { getResumoMensal } from "./transacoes";
import { listTransacoesRecorrentes } from "./transacoesRecorrentes";
import {
  applyContextoFilter,
  buildContextoFilter,
  withDatabase,
} from "./utils";
import type { ContextoVisualizacao } from "../types";
import { arredondarMoeda } from "../utils/format";

export interface DetalheEntradasMes {
  realizado: number;
  contas_receber: number;
  recorrentes: number;
}

export interface DetalheSaidasMes {
  realizado: number;
  contas_pagar: number;
  financiamentos: number;
  emprestimos: number;
  faturas: number;
  recorrentes: number;
}

export interface ResumoMensalEntradasSaidas {
  mes: string;
  entradas: number;
  saidas: number;
  liquido: number;
  realizado_entradas: number;
  realizado_saidas: number;
  aberto_entradas: number;
  aberto_saidas: number;
  detalhe_entradas: DetalheEntradasMes;
  detalhe_saidas: DetalheSaidasMes;
}

export interface ComparativoMensalEntradasSaidas {
  mes: string;
  entradas: number;
  saidas: number;
}

async function sumQuery(
  query: string,
  params: unknown[],
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ total: number | string | null }[]>(query, params);
    return Number(rows[0]?.total) || 0;
  });
}

async function getAbertosNoMes(
  mes: string,
  contexto?: ContextoVisualizacao,
): Promise<{
  contas_pagar: number;
  contas_receber: number;
  financiamentos: number;
  emprestimos: number;
}> {
  const filterConta = buildContextoFilter(contexto);
  const filterContrato = buildContextoFilter(contexto, "f.contexto");
  const likeMes = `${mes}%`;

  const { query: qPagar, params: pPagar } = applyContextoFilter(
    `SELECT COALESCE(SUM(valor), 0) AS total
     FROM contas_a_pagar_receber
     WHERE status IN ('pendente', 'atrasado')
       AND tipo = 'pagar'
       AND vencimento LIKE $1${filterConta.clause}`,
    filterConta,
    2,
  );

  const { query: qReceber, params: pReceber } = applyContextoFilter(
    `SELECT COALESCE(SUM(valor), 0) AS total
     FROM contas_a_pagar_receber
     WHERE status IN ('pendente', 'atrasado')
       AND tipo = 'receber'
       AND vencimento LIKE $1${filterConta.clause}`,
    filterConta,
    2,
  );

  const { query: qFin, params: pFin } = applyContextoFilter(
    `SELECT COALESCE(SUM(fp.valor_previsto), 0) AS total
     FROM financiamento_parcelas fp
     JOIN financiamentos f ON f.id = fp.financiamento_id
     WHERE f.ativo = 1 AND fp.status IN ('pendente', 'atrasada')
       AND fp.vencimento LIKE $1${filterContrato.clause}`,
    filterContrato,
    2,
  );

  const { query: qEmp, params: pEmp } = applyContextoFilter(
    `SELECT COALESCE(SUM(fp.valor_previsto), 0) AS total
     FROM emprestimo_parcelas fp
     JOIN emprestimos f ON f.id = fp.emprestimo_id
     WHERE f.ativo = 1 AND fp.status IN ('pendente', 'atrasada')
       AND fp.vencimento LIKE $1${filterContrato.clause}`,
    filterContrato,
    2,
  );

  const [contas_pagar, contas_receber, financiamentos, emprestimos] = await Promise.all([
    sumQuery(qPagar, [likeMes, ...pPagar]),
    sumQuery(qReceber, [likeMes, ...pReceber]),
    sumQuery(qFin, [likeMes, ...pFin]),
    sumQuery(qEmp, [likeMes, ...pEmp]),
  ]);

  return { contas_pagar, contas_receber, financiamentos, emprestimos };
}

async function getRecorrentesPendentesNoMes(
  mes: string,
  contexto?: ContextoVisualizacao,
): Promise<{ entradas: number; saidas: number }> {
  const recorrentes = await listTransacoesRecorrentes(contexto);
  const ativos = recorrentes.filter((r) => r.ativo);
  if (ativos.length === 0) return { entradas: 0, saidas: 0 };

  const gerados = await withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ recorrente_id: number }[]>(
      `SELECT recorrente_id FROM transacao_recorrente_lancamentos
       WHERE mes_referencia = $1`,
      [mes],
    );
    return new Set(rows.map((r) => r.recorrente_id));
  });

  let entradas = 0;
  let saidas = 0;
  for (const rec of ativos) {
    if (gerados.has(rec.id)) continue;
    if (rec.tipo === "receita") entradas += rec.valor;
    if (rec.tipo === "despesa") saidas += rec.valor;
  }
  return { entradas, saidas };
}

async function getFaturasPendentesNoMes(
  mes: string,
  contexto?: ContextoVisualizacao,
): Promise<number> {
  const faturas = await listFaturasPendentesContexto(contexto);
  let total = 0;
  for (const f of faturas) {
    if (!f.vencimento.startsWith(mes)) continue;
    const pendente = Number(f.total) - Number(f.valor_pago ?? 0);
    if (pendente > 0) total += pendente;
  }
  return total;
}

/**
 * Visão unificada do mês: realizado (lançamentos efetivados) +
 * compromissos em aberto (contas, parcelas, faturas, recorrentes ainda não gerados).
 */
export async function getResumoMensalEntradasSaidas(
  mes: string,
  contexto?: ContextoVisualizacao,
  options?: { skipSync?: boolean },
): Promise<ResumoMensalEntradasSaidas> {
  if (!options?.skipSync) {
    await Promise.all([
      sincronizarFinanciamentos(),
      sincronizarEmprestimos(),
      sincronizarStatusContasPagarReceber(),
    ]);
  }

  const [realizado, abertos, recorrentes, faturas] = await Promise.all([
    getResumoMensal(mes, contexto),
    getAbertosNoMes(mes, contexto),
    getRecorrentesPendentesNoMes(mes, contexto),
    getFaturasPendentesNoMes(mes, contexto),
  ]);

  const detalhe_entradas: DetalheEntradasMes = {
    realizado: realizado.receitas,
    contas_receber: abertos.contas_receber,
    recorrentes: recorrentes.entradas,
  };

  const detalhe_saidas: DetalheSaidasMes = {
    realizado: realizado.despesas,
    contas_pagar: abertos.contas_pagar,
    financiamentos: abertos.financiamentos,
    emprestimos: abertos.emprestimos,
    faturas,
    recorrentes: recorrentes.saidas,
  };

  const realizado_entradas = arredondarMoeda(detalhe_entradas.realizado);
  const realizado_saidas = arredondarMoeda(detalhe_saidas.realizado);
  const aberto_entradas = arredondarMoeda(
    detalhe_entradas.contas_receber + detalhe_entradas.recorrentes,
  );
  const aberto_saidas = arredondarMoeda(
    detalhe_saidas.contas_pagar +
      detalhe_saidas.financiamentos +
      detalhe_saidas.emprestimos +
      detalhe_saidas.faturas +
      detalhe_saidas.recorrentes,
  );

  const entradas = arredondarMoeda(realizado_entradas + aberto_entradas);
  const saidas = arredondarMoeda(realizado_saidas + aberto_saidas);

  return {
    mes,
    entradas,
    saidas,
    liquido: arredondarMoeda(entradas - saidas),
    realizado_entradas,
    realizado_saidas,
    aberto_entradas,
    aberto_saidas,
    detalhe_entradas: {
      realizado: realizado_entradas,
      contas_receber: arredondarMoeda(detalhe_entradas.contas_receber),
      recorrentes: arredondarMoeda(detalhe_entradas.recorrentes),
    },
    detalhe_saidas: {
      realizado: realizado_saidas,
      contas_pagar: arredondarMoeda(detalhe_saidas.contas_pagar),
      financiamentos: arredondarMoeda(detalhe_saidas.financiamentos),
      emprestimos: arredondarMoeda(detalhe_saidas.emprestimos),
      faturas: arredondarMoeda(detalhe_saidas.faturas),
      recorrentes: arredondarMoeda(detalhe_saidas.recorrentes),
    },
  };
}

export async function getComparativoMensalEntradasSaidas(
  meses: string[],
  contexto?: ContextoVisualizacao,
): Promise<ComparativoMensalEntradasSaidas[]> {
  await Promise.all([
    sincronizarFinanciamentos(),
    sincronizarEmprestimos(),
    sincronizarStatusContasPagarReceber(),
  ]);

  const resultados: ComparativoMensalEntradasSaidas[] = [];
  for (const mes of meses) {
    const r = await getResumoMensalEntradasSaidas(mes, contexto, { skipSync: true });
    resultados.push({ mes, entradas: r.entradas, saidas: r.saidas });
  }
  return resultados;
}
