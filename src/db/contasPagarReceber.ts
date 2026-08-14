import { getDatabase } from "./connection";
import { createTransacao } from "./transacoes";
import {
  applyContextoFilter,
  buildContextoFilter,
  todayIsoDate,
  withDatabase,
} from "./utils";
import type {
  ContaPagarReceber,
  Contexto,
  ContextoVisualizacao,
  StatusContaPagarReceber,
  TipoContaPagarReceber,
  Transacao,
} from "../types";
import { arredondarMoeda } from "../utils/format";

export interface ContaPagarReceberInput {
  descricao: string;
  valor: number;
  vencimento: string;
  tipo: TipoContaPagarReceber;
  contexto: Contexto;
  status?: StatusContaPagarReceber;
  categoria_id?: number | null;
  mes_referencia?: string | null;
  contato_id?: number | null;
}

export interface ContaPagarReceberFilters {
  contexto?: ContextoVisualizacao;
  status?: StatusContaPagarReceber;
  tipo?: TipoContaPagarReceber;
  vencimentoInicio?: string;
  vencimentoFim?: string;
}

export interface EfetivarContaPagarReceberInput {
  conta_id: number;
  categoria_id?: number | null;
  data?: string;
}

interface ContaPagarReceberRow {
  id: number;
  descricao: string;
  valor: number;
  vencimento: string;
  tipo: TipoContaPagarReceber;
  contexto: Contexto;
  status: StatusContaPagarReceber;
  transacao_id: number | null;
  categoria_id: number | null;
  mes_referencia: string | null;
  contato_id: number | null;
}

export function mesReferenciaOrcamentoConta(item: {
  mes_referencia: string | null;
  vencimento: string;
}): string {
  return item.mes_referencia ?? item.vencimento.slice(0, 7);
}

function mapContaPagarReceber(row: ContaPagarReceberRow): ContaPagarReceber {
  return {
    ...row,
    contato_id: row.contato_id ?? null,
  };
}

function buildFilters(filters: ContaPagarReceberFilters = {}): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.contexto && filters.contexto !== "consolidado") {
    clauses.push("contexto = $" + (params.length + 1));
    params.push(filters.contexto);
  }
  if (filters.status) {
    clauses.push("status = $" + (params.length + 1));
    params.push(filters.status);
  }
  if (filters.tipo) {
    clauses.push("tipo = $" + (params.length + 1));
    params.push(filters.tipo);
  }
  if (filters.vencimentoInicio) {
    clauses.push("vencimento >= $" + (params.length + 1));
    params.push(filters.vencimentoInicio);
  }
  if (filters.vencimentoFim) {
    clauses.push("vencimento <= $" + (params.length + 1));
    params.push(filters.vencimentoFim);
  }

  return { clauses, params };
}

export async function sincronizarStatusContasPagarReceber(): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(
      `UPDATE contas_a_pagar_receber
       SET status = 'atrasado'
       WHERE status = 'pendente' AND vencimento < $1`,
      [todayIsoDate()],
    );
  });
}

export async function listContasPagarReceber(
  filters: ContaPagarReceberFilters = {},
): Promise<ContaPagarReceber[]> {
  await sincronizarStatusContasPagarReceber();
  return withDatabase(async () => {
    const db = await getDatabase();
    const { clauses, params } = buildFilters(filters);
    const where = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
    const query = `SELECT * FROM contas_a_pagar_receber WHERE 1=1${where} ORDER BY vencimento ASC, id ASC`;
    const rows = await db.select<ContaPagarReceberRow[]>(query, params);
    return rows.map(mapContaPagarReceber);
  });
}

export async function getContaPagarReceber(id: number): Promise<ContaPagarReceber | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<ContaPagarReceberRow[]>(
      "SELECT * FROM contas_a_pagar_receber WHERE id = $1",
      [id],
    );
    return rows[0] ? mapContaPagarReceber(rows[0]) : null;
  });
}

