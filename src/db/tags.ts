import { getDatabase } from "./connection";
import { buildCategoriaContextoFilter, withDatabase } from "./utils";
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
