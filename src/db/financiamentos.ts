import { getDatabase } from "./connection";
import { createTransacao } from "./transacoes";
import {
  applyContextoFilter,
  buildContextoFilter,
  DatabaseError,
  fromBoolean,
  nowIso,
  toBoolean,
  withDatabase,
} from "./utils";
import { addMonths, atualizarStatusParcela, mesFromDate, todayIsoDate } from "../utils/dates";
import { arredondarMoeda, gerarValoresPrevistos } from "../utils/financiamentoCalc";
import type {
  Contexto,
  ContextoVisualizacao,
  Financiamento,
  FinanciamentoParcela,
  FinanciamentoResumo,
  StatusParcelaFinanciamento,
} from "../types";

export interface FinanciamentoInput {
  descricao: string;
  /** Valor total do contrato — como aparece no app do banco */
  valor_total: number;
  /** Parcela típica para orçamento mensal (pode diferir da média) */
  valor_parcela: number;
  total_parcelas: number;
  contexto: Contexto;
  conta_id: number;
  categoria_id?: number | null;
  data_primeira_parcela: string;
  ativo?: boolean;
  observacoes?: string | null;
}

export interface PagamentoParcelaInput {
  parcela_id: number;
  valor_pago: number;
  /** Data real do débito (pode ser antes do vencimento) */
  data_pagamento?: string;
}

export interface PagarParcelasInput {
  pagamentos: PagamentoParcelaInput[];
  data_pagamento?: string;
  conta_id?: number;
  /** Default true. Use false se a despesa já foi lançada manualmente em Transações */
  criar_transacao?: boolean;
}

interface FinanciamentoRow {
  id: number;
  descricao: string;
  valor_total: number;
  valor_parcela: number;
  total_parcelas: number;
  contexto: Contexto;
  conta_id: number;
  categoria_id: number | null;
  data_primeira_parcela: string;
  ativo: number;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

interface ParcelaRow {
  id: number;
  financiamento_id: number;
  numero_parcela: number;
  valor_previsto: number;
  vencimento: string;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: StatusParcelaFinanciamento;
  transacao_id: number | null;
  observacoes: string | null;
}

function mapFinanciamento(row: FinanciamentoRow): Financiamento {
  return { ...row, ativo: toBoolean(row.ativo) };
}

function mapParcela(row: ParcelaRow): FinanciamentoParcela {
  return row;
}

async function gerarParcelas(
  financiamentoId: number,
  valorTotal: number,
  valorParcela: number,
  totalParcelas: number,
  dataPrimeira: string,
): Promise<void> {
  const db = await getDatabase();
  const valores = gerarValoresPrevistos(valorTotal, valorParcela, totalParcelas);
  for (let i = 0; i < totalParcelas; i++) {
    const vencimento = addMonths(dataPrimeira, i);
    const status = atualizarStatusParcela(vencimento, "pendente");
    await db.execute(
      `INSERT INTO financiamento_parcelas
       (financiamento_id, numero_parcela, valor_previsto, vencimento, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [financiamentoId, i + 1, valores[i], vencimento, status],
    );
  }
}

/** Redistribui valor previsto das parcelas pendentes com base no saldo devedor real */
async function recalcularParcelasPendentes(fin: Financiamento): Promise<void> {
  const db = await getDatabase();
  const parcelas = await listParcelas(fin.id);
  const pagas = parcelas.filter((p) => p.status === "paga");
  const pendentes = parcelas.filter((p) => p.status !== "paga");
  const valorPago = pagas.reduce((s, p) => s + (p.valor_pago ?? 0), 0);
  const saldoRestante = arredondarMoeda(Math.max(0, fin.valor_total - valorPago));

  if (pendentes.length === 0) return;

  for (let i = 0; i < pendentes.length; i++) {
    let previsto = fin.valor_parcela;
    if (pendentes.length === 1) {
      previsto = saldoRestante;
    } else if (i === pendentes.length - 1) {
      const restante = arredondarMoeda(
        saldoRestante - fin.valor_parcela * (pendentes.length - 1),
      );
      if (restante > 0) previsto = restante;
    }
    await db.execute(
      "UPDATE financiamento_parcelas SET valor_previsto = $1 WHERE id = $2",
      [previsto, pendentes[i].id],
    );
  }
}

async function calcularResumo(fin: Financiamento): Promise<FinanciamentoResumo> {
  const parcelas = await listParcelas(fin.id);
  const pagas = parcelas.filter((p) => p.status === "paga");
  const pendentes = parcelas.filter((p) => p.status !== "paga");
  const valorPago = arredondarMoeda(pagas.reduce((s, p) => s + (p.valor_pago ?? 0), 0));
  const valorRestante = arredondarMoeda(Math.max(0, fin.valor_total - valorPago));
  const proximo = pendentes.sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  const pctValor =
    fin.valor_total > 0 ? Math.min(Math.round((valorPago / fin.valor_total) * 100), 100) : 0;

  return {
    ...fin,
    parcelas_pagas: pagas.length,
    parcelas_restantes: pendentes.length,
    valor_pago: valorPago,
    valor_restante: valorRestante,
    valor_total_contrato: fin.valor_total,
    percentual_pago: pctValor,
    proximo_vencimento: proximo?.vencimento ?? null,
  };
}

export async function listFinanciamentos(
  contexto?: ContextoVisualizacao,
): Promise<FinanciamentoResumo[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT * FROM financiamentos WHERE ativo = 1${filter.clause} ORDER BY descricao ASC`,
      filter,
    );
    const rows = await db.select<FinanciamentoRow[]>(query, params);
    return Promise.all(rows.map((r) => calcularResumo(mapFinanciamento(r))));
  });
}

