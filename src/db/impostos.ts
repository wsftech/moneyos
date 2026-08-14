import { getDatabase } from "./connection";
import { createTransacao } from "./transacoes";
import {
  applyContextoFilter,
  buildContextoFilter,
  todayIsoDate,
  withDatabase,
} from "./utils";
import type {
  Contexto,
  ContextoVisualizacao,
  Imposto,
  StatusImposto,
  Transacao,
} from "../types";
import {
  descricaoPadraoImposto,
  type TipoTributo,
} from "../constants/tiposImposto";

export interface ImpostoInput {
  tipo_tributo: TipoTributo | string;
  descricao?: string;
  valor: number;
  competencia: string;
  vencimento: string;
  contexto?: Contexto;
  status?: StatusImposto;
  categoria_id?: number | null;
  codigo_guia?: string | null;
  observacoes?: string | null;
}

export interface ImpostoFilters {
  contexto?: ContextoVisualizacao;
  status?: StatusImposto;
  tipo_tributo?: string;
  competencia?: string;
}

export interface EfetivarImpostoInput {
  conta_id: number;
  categoria_id?: number | null;
  data?: string;
}

interface ImpostoRow {
  id: number;
  tipo_tributo: string;
  descricao: string;
  valor: number;
  competencia: string;
  vencimento: string;
  contexto: Contexto;
  status: StatusImposto;
  categoria_id: number | null;
  transacao_id: number | null;
  codigo_guia: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

function mapImposto(row: ImpostoRow): Imposto {
  return {
    ...row,
    codigo_guia: row.codigo_guia ?? null,
    observacoes: row.observacoes ?? null,
  };
}

function calcularStatus(vencimento: string, atual: StatusImposto = "pendente"): StatusImposto {
  if (atual === "pago") return "pago";
  return vencimento < todayIsoDate() ? "atrasado" : "pendente";
}

function buildFilters(filters: ImpostoFilters = {}): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.contexto && filters.contexto !== "consolidado") {
    clauses.push("contexto = $" + (params.length + 1));
    params.push(filters.contexto);
  } else if (!filters.contexto || filters.contexto === "consolidado") {
    // Impostos são de empresa; em consolidado ainda listamos só empresa
    clauses.push("contexto = $" + (params.length + 1));
    params.push("empresa");
  }
  if (filters.status) {
    clauses.push("status = $" + (params.length + 1));
    params.push(filters.status);
  }
  if (filters.tipo_tributo) {
    clauses.push("tipo_tributo = $" + (params.length + 1));
    params.push(filters.tipo_tributo);
  }
  if (filters.competencia) {
    clauses.push("competencia = $" + (params.length + 1));
    params.push(filters.competencia);
  }

  return { clauses, params };
}

export async function sincronizarStatusImpostos(): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(
      `UPDATE impostos
       SET status = 'atrasado', updated_at = datetime('now')
       WHERE status = 'pendente' AND vencimento < $1`,
      [todayIsoDate()],
    );
  });
}

export async function listImpostos(filters: ImpostoFilters = {}): Promise<Imposto[]> {
  await sincronizarStatusImpostos();
  return withDatabase(async () => {
    const db = await getDatabase();
    const { clauses, params } = buildFilters(filters);
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = await db.select<ImpostoRow[]>(
      `SELECT * FROM impostos${where} ORDER BY vencimento ASC, id ASC`,
      params,
    );
    return rows.map(mapImposto);
  });
}

export async function getImposto(id: number): Promise<Imposto | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<ImpostoRow[]>("SELECT * FROM impostos WHERE id = $1", [id]);
    return rows[0] ? mapImposto(rows[0]) : null;
  });
}