export async function createContaPagarReceber(
  input: ContaPagarReceberInput,
): Promise<ContaPagarReceber> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const status = input.status ?? calcularStatus(input.vencimento, "pendente");
    const result = await db.execute(
      `INSERT INTO contas_a_pagar_receber
       (descricao, valor, vencimento, tipo, contexto, status, categoria_id, mes_referencia, contato_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.descricao,
        input.valor,
        input.vencimento,
        input.tipo,
        input.contexto,
        status,
        input.categoria_id ?? null,
        input.mes_referencia ?? null,
        input.contato_id ?? null,
      ],
    );
    const item = await getContaPagarReceber(result.lastInsertId as number);
    if (!item) {
      throw new Error("Falha ao criar conta a pagar/receber");
    }
    return item;
  });
}

export async function updateContaPagarReceber(
  id: number,
  input: Partial<ContaPagarReceberInput>,
): Promise<ContaPagarReceber> {
  return withDatabase(async () => {
    const existing = await getContaPagarReceber(id);
    if (!existing) {
      throw new Error("Conta a pagar/receber não encontrada");
    }

    const vencimento = input.vencimento ?? existing.vencimento;
    const status =
      input.status ??
      (existing.status === "pago"
        ? existing.status
        : calcularStatus(vencimento, existing.status));

    const db = await getDatabase();
    await db.execute(
      `UPDATE contas_a_pagar_receber
       SET descricao = $1, valor = $2, vencimento = $3, tipo = $4, contexto = $5, status = $6,
           categoria_id = $7, mes_referencia = $8, contato_id = $9
       WHERE id = $10`,
      [
        input.descricao ?? existing.descricao,
        input.valor ?? existing.valor,
        vencimento,
        input.tipo ?? existing.tipo,
        input.contexto ?? existing.contexto,
        status,
        input.categoria_id !== undefined ? input.categoria_id : existing.categoria_id,
        input.mes_referencia !== undefined ? input.mes_referencia : existing.mes_referencia,
        input.contato_id !== undefined ? input.contato_id : existing.contato_id,
        id,
      ],
    );

    const item = await getContaPagarReceber(id);
    if (!item) {
      throw new Error("Falha ao atualizar conta a pagar/receber");
    }
    return item;
  });
}

export async function updateContaPagarReceberStatus(
  id: number,
  status: StatusContaPagarReceber,
  transacaoId?: number | null,
): Promise<ContaPagarReceber> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(
      `UPDATE contas_a_pagar_receber
       SET status = $1, transacao_id = $2
       WHERE id = $3`,
      [status, transacaoId ?? null, id],
    );
    const item = await getContaPagarReceber(id);
    if (!item) {
      throw new Error("Conta a pagar/receber não encontrada");
    }
    return item;
  });
}

export async function deleteContaPagarReceber(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM contas_a_pagar_receber WHERE id = $1", [id]);
  });
}

export async function efetivarContaPagarReceber(
  id: number,
  input: EfetivarContaPagarReceberInput,
): Promise<{ item: ContaPagarReceber; transacao: Transacao }> {
  return withDatabase(async () => {
    const item = await getContaPagarReceber(id);
    if (!item) {
      throw new Error("Conta a pagar/receber não encontrada");
    }
    if (item.status === "pago") {
      throw new Error("Este lançamento já foi efetivado");
    }

    const transacao = await createTransacao({
      descricao: item.descricao,
      valor: item.valor,
      data: input.data ?? todayIsoDate(),
      tipo: item.tipo === "pagar" ? "despesa" : "receita",
      conta_id: input.conta_id,
      categoria_id: input.categoria_id ?? item.categoria_id ?? null,
      contexto: item.contexto,
      status: "efetivado",
      observacoes: `Efetivado a partir de conta a ${item.tipo === "pagar" ? "pagar" : "receber"} #${item.id}`,
    });

    const atualizado = await updateContaPagarReceberStatus(id, "pago", transacao.id);
    return { item: atualizado, transacao };
  });
}

export async function getCompromissoContasPagarMes(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  excludeId?: number,
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const inicioMes = `${mesReferencia}-01`;
    // Mês de competência do orçamento + atrasados de meses anteriores ainda em aberto.
    let query = `SELECT COALESCE(SUM(valor), 0) as total
       FROM contas_a_pagar_receber
       WHERE tipo = 'pagar'
         AND status IN ('pendente', 'atrasado')
         AND categoria_id = $1
         AND contexto = $2
         AND (
           COALESCE(mes_referencia, substr(vencimento, 1, 7)) = $3
           OR (
             status = 'atrasado'
             AND COALESCE(mes_referencia, substr(vencimento, 1, 7)) < $3
             AND vencimento < $4
           )
         )`;
    const params: unknown[] = [categoriaId, contexto, mesReferencia, inicioMes];
    if (excludeId) {
      query += " AND id != $5";
      params.push(excludeId);
    }
    const rows = await db.select<{ total: number }[]>(query, params);
    return Number(rows[0]?.total ?? 0);
  });
}

