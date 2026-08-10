import { getDatabase } from "./connection";
import { sincronizarStatusContasPagarReceber } from "./contasPagarReceber";
import { sincronizarStatusParcelas as sincronizarFinanciamentos } from "./financiamentos";
import { sincronizarStatusParcelas as sincronizarEmprestimos } from "./emprestimos";
import { applyContextoFilter, buildContextoFilter, withDatabase } from "./utils";
import type { Contexto, ContextoVisualizacao, TipoContaPagarReceber } from "../types";

export type OrigemProximoVencimento = "conta" | "financiamento" | "emprestimo";

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

function estaAtrasado(status: ProximoVencimentoUnificado["status"]): boolean {
  return status === "atrasado" || status === "atrasada";
}

export { estaAtrasado as vencimentoEstaAtrasado };

export async function listProximosVencimentosUnificados(
  contexto?: ContextoVisualizacao,
  limite = 10,
): Promise<ProximoVencimentoUnificado[]> {
  await Promise.all([
    sincronizarFinanciamentos(),
    sincronizarEmprestimos(),
    sincronizarStatusContasPagarReceber(),
  ]);

  return withDatabase(async () => {
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

    return [...contas.map(mapConta), ...fin.map(mapParcelaFinanciamento), ...emp.map(mapParcelaEmprestimo)]
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao))
      .slice(0, limite);
  });
}
