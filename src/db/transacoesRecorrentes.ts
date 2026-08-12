import { getDatabase } from "./connection";
import { createTransacao } from "./transacoes";
import {
  applyContextoFilter,
  buildContextoFilter,
  fromBoolean,
  nowIso,
  toBoolean,
  withDatabase,
} from "./utils";
import type { Contexto, ContextoVisualizacao, TransacaoRecorrente } from "../types";
import { intervaloDoMes } from "../utils/dates";

export interface TransacaoRecorrenteInput {
  descricao: string;
  valor: number;
  tipo: "receita" | "despesa";
  conta_id: number;
  categoria_id?: number | null;
  contexto: Contexto;
  dia_mes: number;
  ativo?: boolean;
  observacoes?: string | null;
}

interface RecorrenteRow {
  id: number;
  descricao: string;
  valor: number;
  tipo: "receita" | "despesa";
  conta_id: number;
  categoria_id: number | null;
  contexto: Contexto;
  dia_mes: number;
  ativo: number;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRecorrente(row: RecorrenteRow): TransacaoRecorrente {
  return { ...row, ativo: toBoolean(row.ativo) };
}

function dataLancamentoRecorrente(mesReferencia: string, diaMes: number): string {
  const { fim } = intervaloDoMes(mesReferencia);
  const ultimoDia = Number(fim.slice(8, 10));
  const dia = Math.min(diaMes, ultimoDia);
  const mm = mesReferencia.slice(5, 7);
  const yyyy = mesReferencia.slice(0, 4);
  return `${yyyy}-${mm}-${String(dia).padStart(2, "0")}`;
}

export async function listTransacoesRecorrentes(
  contexto?: ContextoVisualizacao,
): Promise<TransacaoRecorrente[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT * FROM transacoes_recorrentes WHERE 1=1${filter.clause} ORDER BY descricao ASC`,
      filter,
    );
    const rows = await db.select<RecorrenteRow[]>(query, params);
    return rows.map(mapRecorrente);
  });
}

export async function createTransacaoRecorrente(
  input: TransacaoRecorrenteInput,
): Promise<TransacaoRecorrente> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const ts = nowIso();
    const result = await db.execute(
      `INSERT INTO transacoes_recorrentes
       (descricao, valor, tipo, conta_id, categoria_id, contexto, dia_mes, ativo, observacoes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.descricao,
        input.valor,
        input.tipo,
        input.conta_id,
        input.categoria_id ?? null,
        input.contexto,
        input.dia_mes,
        fromBoolean(input.ativo ?? true),
        input.observacoes ?? null,
        ts,
        ts,
      ],
    );
    const rows = await db.select<RecorrenteRow[]>(
      "SELECT * FROM transacoes_recorrentes WHERE id = $1",
      [result.lastInsertId],
    );
    const item = rows[0];
    if (!item) throw new Error("Falha ao criar lançamento recorrente");
    return mapRecorrente(item);
  });
}

export async function updateTransacaoRecorrente(
  id: number,
  input: Partial<TransacaoRecorrenteInput>,
): Promise<TransacaoRecorrente> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<RecorrenteRow[]>(
      "SELECT * FROM transacoes_recorrentes WHERE id = $1",
      [id],
    );
    const existing = rows[0];
    if (!existing) throw new Error("Lançamento recorrente não encontrado");

    await db.execute(
      `UPDATE transacoes_recorrentes
       SET descricao = $1, valor = $2, tipo = $3, conta_id = $4, categoria_id = $5,
           contexto = $6, dia_mes = $7, ativo = $8, observacoes = $9, updated_at = $10
       WHERE id = $11`,
      [
        input.descricao ?? existing.descricao,
        input.valor ?? existing.valor,
        input.tipo ?? existing.tipo,
        input.conta_id ?? existing.conta_id,
        input.categoria_id !== undefined ? input.categoria_id : existing.categoria_id,
        input.contexto ?? existing.contexto,
        input.dia_mes ?? existing.dia_mes,
        fromBoolean(input.ativo !== undefined ? input.ativo : toBoolean(existing.ativo)),
        input.observacoes !== undefined ? input.observacoes : existing.observacoes,
        nowIso(),
        id,
      ],
    );
    const updated = await db.select<RecorrenteRow[]>(
      "SELECT * FROM transacoes_recorrentes WHERE id = $1",
      [id],
    );
    if (!updated[0]) throw new Error("Falha ao atualizar lançamento recorrente");
    return mapRecorrente(updated[0]);
  });
}

export async function deleteTransacaoRecorrente(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM transacoes_recorrentes WHERE id = $1", [id]);
  });
}

/** Gera transações efetivadas para recorrentes ativos no mês (se ainda não geradas). */
export async function sincronizarTransacoesRecorrentes(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
): Promise<number> {
  const recorrentes = await listTransacoesRecorrentes(contexto);
  let gerados = 0;

  for (const rec of recorrentes.filter((r) => r.ativo)) {
    await withDatabase(async () => {
      const db = await getDatabase();
      const exists = await db.select<{ recorrente_id: number }[]>(
        "SELECT recorrente_id FROM transacao_recorrente_lancamentos WHERE recorrente_id = $1 AND mes_referencia = $2",
        [rec.id, mesReferencia],
      );
      if (exists.length > 0) return;

      const data = dataLancamentoRecorrente(mesReferencia, rec.dia_mes);
      const transacao = await createTransacao({
        descricao: rec.descricao,
        valor: rec.valor,
        data,
        tipo: rec.tipo,
        conta_id: rec.conta_id,
        categoria_id: rec.categoria_id,
        contexto: rec.contexto,
        status: "efetivado",
        observacoes: rec.observacoes
          ? `${rec.observacoes} · Recorrente`
          : "Lançamento recorrente",
      });

      await db.execute(
        `INSERT INTO transacao_recorrente_lancamentos (recorrente_id, mes_referencia, transacao_id)
         VALUES ($1, $2, $3)`,
        [rec.id, mesReferencia, transacao.id],
      );
      gerados++;
    });
  }

  return gerados;
}