export async function getCompromissoContasReceberMes(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
  excludeId?: number,
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const inicioMes = `${mesReferencia}-01`;
    let query = `SELECT COALESCE(SUM(valor), 0) as total
       FROM contas_a_pagar_receber
       WHERE tipo = 'receber'
         AND status IN ('pendente', 'atrasado')
         AND categoria_id = $1
         AND contexto = $2
         AND (
           COALESCE(mes_referencia, substr(vencimento, 1, 7)) = $3
           OR (
             status = 'atrasado'
             AND COALESCE(mes_referencia, substr(vencimento, 1, 7)) < $3
             AND vencimento < $4
           )
         )`;
    const params: unknown[] = [categoriaId, contexto, mesReferencia, inicioMes];
    if (excludeId) {
      query += " AND id != $5";
      params.push(excludeId);
    }
    const rows = await db.select<{ total: number }[]>(query, params);
    return Number(rows[0]?.total ?? 0);
  });
}

export async function listProximosVencimentos(
  contexto?: ContextoVisualizacao,
  limite = 5,
): Promise<ContaPagarReceber[]> {
  await sincronizarStatusContasPagarReceber();
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT * FROM contas_a_pagar_receber
       WHERE status IN ('pendente', 'atrasado')${filter.clause}
       ORDER BY vencimento ASC
       LIMIT ${limite}`,
      filter,
    );
    const rows = await db.select<ContaPagarReceberRow[]>(query, params);
    return rows.map(mapContaPagarReceber);
  });
}

function calcularStatus(
  vencimento: string,
  statusAtual: StatusContaPagarReceber,
): StatusContaPagarReceber {
  if (statusAtual === "pago") return "pago";
  if (vencimento < todayIsoDate()) return "atrasado";
  return "pendente";
}

export interface ResumoMensalPagarReceber {
  mes: string;
  a_pagar: number;
  a_receber: number;
  liquido: number;
  qtd_pagar: number;
  qtd_receber: number;
  a_pagar_atrasado: number;
  a_receber_atrasado: number;
}

export interface ComparativoMensalPagarReceber {
  mes: string;
  a_pagar: number;
  a_receber: number;
}

/** Totais em aberto (pendente/atrasado) com vencimento no mês. */
export async function getResumoMensalPagarReceber(
  mes: string,
  contexto?: ContextoVisualizacao,
): Promise<ResumoMensalPagarReceber> {
  await sincronizarStatusContasPagarReceber();
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT tipo, status, SUM(valor) AS total, COUNT(*) AS qtd
       FROM contas_a_pagar_receber
       WHERE status IN ('pendente', 'atrasado')
         AND vencimento LIKE $1${filter.clause}
       GROUP BY tipo, status`,
      filter,
      2,
    );
    const rows = await db.select<
      { tipo: TipoContaPagarReceber; status: StatusContaPagarReceber; total: number | string; qtd: number | string }[]
    >(query, [`${mes}%`, ...params]);

    let a_pagar = 0;
    let a_receber = 0;
    let qtd_pagar = 0;
    let qtd_receber = 0;
    let a_pagar_atrasado = 0;
    let a_receber_atrasado = 0;

    for (const row of rows) {
      const total = Number(row.total) || 0;
      const qtd = Number(row.qtd) || 0;
      if (row.tipo === "pagar") {
        a_pagar += total;
        qtd_pagar += qtd;
        if (row.status === "atrasado") a_pagar_atrasado += total;
      } else {
        a_receber += total;
        qtd_receber += qtd;
        if (row.status === "atrasado") a_receber_atrasado += total;
      }
    }

    return {
      mes,
      a_pagar: arredondarMoeda(a_pagar),
      a_receber: arredondarMoeda(a_receber),
      liquido: arredondarMoeda(a_receber - a_pagar),
      qtd_pagar,
      qtd_receber,
      a_pagar_atrasado: arredondarMoeda(a_pagar_atrasado),
      a_receber_atrasado: arredondarMoeda(a_receber_atrasado),
    };
  });
}

