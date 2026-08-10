import { getSaldoConta } from "./contas";
import { getDatabase } from "./connection";
import {
  applyContextoFilter,
  buildContextoFilter,
  fromBoolean,
  nowIso,
  toBoolean,
  withDatabase,
} from "./utils";
import type {
  Contexto,
  ContextoVisualizacao,
  MetaFinanceira,
  MetaFinanceiraComProgresso,
} from "../types";
import { arredondarMoeda } from "../utils/format";

export interface MetaFinanceiraInput {
  nome: string;
  valor_alvo: number;
  valor_atual?: number;
  contexto: Contexto;
  conta_id?: number | null;
  prazo?: string | null;
  cor?: string;
  ativo?: boolean;
}

interface MetaRow {
  id: number;
  nome: string;
  valor_alvo: number;
  valor_atual: number;
  contexto: Contexto;
  conta_id: number | null;
  prazo: string | null;
  cor: string;
  ativo: number;
  created_at: string;
  updated_at: string;
}

function mapMeta(row: MetaRow): MetaFinanceira {
  return { ...row, ativo: toBoolean(row.ativo) };
}

async function valorAtualEfetivo(meta: MetaFinanceira): Promise<number> {
  if (meta.conta_id) {
    return Math.max(0, await getSaldoConta(meta.conta_id));
  }
  return meta.valor_atual;
}

async function comProgresso(meta: MetaFinanceira): Promise<MetaFinanceiraComProgresso> {
  const valor_atual_efetivo = await valorAtualEfetivo(meta);
  const percentual =
    meta.valor_alvo > 0 ? Math.min((valor_atual_efetivo / meta.valor_alvo) * 100, 999) : 0;
  return { ...meta, valor_atual_efetivo, percentual };
}

export async function listMetasFinanceiras(
  contexto?: ContextoVisualizacao,
): Promise<MetaFinanceiraComProgresso[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT * FROM metas_financeiras WHERE ativo = 1${filter.clause} ORDER BY nome ASC`,
      filter,
    );
    const rows = await db.select<MetaRow[]>(query, params);
    return Promise.all(rows.map((r) => comProgresso(mapMeta(r))));
  });
}

export async function createMetaFinanceira(
  input: MetaFinanceiraInput,
): Promise<MetaFinanceiraComProgresso> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const ts = nowIso();
    const result = await db.execute(
      `INSERT INTO metas_financeiras
       (nome, valor_alvo, valor_atual, contexto, conta_id, prazo, cor, ativo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.nome,
        input.valor_alvo,
        input.valor_atual ?? 0,
        input.contexto,
        input.conta_id ?? null,
        input.prazo ?? null,
        input.cor ?? "#6366f1",
        fromBoolean(input.ativo ?? true),
        ts,
        ts,
      ],
    );
    const rows = await db.select<MetaRow[]>(
      "SELECT * FROM metas_financeiras WHERE id = $1",
      [result.lastInsertId],
    );
    const meta = rows[0];
    if (!meta) throw new Error("Falha ao criar meta");
    return comProgresso(mapMeta(meta));
  });
}

export async function updateMetaFinanceira(
  id: number,
  input: Partial<MetaFinanceiraInput>,
): Promise<MetaFinanceiraComProgresso> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<MetaRow[]>("SELECT * FROM metas_financeiras WHERE id = $1", [id]);
    const existing = rows[0];
    if (!existing) throw new Error("Meta não encontrada");

    await db.execute(
      `UPDATE metas_financeiras
       SET nome = $1, valor_alvo = $2, valor_atual = $3, contexto = $4, conta_id = $5,
           prazo = $6, cor = $7, ativo = $8, updated_at = $9
       WHERE id = $10`,
      [
        input.nome ?? existing.nome,
        input.valor_alvo ?? existing.valor_alvo,
        input.valor_atual ?? existing.valor_atual,
        input.contexto ?? existing.contexto,
        input.conta_id !== undefined ? input.conta_id : existing.conta_id,
        input.prazo !== undefined ? input.prazo : existing.prazo,
        input.cor ?? existing.cor,
        fromBoolean(input.ativo !== undefined ? input.ativo : toBoolean(existing.ativo)),
        nowIso(),
        id,
      ],
    );
    const updated = await db.select<MetaRow[]>(
      "SELECT * FROM metas_financeiras WHERE id = $1",
      [id],
    );
    if (!updated[0]) throw new Error("Falha ao atualizar meta");
    return comProgresso(mapMeta(updated[0]));
  });
}

export async function deleteMetaFinanceira(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM metas_financeiras WHERE id = $1", [id]);
  });
}

export async function getResumoMetas(contexto?: ContextoVisualizacao): Promise<{
  total_alvo: number;
  total_atual: number;
  percentual_geral: number;
}> {
  const metas = await listMetasFinanceiras(contexto);
  const total_alvo = arredondarMoeda(metas.reduce((s, m) => s + m.valor_alvo, 0));
  const total_atual = arredondarMoeda(metas.reduce((s, m) => s + m.valor_atual_efetivo, 0));
  const percentual_geral =
    total_alvo > 0 ? Math.min((total_atual / total_alvo) * 100, 999) : 0;
  return { total_alvo, total_atual, percentual_geral };
}
