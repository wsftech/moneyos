import { getDatabase } from "./connection";
import {
  fromBoolean,
  toBoolean,
  withDatabase,
} from "./utils";
import type {
  Contexto,
  ContextoCategoria,
  RegraCategorizacao,
  TipoTransacao,
} from "../types";

export interface RegraCategorizacaoInput {
  padrao: string;
  categoria_id: number;
  contexto: ContextoCategoria;
  tipo?: "receita" | "despesa" | "ambos";
  prioridade?: number;
  ativo?: boolean;
}

interface RegraRow {
  id: number;
  padrao: string;
  categoria_id: number;
  contexto: ContextoCategoria;
  tipo: "receita" | "despesa" | "ambos";
  prioridade: number;
  ativo: number;
  created_at: string;
}

function mapRegra(row: RegraRow): RegraCategorizacao {
  return { ...row, ativo: toBoolean(row.ativo) };
}

export async function listRegrasCategorizacao(): Promise<RegraCategorizacao[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<RegraRow[]>(
      "SELECT * FROM regras_categorizacao ORDER BY prioridade DESC, padrao ASC",
    );
    return rows.map(mapRegra);
  });
}

export async function createRegraCategorizacao(
  input: RegraCategorizacaoInput,
): Promise<RegraCategorizacao> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO regras_categorizacao (padrao, categoria_id, contexto, tipo, prioridade, ativo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.padrao.trim().toUpperCase(),
        input.categoria_id,
        input.contexto,
        input.tipo ?? "despesa",
        input.prioridade ?? 0,
        fromBoolean(input.ativo ?? true),
      ],
    );
    const rows = await db.select<RegraRow[]>(
      "SELECT * FROM regras_categorizacao WHERE id = $1",
      [result.lastInsertId],
    );
    if (!rows[0]) throw new Error("Falha ao criar regra");
    return mapRegra(rows[0]);
  });
}

export async function updateRegraCategorizacao(
  id: number,
  input: Partial<RegraCategorizacaoInput>,
): Promise<RegraCategorizacao> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<RegraRow[]>(
      "SELECT * FROM regras_categorizacao WHERE id = $1",
      [id],
    );
    const existing = rows[0];
    if (!existing) throw new Error("Regra não encontrada");

    await db.execute(
      `UPDATE regras_categorizacao
       SET padrao = $1, categoria_id = $2, contexto = $3, tipo = $4, prioridade = $5, ativo = $6
       WHERE id = $7`,
      [
        input.padrao !== undefined ? input.padrao.trim().toUpperCase() : existing.padrao,
        input.categoria_id ?? existing.categoria_id,
        input.contexto ?? existing.contexto,
        input.tipo ?? existing.tipo,
        input.prioridade ?? existing.prioridade,
        fromBoolean(input.ativo !== undefined ? input.ativo : toBoolean(existing.ativo)),
        id,
      ],
    );
    const updated = await db.select<RegraRow[]>(
      "SELECT * FROM regras_categorizacao WHERE id = $1",
      [id],
    );
    if (!updated[0]) throw new Error("Falha ao atualizar regra");
    return mapRegra(updated[0]);
  });
}

export async function deleteRegraCategorizacao(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM regras_categorizacao WHERE id = $1", [id]);
  });
}

/** Resolve categoria por descrição (primeira regra que bater). */
export async function resolverCategoriaPorDescricao(
  descricao: string,
  contexto: Contexto,
  tipo: TipoTransacao,
): Promise<number | null> {
  if (tipo === "transferencia") return null;

  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<RegraRow[]>(
      `SELECT * FROM regras_categorizacao
       WHERE ativo = 1
         AND (contexto = $1 OR contexto = 'ambos')
         AND (tipo = $2 OR tipo = 'ambos')
       ORDER BY prioridade DESC, id ASC`,
      [contexto, tipo],
    );

    const upper = descricao.toUpperCase();
    for (const row of rows) {
      if (upper.includes(row.padrao)) {
        return row.categoria_id;
      }
    }
    return null;
  });
}

/** Sugere categoria para preview na UI (sem persistir). */
export async function sugerirCategoria(
  descricao: string,
  contexto: Contexto,
  tipo: "receita" | "despesa",
): Promise<number | null> {
  return resolverCategoriaPorDescricao(descricao, contexto, tipo);
}
