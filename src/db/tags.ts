import { getDatabase } from "./connection";
import { buildCategoriaContextoFilter, buildContextoFilter, withDatabase } from "./utils";
import type { ContextoCategoria, ContextoVisualizacao, Tag } from "../types";

export interface TagInput {
  nome: string;
  contexto: ContextoCategoria;
  cor?: string;
}

interface TagRow {
  id: number;
  nome: string;
  contexto: ContextoCategoria;
  cor: string;
}

function mapTag(row: TagRow): Tag {
  return row;
}

export async function listTags(contexto?: ContextoVisualizacao): Promise<Tag[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildCategoriaContextoFilter(contexto);
    let query = "SELECT * FROM tags WHERE 1=1" + filter.clause + " ORDER BY nome ASC";
    let paramIndex = 1;
    query = query.replace(/\$CTX/g, () => `$${paramIndex++}`);
    const rows = await db.select<TagRow[]>(query, filter.params);
    return rows.map(mapTag);
  });
}

export async function createTag(input: TagInput): Promise<Tag> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const result = await db.execute(
      "INSERT INTO tags (nome, contexto, cor) VALUES ($1, $2, $3)",
      [input.nome.trim(), input.contexto, input.cor ?? "#6366f1"],
    );
    const rows = await db.select<TagRow[]>("SELECT * FROM tags WHERE id = $1", [
      result.lastInsertId,
    ]);
    if (!rows[0]) throw new Error("Falha ao criar tag");
    return mapTag(rows[0]);
  });
}

export async function deleteTag(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM tags WHERE id = $1", [id]);
  });
}

export async function getTagsTransacao(transacaoId: number): Promise<Tag[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<TagRow[]>(
      `SELECT t.* FROM tags t
       JOIN transacao_tags tt ON tt.tag_id = t.id
       WHERE tt.transacao_id = $1
       ORDER BY t.nome`,
      [transacaoId],
    );
    return rows.map(mapTag);
  });
}

export async function setTagsTransacao(transacaoId: number, tagIds: number[]): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM transacao_tags WHERE transacao_id = $1", [transacaoId]);
    for (const tagId of tagIds) {
      await db.execute(
        "INSERT INTO transacao_tags (transacao_id, tag_id) VALUES ($1, $2)",
        [transacaoId, tagId],
      );
    }
  });
}

export async function getTagsPorTransacoes(
  transacaoIds: number[],
): Promise<Map<number, Tag[]>> {
  const map = new Map<number, Tag[]>();
  if (transacaoIds.length === 0) return map;

  return withDatabase(async () => {
    const db = await getDatabase();
    const placeholders = transacaoIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.select<
      { transacao_id: number; id: number; nome: string; contexto: ContextoCategoria; cor: string }[]
    >(
      `SELECT tt.transacao_id, t.id, t.nome, t.contexto, t.cor
       FROM transacao_tags tt
       JOIN tags t ON t.id = tt.tag_id
       WHERE tt.transacao_id IN (${placeholders})
       ORDER BY t.nome`,
      transacaoIds,
    );
    for (const row of rows) {
      const list = map.get(row.transacao_id) ?? [];
      list.push({ id: row.id, nome: row.nome, contexto: row.contexto, cor: row.cor });
      map.set(row.transacao_id, list);
    }
    return map;
  });
}

export async function getResultadoPorTag(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
): Promise<import("../types").ResultadoPorTag[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto, "tr.contexto");
    let query = `SELECT tg.id AS tag_id,
              tg.nome AS tag_nome,
              tg.cor AS tag_cor,
              COALESCE(SUM(CASE WHEN tr.tipo = 'receita' THEN tr.valor ELSE 0 END), 0) AS receitas,
              COALESCE(SUM(CASE WHEN tr.tipo = 'despesa' THEN tr.valor ELSE 0 END), 0) AS despesas
       FROM tags tg
       JOIN transacao_tags tt ON tt.tag_id = tg.id
       JOIN transacoes tr ON tr.id = tt.transacao_id
       WHERE tr.status = 'efetivado'
         AND tr.tipo IN ('receita', 'despesa')
         AND tr.data LIKE $1`;
    const params: unknown[] = [`${mesReferencia}%`];

    if (filter.clause) {
      query += filter.clause.replace(/\$CTX/g, () => `$${params.length + 1}`);
      params.push(...filter.params);
    }

    query += ` GROUP BY tg.id, tg.nome, tg.cor
       HAVING receitas > 0 OR despesas > 0
       ORDER BY (receitas - despesas) ASC, tg.nome ASC`;

    const rows = await db.select<
      {
        tag_id: number;
        tag_nome: string;
        tag_cor: string;
        receitas: number | string;
        despesas: number | string;
      }[]
    >(query, params);

    return rows.map((r) => {
      const receitas = Number(r.receitas);
      const despesas = Number(r.despesas);
      return {
        tag_id: Number(r.tag_id),
        tag_nome: r.tag_nome,
        tag_cor: r.tag_cor,
        receitas,
        despesas,
        resultado: Math.round((receitas - despesas) * 100) / 100,
      };
    });
  });
}