export async function getFinanciamento(id: number): Promise<Financiamento | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<FinanciamentoRow[]>(
      "SELECT * FROM financiamentos WHERE id = $1",
      [id],
    );
    return rows[0] ? mapFinanciamento(rows[0]) : null;
  });
}

export async function getFinanciamentoComResumo(id: number): Promise<FinanciamentoResumo | null> {
  const fin = await getFinanciamento(id);
  return fin ? calcularResumo(fin) : null;
}

export async function listParcelas(financiamentoId: number): Promise<FinanciamentoParcela[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<ParcelaRow[]>(
      `SELECT * FROM financiamento_parcelas
       WHERE financiamento_id = $1
       ORDER BY numero_parcela ASC`,
      [financiamentoId],
    );
    return rows.map(mapParcela);
  });
}

export async function createFinanciamento(input: FinanciamentoInput): Promise<FinanciamentoResumo> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const timestamp = nowIso();
    const result = await db.execute(
      `INSERT INTO financiamentos
       (descricao, valor_total, valor_parcela, total_parcelas, contexto, conta_id,
        categoria_id, data_primeira_parcela, ativo, observacoes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.descricao,
        input.valor_total,
        input.valor_parcela,
        input.total_parcelas,
        input.contexto,
        input.conta_id,
        input.categoria_id ?? null,
        input.data_primeira_parcela,
        fromBoolean(input.ativo ?? true),
        input.observacoes ?? null,
        timestamp,
        timestamp,
      ],
    );
    const id = result.lastInsertId as number;
    await gerarParcelas(
      id,
      input.valor_total,
      input.valor_parcela,
      input.total_parcelas,
      input.data_primeira_parcela,
    );
    const fin = await getFinanciamento(id);
    if (!fin) throw new DatabaseError("Falha ao criar financiamento");
    return calcularResumo(fin);
  });
}

export async function updateFinanciamento(
  id: number,
  input: Partial<FinanciamentoInput>,
): Promise<FinanciamentoResumo> {
  return withDatabase(async () => {
    const existing = await getFinanciamento(id);
    if (!existing) throw new DatabaseError("Financiamento não encontrado");

    const db = await getDatabase();
    const novoTotal = input.valor_total ?? existing.valor_total;
    const novaParcelaRef = input.valor_parcela ?? existing.valor_parcela;

    await db.execute(
      `UPDATE financiamentos
       SET descricao = $1, valor_total = $2, valor_parcela = $3, conta_id = $4,
           categoria_id = $5, ativo = $6, observacoes = $7, updated_at = $8
       WHERE id = $9`,
      [
        input.descricao ?? existing.descricao,
        novoTotal,
        novaParcelaRef,
        input.conta_id ?? existing.conta_id,
        input.categoria_id !== undefined ? input.categoria_id : existing.categoria_id,
        fromBoolean(input.ativo ?? existing.ativo),
        input.observacoes !== undefined ? input.observacoes : existing.observacoes,
        nowIso(),
        id,
      ],
    );

    const fin = await getFinanciamento(id);
    if (!fin) throw new DatabaseError("Falha ao atualizar financiamento");

    if (
      (input.valor_total !== undefined && input.valor_total !== existing.valor_total) ||
      (input.valor_parcela !== undefined && input.valor_parcela !== existing.valor_parcela)
    ) {
      await recalcularParcelasPendentes(fin);
    }

    return calcularResumo(fin);
  });
}

export async function deleteFinanciamento(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM financiamentos WHERE id = $1", [id]);
  });
}

export async function pagarParcelas(
  financiamentoId: number,
  input: PagarParcelasInput,
): Promise<FinanciamentoParcela[]> {
  return withDatabase(async () => {
    const fin = await getFinanciamento(financiamentoId);
    if (!fin) throw new DatabaseError("Financiamento não encontrado");
    if (input.pagamentos.length === 0) {
      throw new DatabaseError("Selecione ao menos uma parcela");
    }

    const dataPagamento = input.data_pagamento ?? todayIsoDate();
    const contaId = input.conta_id ?? fin.conta_id;
    const criarTransacao = input.criar_transacao !== false;
    const parcelasAtualizadas: FinanciamentoParcela[] = [];
    const db = await getDatabase();

    for (const pag of input.pagamentos) {
      const dataPagamentoParcela = pag.data_pagamento ?? dataPagamento;
      const rows = await db.select<ParcelaRow[]>(
        "SELECT * FROM financiamento_parcelas WHERE id = $1 AND financiamento_id = $2",
        [pag.parcela_id, financiamentoId],
      );
      const parcela = rows[0];
      if (!parcela) throw new DatabaseError(`Parcela #${pag.parcela_id} não encontrada`);
      if (parcela.status === "paga") {
        throw new DatabaseError(`Parcela ${parcela.numero_parcela} já foi paga`);
      }
      if (pag.valor_pago <= 0) {
        throw new DatabaseError(`Valor inválido para parcela ${parcela.numero_parcela}`);
      }

      const desconto =
        pag.valor_pago < parcela.valor_previsto
          ? ` · desconto ${arredondarMoeda(parcela.valor_previsto - pag.valor_pago)}`
          : "";

      const transacao = criarTransacao
        ? await createTransacao({
            descricao: `${fin.descricao} — parcela ${parcela.numero_parcela}/${fin.total_parcelas}`,
            valor: pag.valor_pago,
            data: dataPagamentoParcela,
            tipo: "despesa",
            conta_id: contaId,
            categoria_id: fin.categoria_id,
            contexto: fin.contexto,
            observacoes: `Financiamento #${fin.id}${desconto}`,
          })
        : null;

      await db.execute(
        `UPDATE financiamento_parcelas
         SET valor_pago = $1, data_pagamento = $2, status = 'paga', transacao_id = $3
         WHERE id = $4`,
        [pag.valor_pago, dataPagamentoParcela, transacao?.id ?? null, pag.parcela_id],
      );

      const updated = await db.select<ParcelaRow[]>(
        "SELECT * FROM financiamento_parcelas WHERE id = $1",
        [pag.parcela_id],
      );
      if (updated[0]) parcelasAtualizadas.push(mapParcela(updated[0]));
    }

    const finAtualizado = await getFinanciamento(financiamentoId);
    if (finAtualizado) {
      await recalcularParcelasPendentes(finAtualizado);
    }

    await db.execute("UPDATE financiamentos SET updated_at = $1 WHERE id = $2", [
      nowIso(),
      financiamentoId,
    ]);

    return parcelasAtualizadas;
  });
}

