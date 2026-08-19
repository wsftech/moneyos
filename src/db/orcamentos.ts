import { getDatabase } from "./connection";
import { getCompromissoContasPagarMes, getCompromissoContasReceberMes } from "./contasPagarReceber";
import { getCompromissoImpostosMes } from "./impostos";
import { getCompromissoFinanciamentosMes } from "./financiamentos";
import { getCompromissoEmprestimosMes } from "./emprestimos";
import { getCompromissoRecorrentesMes } from "./transacoesRecorrentes";
import { buildContextoFilter, isUniqueConstraintError, nowIso, sameEntityId, withDatabase } from "./utils";
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

      try {
        await db.execute(
          `INSERT INTO orcamentos (categoria_id, contexto, mes_referencia, valor_limite, descricao, recorrente_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [t.categoria_id, t.contexto, mesReferencia, t.valor_limite, t.descricao, t.id],
        );
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err;
      }
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
 * Garante um orçamento do mês para a categoria (sem item por contrato).
 * Se já existir qualquer orçamento da categoria no contexto/mês, não cria outro.
 * Limite: herda do mês anterior quando houver; senão 0.
 */
export async function garantirOrcamentoCategoriaMes(
  categoria: { id: number; contexto: Contexto | "ambos" },
  mesReferencia?: string,
): Promise<void> {
  const { mesAtual } = await import("../utils/format");
  const mes = mesReferencia ?? mesAtual();
  const contextos: Contexto[] =
    categoria.contexto === "ambos" ? ["pessoal", "empresa"] : [categoria.contexto];

  for (const ctx of contextos) {
    await sincronizarOrcamentosRecorrentes(ctx, mes);
    const existentes = await listOrcamentos(ctx, mes);
    const jaTem = existentes.some(
      (o) => sameEntityId(o.categoria_id, categoria.id) && o.contexto === ctx,
    );
    if (jaTem) continue;

    const limiteHerdado = await getLimiteMesAnterior(categoria.id, ctx, mes);
    try {
      await createOrcamento({
        categoria_id: categoria.id,
        contexto: ctx,
        mes_referencia: mes,
        valor_limite: limiteHerdado,
        descricao: null,
        recorrente: false,
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
}

const HORIZONTE_PASSADO_PADRAO = 12;
const HORIZONTE_FUTURO_PADRAO = 24;

/** Faixa de meses usada para seed de envelopes de categoria. */
export async function getFaixaMesesOrcamento(): Promise<{ inicio: string; fim: string }> {
  const { mesAtual, addMonthsYm } = await import("../utils/format");
  const atual = mesAtual();

  return withDatabase(async () => {
    const db = await getDatabase();
    const orc = await db.select<{ min_m: string | null; max_m: string | null }[]>(
      "SELECT MIN(mes_referencia) AS min_m, MAX(mes_referencia) AS max_m FROM orcamentos",
    );
    const txn = await db.select<{ min_d: string | null; max_d: string | null }[]>(
      `SELECT MIN(substr(data, 1, 7)) AS min_d, MAX(substr(data, 1, 7)) AS max_d
       FROM transacoes WHERE data IS NOT NULL AND length(data) >= 7`,
    );

    let inicio = addMonthsYm(atual, -HORIZONTE_PASSADO_PADRAO);
    let fim = addMonthsYm(atual, HORIZONTE_FUTURO_PADRAO);

    for (const m of [orc[0]?.min_m, txn[0]?.min_d]) {
      if (m && m < inicio) inicio = m;
    }
    for (const m of [orc[0]?.max_m, txn[0]?.max_d]) {
      if (m && m > fim) fim = m;
    }
    const fimMin = addMonthsYm(atual, HORIZONTE_FUTURO_PADRAO);
    if (fim < fimMin) fim = fimMin;

    return { inicio, fim };
  });
}

async function getLimiteMesAnterior(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
): Promise<number> {
  const db = await getDatabase();
  const ant = mesAnterior(mesReferencia);
  const rows = await db.select<{ valor_limite: number }[]>(
    `SELECT valor_limite FROM orcamentos
     WHERE categoria_id = $1 AND contexto = $2 AND mes_referencia = $3
       AND recorrente_id IS NULL
     LIMIT 1`,
    [categoriaId, contexto, ant],
  );
  return Number(rows[0]?.valor_limite ?? 0);
}

/**
 * Garante envelope de todas as categorias no mês (ex.: ao mudar o seletor de mês).
 * Herda o limite do mês anterior quando existir.
 */
export async function garantirOrcamentosCategoriasNoMes(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
): Promise<number> {
  const { listCategorias } = await import("./categorias");
  const cats = await listCategorias(
    !contexto || contexto === "consolidado" ? "consolidado" : contexto,
  );

  return withDatabase(async () => {
    const db = await getDatabase();
    await sincronizarOrcamentosRecorrentes(contexto, mesReferencia);

    const existentes = await db.select<{ categoria_id: number; contexto: Contexto }[]>(
      `SELECT categoria_id, contexto FROM orcamentos
       WHERE mes_referencia = $1 AND recorrente_id IS NULL`,
      [mesReferencia],
    );
    const jaTem = new Set(existentes.map((e) => `${e.categoria_id}|${e.contexto}`));

    const ant = mesAnterior(mesReferencia);
    const limitesAnt = await db.select<
      { categoria_id: number; contexto: Contexto; valor_limite: number }[]
    >(
      `SELECT categoria_id, contexto, valor_limite FROM orcamentos
       WHERE mes_referencia = $1 AND recorrente_id IS NULL`,
      [ant],
    );
    const limMap = new Map(
      limitesAnt.map((l) => [`${l.categoria_id}|${l.contexto}`, Number(l.valor_limite)]),
    );

    let criados = 0;
    for (const cat of cats) {
      const contextos: Contexto[] =
        cat.contexto === "ambos" ? ["pessoal", "empresa"] : [cat.contexto as Contexto];
      for (const ctx of contextos) {
        if (contexto && contexto !== "consolidado" && ctx !== contexto) continue;
        const key = `${cat.id}|${ctx}`;
        if (jaTem.has(key)) continue;
        try {
          await db.execute(
            `INSERT INTO orcamentos (categoria_id, contexto, mes_referencia, valor_limite, descricao, recorrente_id)
             VALUES ($1, $2, $3, $4, NULL, NULL)`,
            [cat.id, ctx, mesReferencia, limMap.get(key) ?? 0],
          );
          criados++;
        } catch (err) {
          if (!isUniqueConstraintError(err)) throw err;
        }
      }
    }
    return criados;
  });
}

/**
 * Cria envelopes da categoria em toda a faixa histórica/futura conhecida.
 * Usado ao cadastrar categoria.
 */
export async function garantirOrcamentosCategoriaEmFaixa(categoria: {
  id: number;
  contexto: Contexto | "ambos";
}): Promise<void> {
  const { listMesesEntre } = await import("../utils/format");
  const { inicio, fim } = await getFaixaMesesOrcamento();
  for (const mes of listMesesEntre(inicio, fim)) {
    await garantirOrcamentoCategoriaMes(categoria, mes);
  }
}

/**
 * Aplica o limite a este mês e a todos os posteriores na faixa (cria se faltar).
 */
export async function aplicarLimiteMesesPosteriores(
  categoriaId: number,
  contexto: Contexto,
  mesInicio: string,
  valorLimite: number,
): Promise<number> {
  const { addMonthsYm, listMesesEntre } = await import("../utils/format");
  const { fim: fimFaixa } = await getFaixaMesesOrcamento();
  const fimMin = addMonthsYm(mesInicio, HORIZONTE_FUTURO_PADRAO);
  const fim = fimFaixa >= fimMin ? fimFaixa : fimMin;

  return withDatabase(async () => {
    const db = await getDatabase();
    let afetados = 0;
    for (const mes of listMesesEntre(mesInicio, fim)) {
      const existing = await db.select<{ id: number }[]>(
        `SELECT id FROM orcamentos
         WHERE categoria_id = $1 AND contexto = $2 AND mes_referencia = $3
           AND recorrente_id IS NULL
         LIMIT 1`,
        [categoriaId, contexto, mes],
      );
      if (existing[0]) {
        await db.execute(`UPDATE orcamentos SET valor_limite = $1 WHERE id = $2`, [
          valorLimite,
          existing[0].id,
        ]);
      } else {
        await db.execute(
          `INSERT INTO orcamentos (categoria_id, contexto, mes_referencia, valor_limite, descricao, recorrente_id)
           VALUES ($1, $2, $3, $4, NULL, NULL)`,
          [categoriaId, contexto, mes, valorLimite],
        );
      }
      afetados++;
    }
    return afetados;
  });
}

/**
 * @deprecated Preferir garantirOrcamentoCategoriaMes — orçamento é por categoria, não por dívida.
 */
export async function garantirOrcamentoParcelaDivida(input: {
  descricao: string;
  categoria_id: number;
  contexto: Contexto;
  valor_parcela: number;
  mes_referencia: string;
}): Promise<Orcamento | null> {
  await garantirOrcamentoCategoriaMes(
    { id: input.categoria_id, contexto: input.contexto },
    input.mes_referencia,
  );
  return null;
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

/** SQL: mes_competencia da fatura (fecha até dia 15 → mês do início do ciclo). */
const SQL_MES_COMPETENCIA_FATURA = `CASE WHEN CAST(substr(fc.periodo_fim, 9, 2) AS INTEGER) <= 15
         THEN substr(fc.periodo_inicio, 1, 7)
         ELSE substr(fc.periodo_fim, 1, 7)
    END`;

/**
 * Realizado no mês para despesas:
 * - Contas NÃO-cartão: pela data do lançamento.
 * - Envelope "Cartões de crédito": soma os totais das faturas com mes_competencia
 *   neste mês (à vista + todas as parcelas daquele ciclo).
 * - Demais categorias no cartão: transações da fatura com aquele mes_competencia
 *   (incluindo parcelas 2+ que caem neste ciclo).
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
           AND CAST(categoria_id AS INTEGER) = CAST($1 AS INTEGER)
           AND contexto = $2
           AND data LIKE $3`,
        [categoriaId, contexto, `${mesReferencia}%`],
      );
      return Number(rows[0]?.total ?? 0);
    }

    const rowsNaoCartao = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(t.valor), 0) as total
       FROM transacoes t
       JOIN contas co ON CAST(co.id AS INTEGER) = CAST(t.conta_id AS INTEGER)
       WHERE t.status = 'efetivado'
         AND t.tipo = 'despesa'
         AND CAST(t.categoria_id AS INTEGER) = CAST($1 AS INTEGER)
         AND t.contexto = $2
         AND t.data LIKE $3
         AND co.tipo != 'cartao_credito'`,
      [categoriaId, contexto, `${mesReferencia}%`],
    );
    let total = Number(rowsNaoCartao[0]?.total ?? 0);

    const { getCategoria, isNomeCategoriaCartoesCredito } = await import("./categorias");
    const cat = await getCategoria(categoriaId);
    if (cat && isNomeCategoriaCartoesCredito(cat.nome)) {
      total += await getTotalFaturasMesCompetencia(contexto, mesReferencia);
      return total;
    }

    const rowsCartao = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(t.valor), 0) as total
       FROM transacoes t
       JOIN contas co ON CAST(co.id AS INTEGER) = CAST(t.conta_id AS INTEGER)
       LEFT JOIN faturas_cartao fc ON fc.id = t.fatura_cartao_id
       WHERE t.status = 'efetivado'
         AND t.tipo = 'despesa'
         AND CAST(t.categoria_id AS INTEGER) = CAST($1 AS INTEGER)
         AND t.contexto = $2
         AND co.tipo = 'cartao_credito'
         AND (
           CASE
             WHEN fc.id IS NOT NULL THEN ${SQL_MES_COMPETENCIA_FATURA}
             ELSE substr(t.data, 1, 7)
           END
         ) = $3`,
      [categoriaId, contexto, mesReferencia],
    );
    total += Number(rowsCartao[0]?.total ?? 0);
    return total;
  });
}

