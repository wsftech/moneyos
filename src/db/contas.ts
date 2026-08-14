import { getDatabase } from "./connection";
import {
  applyContextoFilter,
  buildContextoFilter,
  fromBoolean,
  toBoolean,
  withDatabase,
} from "./utils";
import { arredondarMoeda } from "../utils/format";
import type { Conta, Contexto, ContextoVisualizacao, TipoConta } from "../types";
import { ultimoDiaMesAnterior } from "../utils/format";

export interface ContaInput {
  nome: string;
  tipo: TipoConta;
  contexto: Contexto;
  saldo_inicial: number;
  cor: string;
  icone?: string | null;
  logo_path?: string | null;
  ativo: boolean;
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
  limite_credito?: number | null;
  data_saldo_inicial?: string | null;
  final_cartao?: string | null;
}

interface ContaRow {
  id: number;
  nome: string;
  tipo: TipoConta;
  contexto: Contexto;
  saldo_inicial: number;
  cor: string;
  icone: string | null;
  logo_path: string | null;
  ativo: number;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  limite_credito: number | null;
  data_saldo_inicial: string | null;
  final_cartao: string | null;
}

function mapConta(row: ContaRow): Conta {
  return {
    ...row,
    logo_path: row.logo_path ?? null,
    final_cartao: row.final_cartao ?? null,
    ativo: toBoolean(row.ativo),
  };
}

export async function listContas(contexto?: ContextoVisualizacao): Promise<Conta[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT * FROM contas WHERE 1=1${filter.clause} ORDER BY nome ASC`,
      filter,
    );
    const rows = await db.select<ContaRow[]>(query, params);
    return rows.map(mapConta);
  });
}

export async function getConta(id: number): Promise<Conta | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<ContaRow[]>("SELECT * FROM contas WHERE id = $1", [id]);
    return rows[0] ? mapConta(rows[0]) : null;
  });
}

export async function createConta(input: ContaInput): Promise<Conta> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO contas (nome, tipo, contexto, saldo_inicial, cor, icone, logo_path, ativo, dia_fechamento, dia_vencimento, limite_credito, data_saldo_inicial, final_cartao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        input.nome,
        input.tipo,
        input.contexto,
        input.saldo_inicial,
        input.cor,
        input.icone ?? null,
        input.logo_path ?? null,
        fromBoolean(input.ativo),
        input.dia_fechamento ?? null,
        input.dia_vencimento ?? null,
        input.limite_credito ?? null,
        input.data_saldo_inicial ?? null,
        input.final_cartao ?? null,
      ],
    );
    const conta = await getConta(result.lastInsertId as number);
    if (!conta) {
      throw new Error("Falha ao criar conta");
    }
    return conta;
  });
}

export async function updateConta(id: number, input: Partial<ContaInput>): Promise<Conta> {
  return withDatabase(async () => {
    const existing = await getConta(id);
    if (!existing) {
      throw new Error("Conta não encontrada");
    }

    const db = await getDatabase();
    await db.execute(
      `UPDATE contas
       SET nome = $1, tipo = $2, contexto = $3, saldo_inicial = $4, cor = $5, icone = $6, logo_path = $7, ativo = $8,
           dia_fechamento = $9, dia_vencimento = $10, limite_credito = $11, data_saldo_inicial = $12, final_cartao = $13
       WHERE id = $14`,
      [
        input.nome ?? existing.nome,
        input.tipo ?? existing.tipo,
        input.contexto ?? existing.contexto,
        input.saldo_inicial ?? existing.saldo_inicial,
        input.cor ?? existing.cor,
        input.icone !== undefined ? input.icone : existing.icone,
        input.logo_path !== undefined ? input.logo_path : existing.logo_path,
        fromBoolean(input.ativo ?? existing.ativo),
        input.dia_fechamento !== undefined ? input.dia_fechamento : existing.dia_fechamento,
        input.dia_vencimento !== undefined ? input.dia_vencimento : existing.dia_vencimento,
        input.limite_credito !== undefined ? input.limite_credito : existing.limite_credito,
        input.data_saldo_inicial !== undefined ? input.data_saldo_inicial : existing.data_saldo_inicial,
        input.final_cartao !== undefined ? input.final_cartao : existing.final_cartao,
        id,
      ],
    );

    const conta = await getConta(id);
    if (!conta) {
      throw new Error("Falha ao atualizar conta");
    }
    return conta;
  });
}

export async function deleteConta(id: number): Promise<void> {
  return withDatabase(async () => {
    const existing = await getConta(id);
    const db = await getDatabase();
    await db.execute("DELETE FROM contas WHERE id = $1", [id]);
    if (existing?.logo_path) {
      try {
        const { removerArquivoLogo } = await import("./logosConta");
        await removerArquivoLogo(existing.logo_path);
      } catch {
        // ignore
      }
    }
  });
}

export interface ContaComSaldo extends Conta {
  saldo: number;
}

function aplicarMovimentosSaldo(
  saldoInicial: number,
  rows: { tipo: string; total: number; transferencia_papel: string | null }[],
): number {
  let saldo = saldoInicial;
  for (const row of rows) {
    if (row.tipo === "receita") saldo += row.total;
    if (row.tipo === "despesa") saldo -= row.total;
    if (row.tipo === "transferencia") {
      if (row.transferencia_papel === "entrada") saldo += row.total;
      else saldo -= row.total;
    }
  }
  return arredondarMoeda(saldo);
}

export async function getSaldoContaAteData(contaId: number, dataAte: string): Promise<number> {
  return withDatabase(async () => {
    const conta = await getConta(contaId);
    if (!conta) return 0;

    const dataInicio = conta.data_saldo_inicial;
    if (dataInicio && dataAte < dataInicio) return 0;

    const db = await getDatabase();
    let query = `SELECT tipo, transferencia_papel, COALESCE(SUM(valor), 0) as total
       FROM transacoes
       WHERE conta_id = $1 AND status = 'efetivado' AND data <= $2`;
    const params: unknown[] = [contaId, dataAte];
    if (dataInicio) {
      query += " AND data >= $3";
      params.push(dataInicio);
    }
    query += " GROUP BY tipo, transferencia_papel";

    const rows = await db.select<
      { tipo: string; total: number; transferencia_papel: string | null }[]
    >(query, params);

    const saldoBase =
      !dataInicio || dataAte >= dataInicio ? conta.saldo_inicial : 0;
    return aplicarMovimentosSaldo(saldoBase, rows);
  });
}

export async function getSaldoConta(contaId: number): Promise<number> {
  return getSaldoContaAteData(contaId, "9999-12-31");
}

/** Saldo consolidado das contas do contexto ao fim do mês anterior. */
export async function getSaldoAberturaMes(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
): Promise<number> {
  const dataCorte = ultimoDiaMesAnterior(mesReferencia);
  const contas = await listContas(contexto);
  let total = 0;
  for (const conta of contas) {
    total += await getSaldoContaAteData(conta.id, dataCorte);
  }
  return arredondarMoeda(total);
}

export async function getSaldoContextoAtual(contexto?: ContextoVisualizacao): Promise<number> {
  const contas = await listContasComSaldo(contexto);
  return arredondarMoeda(contas.reduce((s, c) => s + c.saldo, 0));
}

export async function listContasComSaldo(contexto?: ContextoVisualizacao): Promise<ContaComSaldo[]> {
  const contas = await listContas(contexto);
  return Promise.all(
    contas.map(async (conta) => ({
      ...conta,
      saldo: await getSaldoConta(conta.id),
    })),
  );
}
