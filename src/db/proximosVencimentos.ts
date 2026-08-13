import { getDatabase } from "./connection";
import { sincronizarStatusContasPagarReceber } from "./contasPagarReceber";
import { sincronizarStatusParcelas as sincronizarFinanciamentos } from "./financiamentos";
import { sincronizarStatusParcelas as sincronizarEmprestimos } from "./emprestimos";
import { listContas } from "./contas";
import { listFaturasPendentesContexto } from "./faturasCartao";
import { applyContextoFilter, buildContextoFilter, withDatabase } from "./utils";
import type {
  Contexto,
  ContextoVisualizacao,
  FaturaCartaoResumo,
  TipoContaPagarReceber,
} from "../types";
import { arredondarMoeda } from "../utils/format";
import { addDays } from "../utils/dates";

export type OrigemProximoVencimento =
  | "conta"
  | "financiamento"
  | "emprestimo"
  | "fatura_cartao";

export interface ProximoVencimentoUnificado {
  chave: string;
  origem: OrigemProximoVencimento;
  descricao: string;
  valor: number;
  vencimento: string;
  contexto: Contexto;
  tipo: TipoContaPagarReceber | "pagar";
  status: "pendente" | "atrasado" | "atrasada";
  detalhe: string;
  rota: string;
}

interface ContaRow {
  id: number;
  descricao: string;
  valor: number;
  vencimento: string;
  contexto: Contexto;
  tipo: TipoContaPagarReceber;
  status: "pendente" | "atrasado" | "pago";
}

interface ParcelaContratoRow {
  parcela_id: number;
  contrato_id: number;
  descricao: string;
  valor_previsto: number;
  vencimento: string;
  contexto: Contexto;
  status: "pendente" | "atrasada" | "paga";
  numero_parcela: number;
  total_parcelas: number;
}

function hojeIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mapConta(row: ContaRow): ProximoVencimentoUnificado {
  return {
    chave: `conta-${row.id}`,
    origem: "conta",
    descricao: row.descricao,
    valor: row.valor,
    vencimento: row.vencimento,
    contexto: row.contexto,
    tipo: row.tipo,
    status: row.status === "atrasado" ? "atrasado" : "pendente",
    detalhe: row.tipo === "pagar" ? "Conta a pagar" : "Conta a receber",
    rota: "/contas-pagar-receber",
  };
}

function mapParcelaFinanciamento(row: ParcelaContratoRow): ProximoVencimentoUnificado {
  return {
    chave: `fin-${row.contrato_id}-${row.parcela_id}`,
    origem: "financiamento",
    descricao: row.descricao,
    valor: row.valor_previsto,
    vencimento: row.vencimento,
    contexto: row.contexto,
    tipo: "pagar",
    status: row.status === "atrasada" ? "atrasada" : "pendente",
    detalhe: `Financiamento · parcela ${row.numero_parcela}/${row.total_parcelas}`,
    rota: "/dividas-parceladas",
  };
}

function mapParcelaEmprestimo(row: ParcelaContratoRow): ProximoVencimentoUnificado {
  return {
    chave: `emp-${row.contrato_id}-${row.parcela_id}`,
    origem: "emprestimo",
    descricao: row.descricao,
    valor: row.valor_previsto,
    vencimento: row.vencimento,
    contexto: row.contexto,
    tipo: "pagar",
    status: row.status === "atrasada" ? "atrasada" : "pendente",
    detalhe: `Empréstimo · parcela ${row.numero_parcela}/${row.total_parcelas}`,
    rota: "/dividas-parceladas",
  };
}

function mapFatura(
  fatura: FaturaCartaoResumo,
  contexto: Contexto,
  hoje: string,
): ProximoVencimentoUnificado {
  const restante = arredondarMoeda(fatura.total - (fatura.valor_pago ?? 0));
  return {
    chave: `fat-${fatura.id ?? fatura.conta_id}-${fatura.mes_referencia}`,
    origem: "fatura_cartao",
    descricao: `${fatura.conta_nome} — fatura ${fatura.mes_referencia}`,
    valor: restante,
    vencimento: fatura.vencimento,
    contexto,
    tipo: "pagar",
    status: fatura.vencimento < hoje ? "atrasado" : "pendente",
    detalhe: "Fatura de cartão",
    rota: `/faturas/${fatura.conta_id}`,
  };
}

