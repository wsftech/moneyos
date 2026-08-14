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

async function aposSalvarRecorrente(item: TransacaoRecorrente): Promise<void> {
  const { mesAtual } = await import("../utils/format");
  const mes = mesAtual();
  if (item.categoria_id != null) {
    const { getCategoria } = await import("./categorias");
    const { garantirOrcamentoCategoriaMes } = await import("./orcamentos");
    const cat = await getCategoria(item.categoria_id);
    if (cat) await garantirOrcamentoCategoriaMes(cat, mes);
  }
  // Não efetiva sozinho: o valor só entra no caixa quando o usuário confirmar.
}

function dataLancamentoRecorrente(mesReferencia: string, diaMes: number): string {
  const { fim } = intervaloDoMes(mesReferencia);
  const ultimoDia = Number(fim.slice(8, 10));
  const dia = Math.min(diaMes, ultimoDia);
  const mm = mesReferencia.slice(5, 7);
  const yyyy = mesReferencia.slice(0, 4);
  return `${yyyy}-${mm}-${String(dia).padStart(2, "0")}`;
}

function hojeIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mesCriacaoRecorrente(createdAt: string): string {
  return createdAt.slice(0, 7);
}

/** Pode confirmar o lançamento deste recorrente neste mês? (mês atual, a partir da criação) */
export function podeConfirmarRecorrenteNoMes(
  rec: Pick<TransacaoRecorrente, "created_at" | "dia_mes" | "ativo">,
  mesReferencia: string,
  jaGerado: boolean,
  hoje = hojeIsoLocal(),
): boolean {
  if (!rec.ativo || jaGerado) return false;
  const mesAtual = hoje.slice(0, 7);
  if (mesReferencia !== mesAtual) return false;
  if (mesReferencia < mesCriacaoRecorrente(rec.created_at)) return false;
  return true;
}

/** @deprecated Preferir confirmarLancamentoRecorrente — não gera mais sozinho. */
export function podeGerarRecorrenteNoMes(
  rec: Pick<TransacaoRecorrente, "created_at" | "dia_mes">,
  mesReferencia: string,
  hoje = hojeIsoLocal(),
): boolean {
  const mesAtual = hoje.slice(0, 7);
  if (mesReferencia !== mesAtual) return false;
  if (mesReferencia < mesCriacaoRecorrente(rec.created_at)) return false;
  const data = dataLancamentoRecorrente(mesReferencia, rec.dia_mes);
  return data <= hoje;
}

/** Ainda é compromisso em aberto no mês (não gerou lançamento e mês >= criação). */
export function recorrentePendenteNoMes(
  rec: Pick<TransacaoRecorrente, "created_at" | "dia_mes" | "id">,
  mesReferencia: string,
  jaGerado: boolean,
): boolean {
  if (jaGerado) return false;
  if (mesReferencia < mesCriacaoRecorrente(rec.created_at)) return false;
  return true;
}

export async function recorrenteJaLancadoNoMes(
  recorrenteId: number,
  mesReferencia: string,
): Promise<boolean> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ recorrente_id: number }[]>(
      `SELECT recorrente_id FROM transacao_recorrente_lancamentos
       WHERE recorrente_id = $1 AND mes_referencia = $2`,
      [recorrenteId, mesReferencia],
    );
    return rows.length > 0;
  });
}

export async function mapRecorrentesStatusMes(
  recorrentes: TransacaoRecorrente[],
  mesReferencia: string,
): Promise<Map<number, { jaGerado: boolean; diaPassou: boolean }>> {
  const hoje = hojeIsoLocal();
  const result = new Map<number, { jaGerado: boolean; diaPassou: boolean }>();
  await withDatabase(async () => {
    const db = await getDatabase();
    for (const rec of recorrentes) {
      const rows = await db.select<{ recorrente_id: number }[]>(
        `SELECT recorrente_id FROM transacao_recorrente_lancamentos
         WHERE recorrente_id = $1 AND mes_referencia = $2`,
        [rec.id, mesReferencia],
      );
      const data = dataLancamentoRecorrente(mesReferencia, rec.dia_mes);
      result.set(rec.id, {
        jaGerado: rows.length > 0,
        diaPassou: data <= hoje,
      });
    }
  });
  return result;
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
  const created = await withDatabase(async () => {
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
  await aposSalvarRecorrente(created);
  return created;
}

export async function updateTransacaoRecorrente(
  id: number,
  input: Partial<TransacaoRecorrenteInput>,
): Promise<TransacaoRecorrente> {
  const item = await withDatabase(async () => {
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
  await aposSalvarRecorrente(item);
  return item;
}

export async function deleteTransacaoRecorrente(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM transacoes_recorrentes WHERE id = $1", [id]);
  });
}

/**
 * Antes gerava lançamentos sozinho após o dia_mes. Isso inflava o caixa antes do
 * dinheiro cair. Mantido como no-op para não quebrar chamadas existentes.
 * Use confirmarLancamentoRecorrente.
 */
export async function sincronizarTransacoesRecorrentes(
  _mesReferencia: string,
  _contexto?: ContextoVisualizacao,
): Promise<number> {
  return 0;
}

/**
 * Confirma o recorrente no mês: cria o lançamento efetivado na conta (entra no caixa).
 * Só no mês corrente; não duplica se já existir.
 */
export async function confirmarLancamentoRecorrente(
  recorrenteId: number,
  mesReferencia?: string,
): Promise<{ gerado: boolean }> {
  const hoje = hojeIsoLocal();
  const mes = mesReferencia ?? hoje.slice(0, 7);
  if (mes !== hoje.slice(0, 7)) {
    throw new Error("Só é possível confirmar recorrentes no mês atual.");
  }

  const recorrentes = await listTransacoesRecorrentes();
  const rec = recorrentes.find((r) => r.id === recorrenteId);
  if (!rec || !rec.ativo) throw new Error("Recorrente não encontrado ou inativo.");
  if (mes < mesCriacaoRecorrente(rec.created_at)) {
    throw new Error("Este recorrente ainda não vale para este mês.");
  }

  return withDatabase(async () => {
    const db = await getDatabase();
    const exists = await db.select<{ recorrente_id: number }[]>(
      `SELECT recorrente_id FROM transacao_recorrente_lancamentos
       WHERE recorrente_id = $1 AND mes_referencia = $2`,
      [rec.id, mes],
    );
    if (exists.length > 0) return { gerado: false };

    const data = dataLancamentoRecorrente(mes, rec.dia_mes);
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
      [rec.id, mes, transacao.id],
    );
    return { gerado: true };
  });
}

/**
 * Recorrentes ativos ainda sem lançamento no mês — entram como comprometido no orçamento.
 */
export async function getCompromissoRecorrentesMes(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  tipo: "receita" | "despesa" = "despesa",
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(r.valor), 0) as total
       FROM transacoes_recorrentes r
       WHERE r.ativo = 1
         AND r.tipo = $1
         AND CAST(r.categoria_id AS INTEGER) = CAST($2 AS INTEGER)
         AND r.contexto = $3
         AND substr(r.created_at, 1, 7) <= $4
         AND NOT EXISTS (
           SELECT 1 FROM transacao_recorrente_lancamentos l
           WHERE l.recorrente_id = r.id AND l.mes_referencia = $4
         )`,
      [tipo, categoriaId, contexto, mesReferencia],
    );
    return Number(rows[0]?.total ?? 0);
  });
}