/** Usa valor previsto da parcela pendente/atrasada */
export async function getCompromissoFinanciamentosMes(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(fp.valor_previsto), 0) as total
       FROM financiamento_parcelas fp
       JOIN financiamentos f ON f.id = fp.financiamento_id
       WHERE f.ativo = 1
         AND f.categoria_id = $1
         AND f.contexto = $2
         AND fp.status IN ('pendente', 'atrasada')
         AND fp.vencimento LIKE $3`,
      [categoriaId, contexto, `${mesReferencia}%`],
    );
    return rows[0]?.total ?? 0;
  });
}

export async function sincronizarStatusParcelas(financiamentoId?: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const hoje = todayIsoDate();
    let query = `UPDATE financiamento_parcelas
                 SET status = 'atrasada'
                 WHERE status = 'pendente' AND vencimento < $1`;
    const params: unknown[] = [hoje];
    if (financiamentoId) {
      query += " AND financiamento_id = $2";
      params.push(financiamentoId);
    }
    await db.execute(query, params);
  });
}

export async function reverterParcelaPorTransacao(transacaoId: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ financiamento_id: number }[]>(
      "SELECT financiamento_id FROM financiamento_parcelas WHERE transacao_id = $1",
      [transacaoId],
    );
    await db.execute(
      `UPDATE financiamento_parcelas
       SET status = 'pendente', valor_pago = NULL, data_pagamento = NULL, transacao_id = NULL
       WHERE transacao_id = $1`,
      [transacaoId],
    );
    if (rows[0]) {
      const fin = await getFinanciamento(rows[0].financiamento_id);
      if (fin) await recalcularParcelasPendentes(fin);
    }
  });
}

export function filtrarParcelasPorSelecao(
  parcelas: FinanciamentoParcela[],
  selecao: "mes" | "ultima" | "mes_e_ultima" | "todas",
  mesReferencia?: string,
): FinanciamentoParcela[] {
  const pendentes = parcelas.filter((p) => p.status !== "paga");
  if (pendentes.length === 0) return [];

  const mes = mesReferencia ?? mesFromDate(todayIsoDate());
  const doMes = pendentes.filter((p) => p.vencimento.startsWith(mes));
  const ultima = pendentes[pendentes.length - 1];

  switch (selecao) {
    case "mes":
      return doMes;
    case "ultima":
      return ultima ? [ultima] : [];
    case "mes_e_ultima": {
      const ids = new Set<number>();
      const result: FinanciamentoParcela[] = [];
      for (const p of [...doMes, ultima]) {
        if (p && !ids.has(p.id)) {
          ids.add(p.id);
          result.push(p);
        }
      }
      return result.sort((a, b) => a.numero_parcela - b.numero_parcela);
    }
    case "todas":
      return pendentes;
    default:
      return [];
  }
}

export interface PagamentoHistoricoPorNumero {
  numero_parcela: number;
  valor_pago: number;
  data_pagamento: string;
}

export async function aplicarPagamentosHistoricos(
  financiamentoId: number,
  pagamentos: PagamentoHistoricoPorNumero[],
  options?: { criar_transacao?: boolean; conta_id?: number },
): Promise<void> {
  if (pagamentos.length === 0) return;
  const parcelas = await listParcelas(financiamentoId);
  await pagarParcelas(financiamentoId, {
    criar_transacao: options?.criar_transacao,
    conta_id: options?.conta_id,
    pagamentos: pagamentos.map((h) => {
      const parcela = parcelas.find((p) => p.numero_parcela === h.numero_parcela);
      if (!parcela) {
        throw new DatabaseError(`Parcela ${h.numero_parcela} não encontrada`);
      }
      if (parcela.status === "paga") {
        throw new DatabaseError(`Parcela ${h.numero_parcela} já está paga`);
      }
      return {
        parcela_id: parcela.id,
        valor_pago: h.valor_pago,
        data_pagamento: h.data_pagamento,
      };
    }),
  });
}