function estaAtrasado(status: ProximoVencimentoUnificado["status"]): boolean {
  return status === "atrasado" || status === "atrasada";
}

export { estaAtrasado as vencimentoEstaAtrasado };

async function listTodosVencimentos(
  contexto?: ContextoVisualizacao,
): Promise<ProximoVencimentoUnificado[]> {
  await Promise.all([
    sincronizarFinanciamentos(),
    sincronizarEmprestimos(),
    sincronizarStatusContasPagarReceber(),
  ]);

  const [contasCtx, faturas, rows] = await Promise.all([
    listContas(contexto),
    listFaturasPendentesContexto(contexto),
    withDatabase(async () => {
      const db = await getDatabase();
      const filterConta = buildContextoFilter(contexto);
      const filterContrato = buildContextoFilter(contexto, "f.contexto");

      const { query: qContas, params: pContas } = applyContextoFilter(
        `SELECT id, descricao, valor, vencimento, contexto, tipo, status
         FROM contas_a_pagar_receber
         WHERE status IN ('pendente', 'atrasado')${filterConta.clause}`,
        filterConta,
      );

      const { query: qFin, params: pFin } = applyContextoFilter(
        `SELECT fp.id AS parcela_id, f.id AS contrato_id, f.descricao, fp.valor_previsto,
                fp.vencimento, f.contexto, fp.status, fp.numero_parcela, f.total_parcelas
         FROM financiamento_parcelas fp
         JOIN financiamentos f ON f.id = fp.financiamento_id
         WHERE f.ativo = 1 AND fp.status IN ('pendente', 'atrasada')${filterContrato.clause}`,
        filterContrato,
      );

      const { query: qEmp, params: pEmp } = applyContextoFilter(
        `SELECT fp.id AS parcela_id, f.id AS contrato_id, f.descricao, fp.valor_previsto,
                fp.vencimento, f.contexto, fp.status, fp.numero_parcela, f.total_parcelas
         FROM emprestimo_parcelas fp
         JOIN emprestimos f ON f.id = fp.emprestimo_id
         WHERE f.ativo = 1 AND fp.status IN ('pendente', 'atrasada')${filterContrato.clause}`,
        filterContrato,
      );

      const [contas, fin, emp] = await Promise.all([
        db.select<ContaRow[]>(qContas, pContas),
        db.select<ParcelaContratoRow[]>(qFin, pFin),
        db.select<ParcelaContratoRow[]>(qEmp, pEmp),
      ]);

      return [
        ...contas.map(mapConta),
        ...fin.map(mapParcelaFinanciamento),
        ...emp.map(mapParcelaEmprestimo),
      ];
    }),
  ]);

  const contextoPorConta = new Map(contasCtx.map((c) => [c.id, c.contexto]));
  const hoje = hojeIso();
  const faturaItems = faturas.map((f) =>
    mapFatura(f, contextoPorConta.get(f.conta_id) ?? "pessoal", hoje),
  );

  return [...rows, ...faturaItems].sort(
    (a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao),
  );
}

export async function listProximosVencimentosUnificados(
  contexto?: ContextoVisualizacao,
  limite = 10,
): Promise<ProximoVencimentoUnificado[]> {
  const todos = await listTodosVencimentos(contexto);
  return todos.slice(0, limite);
}

/** Atrasados e o que vence nos próximos `dias` (inclui hoje). */
export async function listAcoesAgora(
  contexto?: ContextoVisualizacao,
  dias = 7,
): Promise<ProximoVencimentoUnificado[]> {
  const todos = await listTodosVencimentos(contexto);
  const hoje = hojeIso();
  const limite = addDays(hoje, dias);
  return todos.filter(
    (v) => estaAtrasado(v.status) || (v.vencimento >= hoje && v.vencimento <= limite),
  );
}

/** Conta atrasados no mesmo universo de “Vence nos próximos 7 dias” (agenda, parcelas e faturas). */
export async function contarVencimentosAtrasados(
  contexto?: ContextoVisualizacao,
): Promise<number> {
  const todos = await listTodosVencimentos(contexto);
  return todos.filter((v) => estaAtrasado(v.status)).length;
}
