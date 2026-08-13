import { getDatabase } from "./connection";
import { applyContextoFilter, buildContextoFilter, withDatabase } from "./utils";
import type { Contexto, ContextoVisualizacao } from "../types";
import { arredondarMoeda } from "../utils/format";

export interface AtivoManual {
  id: number;
  descricao: string;
  valor: number;
  contexto: Contexto;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtivoManualInput {
  descricao: string;
  valor: number;
  contexto: Contexto;
  observacoes?: string | null;
}

export async function listAtivosManuais(
  contexto?: ContextoVisualizacao,
): Promise<AtivoManual[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT id, descricao, valor, contexto, observacoes, created_at, updated_at
       FROM ativos_manuais
       WHERE 1=1${filter.clause}
       ORDER BY descricao COLLATE NOCASE`,
      filter,
    );
    return db.select<AtivoManual[]>(query, params);
  });
}

export async function totalAtivosManuais(
  contexto?: ContextoVisualizacao,
): Promise<number> {
  const itens = await listAtivosManuais(contexto);
  return arredondarMoeda(itens.reduce((s, a) => s + a.valor, 0));
}

export async function createAtivoManual(input: AtivoManualInput): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO ativos_manuais (descricao, valor, contexto, observacoes)
       VALUES ($1, $2, $3, $4)`,
      [input.descricao.trim(), input.valor, input.contexto, input.observacoes ?? null],
    );
    return Number(result.lastInsertId);
  });
}

export async function updateAtivoManual(
  id: number,
  input: AtivoManualInput,
): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(
      `UPDATE ativos_manuais
       SET descricao = $1, valor = $2, contexto = $3, observacoes = $4,
           updated_at = datetime('now')
       WHERE id = $5`,
      [input.descricao.trim(), input.valor, input.contexto, input.observacoes ?? null, id],
    );
  });
}

export async function deleteAtivoManual(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(`DELETE FROM ativos_manuais WHERE id = $1`, [id]);
  });
}
