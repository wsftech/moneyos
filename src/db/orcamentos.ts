import { getDatabase } from "./connection";
import { getCompromissoContasPagarMes, getCompromissoContasReceberMes } from "./contasPagarReceber";
import { getCompromissoFinanciamentosMes } from "./financiamentos";
import { getCompromissoEmprestimosMes } from "./emprestimos";
import { buildContextoFilter, nowIso, withDatabase } from "./utils";
import type { Contexto, ContextoVisualizacao, Orcamento, TipoCategoria } from "../types";

export interface OrcamentoInput {
  categoria_id: number;
  contexto: Contexto;
  mes_referencia: string;
  valor_limite: number;
  descricao?: string | null;
  recorrente?: boolean;
  atualizar_recorrente?: boolean;
}

interface OrcamentoRow {
  id: number;
  categoria_id: number;
  contexto: Contexto;
  mes_referencia: string;
  valor_limite: number;
  descricao: string | null;
  recorrente_id: number | null;
}

interface OrcamentoRecorrenteRow {
  id: number;
  descricao: string;
  categoria_id: number;
  contexto: Contexto;
  valor_limite: number;
  ativo: number;
  created_at: string;
  updated_at: string;
}

function mapOrcamento(row: OrcamentoRow): Orcamento {
  return row;
}

function applyRecorrenteFilter(contexto?: ContextoVisualizacao): {
  query: string;
  params: unknown[];
} {
  const filter = buildContextoFilter(contexto);
  let query = "SELECT * FROM orcamento_recorrentes WHERE ativo = 1";
  let paramIndex = 1;
  if (filter.clause) {
    query += filter.clause.replace(/\$CTX/g, () => `$${paramIndex++}`);
  }
  return { query, params: filter.params };
}

async function createOrcamentoRecorrente(input: {
  descricao: string;
  categoria_id: number;
  contexto: Contexto;
  valor_limite: number;
}): Promise<number> {
  const db = await getDatabase();
  const timestamp = nowIso();
  const result = await db.execute(
    `INSERT INTO orcamento_recorrentes (descricao, categoria_id, contexto, valor_limite, ativo, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, $5, $6)`,
    [input.descricao, input.categoria_id, input.contexto, input.valor_limite, timestamp, timestamp],
  );
  return result.lastInsertId as number;
}