/** Soma das faturas cujo mes_competencia = mesReferencia (ciclo aberto incluso). */
async function getTotalFaturasMesCompetencia(
  contexto: Contexto,
  mesReferencia: string,
): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(fc.total), 0) as total
     FROM faturas_cartao fc
     JOIN contas co ON CAST(co.id AS INTEGER) = CAST(fc.conta_id AS INTEGER)
     WHERE co.tipo = 'cartao_credito'
       AND co.contexto = $1
       AND (${SQL_MES_COMPETENCIA_FATURA}) = $2`,
    [contexto, mesReferencia],
  );
  return Number(rows[0]?.total ?? 0);
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
  const [financiamentos, emprestimos, contasPagar, impostos, recorrentes] = await Promise.all([
    getCompromissoFinanciamentosMes(categoriaId, contexto, mesReferencia),
    getCompromissoEmprestimosMes(categoriaId, contexto, mesReferencia),
    getCompromissoContasPagarMes(categoriaId, contexto, mesReferencia),
    getCompromissoImpostosMes(categoriaId, contexto, mesReferencia),
    getCompromissoRecorrentesMes(categoriaId, contexto, mesReferencia, "despesa"),
  ]);
  return financiamentos + emprestimos + contasPagar + impostos + recorrentes;
}

export async function getCompromissoReceitasOrcamento(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  excludeContaId?: number,
): Promise<number> {
  const [receber, recorrentes] = await Promise.all([
    getCompromissoContasReceberMes(categoriaId, contexto, mesReferencia, excludeContaId),
    getCompromissoRecorrentesMes(categoriaId, contexto, mesReferencia, "receita"),
  ]);
  return receber + recorrentes;
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
    const [financiamentos, emprestimos, contasPagar, impostos, recorrentes] = await Promise.all([
      getCompromissoFinanciamentosMes(categoriaId, contexto, mesReferencia),
      getCompromissoEmprestimosMes(categoriaId, contexto, mesReferencia),
      getCompromissoContasPagarMes(categoriaId, contexto, mesReferencia, excludeContaId),
      getCompromissoImpostosMes(categoriaId, contexto, mesReferencia, excludeContaId),
      getCompromissoRecorrentesMes(categoriaId, contexto, mesReferencia, "despesa"),
    ]);
    comprometido =
      financiamentos + emprestimos + contasPagar + impostos + recorrentes + (options?.valorExtra ?? 0);
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
  const { sincronizarStatusContasPagarReceber } = await import("./contasPagarReceber");
  const { backfillCategoriasComprasCartao } = await import("./transacoes");
  const { sincronizarTransacoesRecorrentes } = await import("./transacoesRecorrentes");
  const { sincronizarLancamentosParcelamentos } = await import("./emprestimos");
  const { sincronizarFaturasCartaoContexto } = await import("./faturasCartao");
  await sincronizarStatusContasPagarReceber();
  await backfillCategoriasComprasCartao();
  // Garante que todas as compras de cartão tenham fatura_cartao_id preenchido,
  // condição necessária para o cálculo do realizado por mes_competencia.
  await sincronizarFaturasCartaoContexto(contexto);
  if (mesReferencia) {
    await sincronizarTransacoesRecorrentes(mesReferencia, contexto);
  }
  await sincronizarLancamentosParcelamentos(contexto);

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
