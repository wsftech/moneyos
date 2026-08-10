import { getDatabase } from "./connection";
import {
  applyContextoFilter,
  buildCategoriaContextoFilter,
  sameEntityId,
  withDatabase,
} from "./utils";
import type {
  Categoria,
  Contexto,
  ContextoCategoria,
  ContextoVisualizacao,
  TipoCategoria,
} from "../types";

export interface CategoriaInput {
  nome: string;
  tipo: TipoCategoria;
  contexto: ContextoCategoria;
  cor: string;
  icone?: string | null;
}

interface CategoriaRow {
  id: number;
  nome: string;
  tipo: TipoCategoria;
  contexto: ContextoCategoria;
  cor: string;
  icone: string | null;
}

function mapCategoria(row: CategoriaRow): Categoria {
  return row;
}

export async function listCategorias(contexto?: ContextoVisualizacao): Promise<Categoria[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildCategoriaContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT * FROM categorias WHERE 1=1${filter.clause} ORDER BY nome ASC`,
      filter,
    );
    const rows = await db.select<CategoriaRow[]>(query, params);
    return rows.map(mapCategoria);
  });
}

export function findCategoriaById(
  categorias: Categoria[],
  id: number | string | null | undefined,
): Categoria | undefined {
  if (id == null) return undefined;
  return categorias.find((c) => sameEntityId(c.id, id));
}

export function filtrarCategoriasParaLancamento(
  categorias: Categoria[],
  lancamentoContexto: Contexto,
  tipo?: TipoCategoria,
): Categoria[] {
  return categorias.filter(
    (c) =>
      (c.contexto === lancamentoContexto || c.contexto === "ambos") &&
      (tipo == null || c.tipo === tipo),
  );
}

export async function getCategoria(id: number): Promise<Categoria | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<CategoriaRow[]>("SELECT * FROM categorias WHERE id = $1", [id]);
    return rows[0] ? mapCategoria(rows[0]) : null;
  });
}

export async function createCategoria(input: CategoriaInput): Promise<Categoria> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO categorias (nome, tipo, contexto, cor, icone)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.nome, input.tipo, input.contexto, input.cor, input.icone ?? null],
    );
    const categoria = await getCategoria(result.lastInsertId as number);
    if (!categoria) {
      throw new Error("Falha ao criar categoria");
    }
    return categoria;
  });
}

export async function updateCategoria(
  id: number,
  input: Partial<CategoriaInput>,
): Promise<Categoria> {
  return withDatabase(async () => {
    const existing = await getCategoria(id);
    if (!existing) {
      throw new Error("Categoria não encontrada");
    }

    const db = await getDatabase();
    await db.execute(
      `UPDATE categorias
       SET nome = $1, tipo = $2, contexto = $3, cor = $4, icone = $5
       WHERE id = $6`,
      [
        input.nome ?? existing.nome,
        input.tipo ?? existing.tipo,
        input.contexto ?? existing.contexto,
        input.cor ?? existing.cor,
        input.icone !== undefined ? input.icone : existing.icone,
        id,
      ],
    );

    const categoria = await getCategoria(id);
    if (!categoria) {
      throw new Error("Falha ao atualizar categoria");
    }
    return categoria;
  });
}

export async function deleteCategoria(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM categorias WHERE id = $1", [id]);
  });
}