export async function sincronizarOrcamentosRecorrentes(
  contexto?: ContextoVisualizacao,
  mesReferencia?: string,
): Promise<void> {
  if (!mesReferencia) return;

  return withDatabase(async () => {
    const db = await getDatabase();
    const { query, params } = applyRecorrenteFilter(contexto);
    const templates = await db.select<OrcamentoRecorrenteRow[]>(query, params);

    for (const t of templates) {
      const exists = await db.select<{ id: number }[]>(
        `SELECT id FROM orcamentos WHERE recorrente_id = $1 AND mes_referencia = $2`,
        [t.id, mesReferencia],
      );
      if (exists[0]) continue;

      await db.execute(
        `INSERT INTO orcamentos (categoria_id, contexto, mes_referencia, valor_limite, descricao, recorrente_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [t.categoria_id, t.contexto, mesReferencia, t.valor_limite, t.descricao, t.id],
      );
    }
  });
}

export async function pararRecorrenciaOrcamento(recorrenteId: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(
      "UPDATE orcamento_recorrentes SET ativo = 0, updated_at = $1 WHERE id = $2",
      [nowIso(), recorrenteId],
    );
  });
}

export async function listOrcamentos(
  contexto?: ContextoVisualizacao,
  mesReferencia?: string,
): Promise<Orcamento[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    let baseQuery = "SELECT * FROM orcamentos WHERE 1=1";
    const extraParams: unknown[] = [];

    if (mesReferencia) {
      baseQuery += ` AND mes_referencia = $MES`;
      extraParams.push(mesReferencia);
    }

    baseQuery += filter.clause;
    baseQuery += " ORDER BY mes_referencia DESC, categoria_id ASC";

    let paramIndex = 1;
    let query = baseQuery;
    if (mesReferencia) {
      query = query.replace("$MES", `$${paramIndex++}`);
    }
    query = query.replace(/\$CTX/g, () => `$${paramIndex++}`);

    const params = [...extraParams, ...filter.params];
    const rows = await db.select<OrcamentoRow[]>(query, params);
    return rows.map(mapOrcamento);
  });
}

export async function getOrcamento(id: number): Promise<Orcamento | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<OrcamentoRow[]>("SELECT * FROM orcamentos WHERE id = $1", [id]);
    return rows[0] ? mapOrcamento(rows[0]) : null;
  });
}

export async function createOrcamento(input: OrcamentoInput): Promise<Orcamento> {
  return withDatabase(async () => {
    let recorrenteId: number | null = null;
    const descricao = input.descricao?.trim() || null;

    if (input.recorrente) {
      if (!descricao) {
        throw new Error("Informe a descrição do item recorrente (ex.: Aluguel).");
      }
      recorrenteId = await createOrcamentoRecorrente({
        descricao,
        categoria_id: input.categoria_id,
        contexto: input.contexto,
        valor_limite: input.valor_limite,
      });
    }

    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO orcamentos (categoria_id, contexto, mes_referencia, valor_limite, descricao, recorrente_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.categoria_id,
        input.contexto,
        input.mes_referencia,
        input.valor_limite,
        descricao,
        recorrenteId,
      ],
    );
    const orcamento = await getOrcamento(result.lastInsertId as number);
    if (!orcamento) {
      throw new Error("Falha ao criar orçamento");
    }
    return orcamento;
  });
}

/**
 * Cria envelope recorrente da parcela (se ainda não existir item igual no mês),
 * para a dívida aparecer no orçamento automaticamente.
 */
export async function garantirOrcamentoParcelaDivida(input: {
  descricao: string;
  categoria_id: number;
  contexto: Contexto;
  valor_parcela: number;
  mes_referencia: string;
}): Promise<Orcamento | null> {
  const descricao = input.descricao.trim();
  if (!descricao || input.valor_parcela <= 0) return null;

  await sincronizarOrcamentosRecorrentes(input.contexto, input.mes_referencia);
  const existentes = await listOrcamentos(input.contexto, input.mes_referencia);
  const jaExiste = existentes.some(
    (o) =>
      o.categoria_id === input.categoria_id &&
      o.contexto === input.contexto &&
      (o.descricao ?? "").trim().toLowerCase() === descricao.toLowerCase(),
  );
  if (jaExiste) return null;

  return createOrcamento({
    categoria_id: input.categoria_id,
    contexto: input.contexto,
    mes_referencia: input.mes_referencia,
    valor_limite: input.valor_parcela,
    descricao,
    recorrente: true,
  });
}

export async function updateOrcamento(
  id: number,
  input: Partial<OrcamentoInput>,
): Promise<Orcamento> {
  return withDatabase(async () => {
    const existing = await getOrcamento(id);
    if (!existing) {
      throw new Error("Orçamento não encontrado");
    }

    const db = await getDatabase();
    const descricao =
      input.descricao !== undefined ? input.descricao?.trim() || null : existing.descricao;
    const valorLimite = input.valor_limite ?? existing.valor_limite;

    await db.execute(
      `UPDATE orcamentos
       SET categoria_id = $1, contexto = $2, mes_referencia = $3, valor_limite = $4, descricao = $5
       WHERE id = $6`,
      [
        input.categoria_id ?? existing.categoria_id,
        input.contexto ?? existing.contexto,
        input.mes_referencia ?? existing.mes_referencia,
        valorLimite,
        descricao,
        id,
      ],
    );

    if (input.atualizar_recorrente && existing.recorrente_id) {
      await db.execute(
        `UPDATE orcamento_recorrentes
         SET descricao = $1, valor_limite = $2, categoria_id = $3, updated_at = $4
         WHERE id = $5`,
        [
          descricao ?? "",
          valorLimite,
          input.categoria_id ?? existing.categoria_id,
          nowIso(),
          existing.recorrente_id,
        ],
      );
      await db.execute(
        `UPDATE orcamentos
         SET valor_limite = $1, descricao = $2, categoria_id = $3
         WHERE recorrente_id = $4 AND mes_referencia >= $5`,
        [
          valorLimite,
          descricao,
          input.categoria_id ?? existing.categoria_id,
          existing.recorrente_id,
          existing.mes_referencia,
        ],
      );
    }

    const orcamento = await getOrcamento(id);
    if (!orcamento) {
      throw new Error("Falha ao atualizar orçamento");
    }
    return orcamento;
  });
}

export async function deleteOrcamento(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM orcamentos WHERE id = $1", [id]);
  });
}

function mesAnterior(mesReferencia: string): string {
  const [y, m] = mesReferencia.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

export async function copiarOrcamentosDoMesAnterior(
  mesDestino: string,
  contexto?: ContextoVisualizacao,
): Promise<number> {
  await sincronizarOrcamentosRecorrentes(contexto, mesDestino);
  const origem = mesAnterior(mesDestino);
  const [doMesAnterior, doDestino] = await Promise.all([
    listOrcamentos(contexto, origem),
    listOrcamentos(contexto, mesDestino),
  ]);
  const existentes = new Set(
    doDestino.map(
      (o) => `${o.categoria_id}|${o.contexto}|${o.descricao ?? ""}|${o.recorrente_id ?? ""}`,
    ),
  );
  let copiados = 0;
  for (const o of doMesAnterior) {
    const key = `${o.categoria_id}|${o.contexto}|${o.descricao ?? ""}|${o.recorrente_id ?? ""}`;
    if (existentes.has(key)) continue;
    await createOrcamento({
      categoria_id: o.categoria_id,
      contexto: o.contexto,
      mes_referencia: mesDestino,
      valor_limite: o.valor_limite,
      descricao: o.descricao,
    });
    copiados++;
  }
  return copiados;
}

export async function getGastoRealOrcamento(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
): Promise<number> {
  return getRealizadoOrcamento(categoriaId, contexto, mesReferencia, "despesa");
}

export async function getReceitaRealOrcamento(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
): Promise<number> {
  return getRealizadoOrcamento(categoriaId, contexto, mesReferencia, "receita");
}

async function getLimiteCategoriaMes(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
): Promise<number | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(valor_limite), 0) as total
       FROM orcamentos
       WHERE categoria_id = $1 AND contexto = $2 AND mes_referencia = $3`,
      [categoriaId, contexto, mesReferencia],
    );
    const total = Number(rows[0]?.total ?? 0);
    return total > 0 ? total : null;
  });
}

/**
 * Realizado no mês: despesas de cartão entram pelo mês de fechamento da fatura
 * (competência do ciclo); demais lançamentos pela data.
 */
async function getRealizadoOrcamento(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  tipo: TipoCategoria,
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    if (tipo === "receita") {
      const rows = await db.select<{ total: number }[]>(
        `SELECT COALESCE(SUM(valor), 0) as total
         FROM transacoes
         WHERE status = 'efetivado'
           AND tipo = 'receita'
           AND categoria_id = $1
           AND contexto = $2
           AND data LIKE $3`,
        [categoriaId, contexto, `${mesReferencia}%`],
      );
      return Number(rows[0]?.total ?? 0);
    }

    const rows = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(t.valor), 0) as total
       FROM transacoes t
       LEFT JOIN faturas_cartao f ON CAST(f.id AS INTEGER) = CAST(t.fatura_cartao_id AS INTEGER)
       WHERE t.status = 'efetivado'
         AND t.tipo = 'despesa'
         AND t.categoria_id = $1
         AND t.contexto = $2
         AND (
           (t.fatura_cartao_id IS NOT NULL AND f.mes_referencia = $3)
           OR (t.fatura_cartao_id IS NULL AND t.data LIKE $4)
         )`,
      [categoriaId, contexto, mesReferencia, `${mesReferencia}%`],
    );
    return Number(rows[0]?.total ?? 0);
  });
}

async function getTipoCategoria(categoriaId: number): Promise<TipoCategoria> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ tipo: TipoCategoria }[]>(
      "SELECT tipo FROM categorias WHERE id = $1",
      [categoriaId],
    );
    return rows[0]?.tipo ?? "despesa";
  });
}

export async function getCompromissoOrcamento(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  tipoCategoria?: TipoCategoria,
): Promise<number> {
  const tipo = tipoCategoria ?? (await getTipoCategoria(categoriaId));
  if (tipo === "receita") {
    return getCompromissoReceitasOrcamento(categoriaId, contexto, mesReferencia);
  }
  const [financiamentos, emprestimos, contasPagar] = await Promise.all([
    getCompromissoFinanciamentosMes(categoriaId, contexto, mesReferencia),
    getCompromissoEmprestimosMes(categoriaId, contexto, mesReferencia),
    getCompromissoContasPagarMes(categoriaId, contexto, mesReferencia),
  ]);
  return financiamentos + emprestimos + contasPagar;
}

export async function getCompromissoReceitasOrcamento(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  excludeContaId?: number,
): Promise<number> {
  return getCompromissoContasReceberMes(categoriaId, contexto, mesReferencia, excludeContaId);
}

export interface ProgressoOrcamentoCategoria {
  valor_limite: number | null;
  tipo_categoria: TipoCategoria;
  gasto: number;
  comprometido: number;
  total_usado: number;
  percentual: number;
  disponivel: number | null;
}

export async function getProgressoOrcamentoCategoria(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  options?: { excludeContaId?: number; excludeContaPagarId?: number; valorExtra?: number },
): Promise<ProgressoOrcamentoCategoria> {
  const excludeContaId = options?.excludeContaId ?? options?.excludeContaPagarId;
  const tipoCategoria = await getTipoCategoria(categoriaId);

  const [realizado, valorLimite] = await Promise.all([
    tipoCategoria === "receita"
      ? getReceitaRealOrcamento(categoriaId, contexto, mesReferencia)
      : getGastoRealOrcamento(categoriaId, contexto, mesReferencia),
    getLimiteCategoriaMes(categoriaId, contexto, mesReferencia),
  ]);

  let comprometido: number;
  if (tipoCategoria === "receita") {
    comprometido =
      (await getCompromissoContasReceberMes(
        categoriaId,
        contexto,
        mesReferencia,
        excludeContaId,
      )) + (options?.valorExtra ?? 0);
  } else {
    const [financiamentos, emprestimos, contasPagar] = await Promise.all([
      getCompromissoFinanciamentosMes(categoriaId, contexto, mesReferencia),
      getCompromissoEmprestimosMes(categoriaId, contexto, mesReferencia),
      getCompromissoContasPagarMes(categoriaId, contexto, mesReferencia, excludeContaId),
    ]);
    comprometido = financiamentos + emprestimos + contasPagar + (options?.valorExtra ?? 0);
  }

  const total_usado = realizado + comprometido;
  const percentual =
    valorLimite && valorLimite > 0 ? Math.min((total_usado / valorLimite) * 100, 999) : 0;
  const disponivel = valorLimite != null ? valorLimite - total_usado : null;

  return {
    valor_limite: valorLimite,
    tipo_categoria: tipoCategoria,
    gasto: realizado,
    comprometido,
    total_usado,
    percentual,
    disponivel,
  };
}

export type OrcamentoComProgresso = Orcamento & {
  tipo_categoria: TipoCategoria;
  gasto: number;
  comprometido: number;
  total_usado: number;
  percentual: number;
};

export async function getOrcamentosComProgresso(
  contexto?: ContextoVisualizacao,
  mesReferencia?: string,
): Promise<OrcamentoComProgresso[]> {
  if (mesReferencia) {
    await sincronizarOrcamentosRecorrentes(contexto, mesReferencia);
  }
  const orcamentos = await listOrcamentos(contexto, mesReferencia);

  /** Cache por categoria+contexto+mês para não recalcular e para envelope compartilhado */
  const cache = new Map<
    string,
    { tipo_categoria: TipoCategoria; gasto: number; comprometido: number; limiteEnvelope: number | null }
  >();

  async function progressoCategoria(
    categoriaId: number,
    ctx: Contexto,
    mes: string,
  ) {
    const key = `${categoriaId}|${ctx}|${mes}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const tipo_categoria = await getTipoCategoria(categoriaId);
    const [gasto, comprometido, limiteEnvelope] = await Promise.all([
      tipo_categoria === "receita"
        ? getReceitaRealOrcamento(categoriaId, ctx, mes)
        : getGastoRealOrcamento(categoriaId, ctx, mes),
      getCompromissoOrcamento(categoriaId, ctx, mes, tipo_categoria),
      getLimiteCategoriaMes(categoriaId, ctx, mes),
    ]);
    const value = { tipo_categoria, gasto, comprometido, limiteEnvelope };
    cache.set(key, value);
    return value;
  }

  return Promise.all(
    orcamentos.map(async (orcamento) => {
      const prog = await progressoCategoria(
        orcamento.categoria_id,
        orcamento.contexto,
        orcamento.mes_referencia,
      );
      const total_usado = prog.gasto + prog.comprometido;
      /** Envelope = soma dos limites da categoria no mês (itens irmãos compartilham) */
      const limiteRef = prog.limiteEnvelope ?? orcamento.valor_limite;
      const percentual =
        limiteRef > 0 ? Math.min((total_usado / limiteRef) * 100, 999) : 0;
      return {
        ...orcamento,
        tipo_categoria: prog.tipo_categoria,
        gasto: prog.gasto,
        comprometido: prog.comprometido,
        total_usado,
        percentual,
      };
    }),
  );
}