/** Comparativo mensal de valores em aberto por vencimento. */
export async function getComparativoMensalPagarReceber(
  meses: string[],
  contexto?: ContextoVisualizacao,
): Promise<ComparativoMensalPagarReceber[]> {
  if (meses.length === 0) return [];
  await sincronizarStatusContasPagarReceber();
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const inicio = `${meses[0]}-01`;
    const ultimo = meses[meses.length - 1];
    const [ano, mesNum] = ultimo.split("-").map(Number);
    const fimDia = new Date(ano, mesNum, 0).getDate();
    const fim = `${ultimo}-${String(fimDia).padStart(2, "0")}`;

    const { query, params } = applyContextoFilter(
      `SELECT substr(vencimento, 1, 7) AS mes, tipo, SUM(valor) AS total
       FROM contas_a_pagar_receber
       WHERE status IN ('pendente', 'atrasado')
         AND vencimento >= $1 AND vencimento <= $2${filter.clause}
       GROUP BY substr(vencimento, 1, 7), tipo`,
      filter,
      3,
    );
    const rows = await db.select<
      { mes: string; tipo: TipoContaPagarReceber; total: number | string }[]
    >(query, [inicio, fim, ...params]);

    const byMes = new Map<string, { a_pagar: number; a_receber: number }>();
    for (const m of meses) byMes.set(m, { a_pagar: 0, a_receber: 0 });
    for (const row of rows) {
      const bucket = byMes.get(row.mes);
      if (!bucket) continue;
      const total = Number(row.total) || 0;
      if (row.tipo === "pagar") bucket.a_pagar += total;
      else bucket.a_receber += total;
    }

    return meses.map((mes) => {
      const b = byMes.get(mes)!;
      return {
        mes,
        a_pagar: arredondarMoeda(b.a_pagar),
        a_receber: arredondarMoeda(b.a_receber),
      };
    });
  });
}

export type AgingBucketId = "a_vencer" | "1-30" | "31-60" | "61-90" | "90+";

export interface AgingBucket {
  id: AgingBucketId;
  label: string;
  total: number;
  quantidade: number;
}

export interface AgingAReceber {
  buckets: AgingBucket[];
  total: number;
}

function diasEntre(isoInicio: string, isoFim: string): number {
  const [y1, m1, d1] = isoInicio.split("-").map(Number);
  const [y2, m2, d2] = isoFim.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((b - a) / 86_400_000);
}

/** Aging de contas a receber em aberto (pendente + atrasado). */
export async function getAgingAReceber(
  contexto?: ContextoVisualizacao,
): Promise<AgingAReceber> {
  const itens = await listContasPagarReceber({
    contexto,
    tipo: "receber",
  });
  const abertos = itens.filter((i) => i.status === "pendente" || i.status === "atrasado");
  const hoje = todayIsoDate();

  const buckets: AgingBucket[] = [
    { id: "a_vencer", label: "A vencer", total: 0, quantidade: 0 },
    { id: "1-30", label: "1–30 dias", total: 0, quantidade: 0 },
    { id: "31-60", label: "31–60 dias", total: 0, quantidade: 0 },
    { id: "61-90", label: "61–90 dias", total: 0, quantidade: 0 },
    { id: "90+", label: "90+ dias", total: 0, quantidade: 0 },
  ];

  for (const item of abertos) {
    const diasAtraso = diasEntre(item.vencimento, hoje);
    let bucket: AgingBucket;
    if (diasAtraso <= 0) bucket = buckets[0];
    else if (diasAtraso <= 30) bucket = buckets[1];
    else if (diasAtraso <= 60) bucket = buckets[2];
    else if (diasAtraso <= 90) bucket = buckets[3];
    else bucket = buckets[4];
    bucket.total = arredondarMoeda(bucket.total + item.valor);
    bucket.quantidade += 1;
  }

  return {
    buckets,
    total: arredondarMoeda(abertos.reduce((s, i) => s + i.valor, 0)),
  };
}