export async function createImposto(input: ImpostoInput): Promise<Imposto> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const contexto = input.contexto ?? "empresa";
    const status = input.status ?? calcularStatus(input.vencimento, "pendente");
    const descricao =
      input.descricao?.trim() ||
      descricaoPadraoImposto(input.tipo_tributo as TipoTributo, input.competencia);
    const result = await db.execute(
      `INSERT INTO impostos
       (tipo_tributo, descricao, valor, competencia, vencimento, contexto, status,
        categoria_id, codigo_guia, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.tipo_tributo,
        descricao,
        input.valor,
        input.competencia,
        input.vencimento,
        contexto,
        status,
        input.categoria_id ?? null,
        input.codigo_guia?.trim() || null,
        input.observacoes?.trim() || null,
      ],
    );
    const item = await getImposto(result.lastInsertId as number);
    if (!item) throw new Error("Falha ao criar guia de imposto");
    return item;
  });
}

export async function updateImposto(
  id: number,
  input: Partial<ImpostoInput>,
): Promise<Imposto> {
  return withDatabase(async () => {
    const existing = await getImposto(id);
    if (!existing) throw new Error("Guia de imposto não encontrada");

    const vencimento = input.vencimento ?? existing.vencimento;
    const competencia = input.competencia ?? existing.competencia;
    const tipo = input.tipo_tributo ?? existing.tipo_tributo;
    const status =
      input.status ??
      (existing.status === "pago" ? existing.status : calcularStatus(vencimento, existing.status));
    const descricao =
      input.descricao !== undefined
        ? input.descricao.trim() ||
          descricaoPadraoImposto(tipo as TipoTributo, competencia)
        : existing.descricao;

    const db = await getDatabase();
    await db.execute(
      `UPDATE impostos
       SET tipo_tributo = $1, descricao = $2, valor = $3, competencia = $4, vencimento = $5,
           contexto = $6, status = $7, categoria_id = $8, codigo_guia = $9, observacoes = $10,
           updated_at = datetime('now')
       WHERE id = $11`,
      [
        tipo,
        descricao,
        input.valor ?? existing.valor,
        competencia,
        vencimento,
        input.contexto ?? existing.contexto,
        status,
        input.categoria_id !== undefined ? input.categoria_id : existing.categoria_id,
        input.codigo_guia !== undefined
          ? input.codigo_guia?.trim() || null
          : existing.codigo_guia,
        input.observacoes !== undefined
          ? input.observacoes?.trim() || null
          : existing.observacoes,
        id,
      ],
    );

    const item = await getImposto(id);
    if (!item) throw new Error("Falha ao atualizar guia de imposto");
    return item;
  });
}

export async function updateImpostoStatus(
  id: number,
  status: StatusImposto,
  transacaoId?: number | null,
): Promise<Imposto> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(
      `UPDATE impostos
       SET status = $1, transacao_id = $2, updated_at = datetime('now')
       WHERE id = $3`,
      [status, transacaoId ?? null, id],
    );
    const item = await getImposto(id);
    if (!item) throw new Error("Guia de imposto não encontrada");
    return item;
  });
}

export async function deleteImposto(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM impostos WHERE id = $1", [id]);
  });
}

export async function efetivarImposto(
  id: number,
  input: EfetivarImpostoInput,
): Promise<{ item: Imposto; transacao: Transacao }> {
  return withDatabase(async () => {
    const item = await getImposto(id);
    if (!item) throw new Error("Guia de imposto não encontrada");
    if (item.status === "pago") throw new Error("Esta guia já foi paga");

    const transacao = await createTransacao({
      descricao: item.descricao,
      valor: item.valor,
      data: input.data ?? todayIsoDate(),
      tipo: "despesa",
      conta_id: input.conta_id,
      categoria_id: input.categoria_id ?? item.categoria_id ?? null,
      contexto: item.contexto,
      status: "efetivado",
      observacoes: `Pagamento de imposto #${item.id}${item.codigo_guia ? ` · guia ${item.codigo_guia}` : ""}`,
    });

    const atualizado = await updateImpostoStatus(id, "pago", transacao.id);
    return { item: atualizado, transacao };
  });
}

/** Compromisso de impostos abertos no orçamento da categoria (mês de competência). */
export async function getCompromissoImpostosMes(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  excludeId?: number,
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const inicioMes = `${mesReferencia}-01`;
    let query = `SELECT COALESCE(SUM(valor), 0) as total
       FROM impostos
       WHERE status IN ('pendente', 'atrasado')
         AND categoria_id = $1
         AND contexto = $2
         AND (
           competencia = $3
           OR (
             status = 'atrasado'
             AND competencia < $3
             AND vencimento < $4
           )
         )`;
    const params: unknown[] = [categoriaId, contexto, mesReferencia, inicioMes];
    if (excludeId) {
      query += " AND id != $5";
      params.push(excludeId);
    }
    const rows = await db.select<{ total: number }[]>(query, params);
    return Number(rows[0]?.total ?? 0);
  });
}

/** Lista impostos abertos para próximos vencimentos (sempre empresa). */
export async function listImpostosAbertos(
  contexto?: ContextoVisualizacao,
): Promise<Imposto[]> {
  await sincronizarStatusImpostos();
  return withDatabase(async () => {
    const db = await getDatabase();
    // Pessoal: não há impostos. Empresa/consolidado: só empresa.
    if (contexto === "pessoal") return [];
    const filter = buildContextoFilter("empresa");
    const { query, params } = applyContextoFilter(
      `SELECT * FROM impostos
       WHERE status IN ('pendente', 'atrasado')${filter.clause}
       ORDER BY vencimento ASC, id ASC`,
      filter,
    );
    const rows = await db.select<ImpostoRow[]>(query, params);
    return rows.map(mapImposto);
  });
}
