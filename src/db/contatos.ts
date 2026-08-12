import { getDatabase } from "./connection";
import { nowIso, withDatabase } from "./utils";
import type {
  Contato,
  ContextoCategoria,
  ContextoVisualizacao,
  TipoContato,
} from "../types";

export interface ContatoInput {
  nome: string;
  tipo: TipoContato;
  contexto: ContextoCategoria;
  observacoes?: string | null;
}

interface ContatoRow {
  id: number;
  nome: string;
  tipo: TipoContato;
  contexto: ContextoCategoria;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

function mapContato(row: ContatoRow): Contato {
  return row;
}

export async function listContatos(
  contexto?: ContextoVisualizacao,
  tipoFiltro?: TipoContato | "pagar" | "receber",
): Promise<Contato[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    let query = "SELECT * FROM contatos WHERE 1=1";
    const params: unknown[] = [];

    if (contexto && contexto !== "consolidado") {
      query += ` AND (contexto = $${params.length + 1} OR contexto = 'ambos')`;
      params.push(contexto);
    }

    if (tipoFiltro === "pagar") {
      query += " AND tipo IN ('fornecedor', 'ambos')";
    } else if (tipoFiltro === "receber") {
      query += " AND tipo IN ('cliente', 'ambos')";
    } else if (tipoFiltro === "cliente" || tipoFiltro === "fornecedor" || tipoFiltro === "ambos") {
      query += ` AND tipo = $${params.length + 1}`;
      params.push(tipoFiltro);
    }

    query += " ORDER BY nome ASC";
    const rows = await db.select<ContatoRow[]>(query, params);
    return rows.map(mapContato);
  });
}

export async function getContato(id: number): Promise<Contato | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<ContatoRow[]>("SELECT * FROM contatos WHERE id = $1", [id]);
    return rows[0] ? mapContato(rows[0]) : null;
  });
}

export async function createContato(input: ContatoInput): Promise<Contato> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const ts = nowIso();
    const result = await db.execute(
      `INSERT INTO contatos (nome, tipo, contexto, observacoes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.nome.trim(),
        input.tipo,
        input.contexto,
        input.observacoes?.trim() || null,
        ts,
        ts,
      ],
    );
    const contato = await getContato(result.lastInsertId as number);
    if (!contato) throw new Error("Falha ao criar contato");
    return contato;
  });
}

export async function updateContato(id: number, input: Partial<ContatoInput>): Promise<Contato> {
  return withDatabase(async () => {
    const existing = await getContato(id);
    if (!existing) throw new Error("Contato não encontrado");
    const db = await getDatabase();
    await db.execute(
      `UPDATE contatos
       SET nome = $1, tipo = $2, contexto = $3, observacoes = $4, updated_at = $5
       WHERE id = $6`,
      [
        input.nome?.trim() ?? existing.nome,
        input.tipo ?? existing.tipo,
        input.contexto ?? existing.contexto,
        input.observacoes !== undefined
          ? input.observacoes?.trim() || null
          : existing.observacoes,
        nowIso(),
        id,
      ],
    );
    const updated = await getContato(id);
    if (!updated) throw new Error("Falha ao atualizar contato");
    return updated;
  });
}

export async function deleteContato(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM contatos WHERE id = $1", [id]);
  });
}
