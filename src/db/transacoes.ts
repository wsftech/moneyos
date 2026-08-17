import { getConta } from "./contas";
import { reverterParcelaPorTransacao } from "./financiamentos";
import { reverterParcelaEmprestimoPorTransacao } from "./emprestimos";
import { removerAnexoArquivo } from "./anexos";
import { resolverCategoriaPorDescricao } from "./regrasCategorizacao";
import { setTagsTransacao } from "./tags";
import { getDatabase } from "./connection";
import { getSaldoAberturaMes } from "./contas";
import {
  applyContextoFilter,
  buildContextoFilter,
  DatabaseError,
  nowIso,
  withDatabase,
} from "./utils";
import type {
  Contexto,
  ContextoVisualizacao,
  StatusTransacao,
  TipoTransacao,
  TransferenciaPapel,
  Transacao,
} from "../types";
import { addMonths } from "../utils/dates";
import { dataCicloParcelaCartao, mesFechamentoParaData } from "../utils/faturaCartao";

/** No consolidado, pernas de transferência entre contextos não entram no P&L. */
function sqlExcluirTransferenciaCrossContext(
  contexto: ContextoVisualizacao | undefined,
  alias = "transacoes",
): string {
  if (contexto && contexto !== "consolidado") return "";
  return ` AND NOT (${alias}.transacao_vinculada_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM transacoes v
    WHERE v.id = ${alias}.transacao_vinculada_id AND v.contexto != ${alias}.contexto
  ))`;
}

export interface TransacaoInput {
  descricao: string;
  valor: number;
  data: string;
  tipo: TipoTransacao;
  conta_id: number;
  categoria_id?: number | null;
  contexto: Contexto;
  status?: StatusTransacao;
  anexo_path?: string | null;
  observacoes?: string | null;
  transacao_vinculada_id?: number | null;
  transferencia_papel?: TransferenciaPapel | null;
  fatura_cartao_id?: number | null;
  pagamento_fatura_id?: number | null;
  tag_ids?: number[];
  compra_parcelada_id?: string | null;
  parcela_numero?: number | null;
  parcela_total?: number | null;
}

export interface TransferenciaInput {
  descricao: string;
  valor: number;
  data: string;
  conta_origem_id: number;
  conta_destino_id: number;
  observacoes?: string | null;
  /** Categoria de despesa na conta de origem (ex.: Pró-labore na empresa) */
  categoria_origem_id?: number | null;
  /** Categoria de receita na conta de destino (ex.: Pró-labore no pessoal) */
  categoria_destino_id?: number | null;
}

export interface TransacaoFilters {
  contexto?: ContextoVisualizacao;
  dataInicio?: string;
  dataFim?: string;
  categoriaId?: number;
  contaId?: number;
}

interface TransacaoRow {
  id: number;
  descricao: string;
  valor: number;
  data: string;
  tipo: TipoTransacao;
  conta_id: number;
  categoria_id: number | null;
  contexto: Contexto;
  status: StatusTransacao;
  anexo_path: string | null;
  observacoes: string | null;
  transacao_vinculada_id: number | null;
  transferencia_papel: TransferenciaPapel | null;
  fatura_cartao_id: number | null;
  pagamento_fatura_id: number | null;
  compra_parcelada_id: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  created_at: string;
  updated_at: string;
}

function mapTransacao(row: TransacaoRow): Transacao {
  return {
    ...row,
    compra_parcelada_id: row.compra_parcelada_id ?? null,
    parcela_numero: row.parcela_numero ?? null,
    parcela_total: row.parcela_total ?? null,
  };
}

async function insertTransacao(input: TransacaoInput): Promise<number> {
  const db = await getDatabase();
  const timestamp = nowIso();
  const result = await db.execute(
    `INSERT INTO transacoes
     (descricao, valor, data, tipo, conta_id, categoria_id, contexto, status,
      anexo_path, observacoes, transacao_vinculada_id, transferencia_papel,
      fatura_cartao_id, pagamento_fatura_id, compra_parcelada_id, parcela_numero, parcela_total,
      created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      input.descricao,
      input.valor,
      input.data,
      input.tipo,
      input.conta_id,
      input.categoria_id ?? null,
      input.contexto,
      input.status ?? "efetivado",
      input.anexo_path ?? null,
      input.observacoes ?? null,
      input.transacao_vinculada_id ?? null,
      input.transferencia_papel ?? null,
      input.fatura_cartao_id ?? null,
      input.pagamento_fatura_id ?? null,
      input.compra_parcelada_id ?? null,
      input.parcela_numero ?? null,
      input.parcela_total ?? null,
      timestamp,
      timestamp,
    ],
  );
  return result.lastInsertId as number;
}

async function getTransacaoVinculada(id: number): Promise<Transacao | null> {
  const db = await getDatabase();
  const rows = await db.select<TransacaoRow[]>(
    "SELECT * FROM transacoes WHERE transacao_vinculada_id = $1 LIMIT 1",
    [id],
  );
  return rows[0] ? mapTransacao(rows[0]) : null;
}

async function getParVinculado(transacao: Transacao): Promise<Transacao | null> {
  if (transacao.transacao_vinculada_id) {
    return getTransacao(transacao.transacao_vinculada_id);
  }
  return getTransacaoVinculada(transacao.id);
}

function buildTransacaoFilters(filters: TransacaoFilters = {}): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.contexto && filters.contexto !== "consolidado") {
    clauses.push("contexto = $" + (params.length + 1));
    params.push(filters.contexto);
  }
  if (filters.dataInicio) {
    clauses.push("data >= $" + (params.length + 1));
    params.push(filters.dataInicio);
  }
  if (filters.dataFim) {
    clauses.push("data <= $" + (params.length + 1));
    params.push(filters.dataFim);
  }
  if (filters.categoriaId) {
    clauses.push("categoria_id = $" + (params.length + 1));
    params.push(filters.categoriaId);
  }
  if (filters.contaId) {
    clauses.push("conta_id = $" + (params.length + 1));
    params.push(filters.contaId);
  }

  return { clauses, params };
}

export async function listTransacoes(filters: TransacaoFilters = {}): Promise<Transacao[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const { clauses, params } = buildTransacaoFilters(filters);
    const where = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
    const query = `SELECT * FROM transacoes WHERE 1=1${where} ORDER BY data DESC, id DESC`;
    const rows = await db.select<TransacaoRow[]>(query, params);
    return rows.map(mapTransacao);
  });
}

export async function getTransacao(id: number): Promise<Transacao | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<TransacaoRow[]>("SELECT * FROM transacoes WHERE id = $1", [id]);
    return rows[0] ? mapTransacao(rows[0]) : null;
  });
}

export async function createTransacao(input: TransacaoInput): Promise<Transacao> {
  return withDatabase(async () => {
    let categoriaId = input.categoria_id;
    const contaNova = await getConta(input.conta_id);
    if (
      categoriaId == null &&
      input.tipo === "despesa" &&
      contaNova?.tipo === "cartao_credito"
    ) {
      const { findCategoriaCartoesCreditoNaLista, listCategorias } = await import("./categorias");
      const cats = await listCategorias(input.contexto);
      categoriaId = findCategoriaCartoesCreditoNaLista(cats, input.contexto)?.id ?? null;
    }
    if (
      categoriaId == null &&
      input.tipo !== "transferencia" &&
      (input.tipo === "receita" || input.tipo === "despesa")
    ) {
      categoriaId = await resolverCategoriaPorDescricao(
        input.descricao,
        input.contexto,
        input.tipo,
      );
    }
    const id = await insertTransacao({ ...input, categoria_id: categoriaId });
    const transacao = await getTransacao(id);
    if (!transacao) {
      throw new DatabaseError("Falha ao criar transação");
    }

    if (transacao.tipo === "despesa" && transacao.status === "efetivado") {
      const conta = await getConta(transacao.conta_id);
      if (conta?.tipo === "cartao_credito") {
        const { vincularCompraAFatura } = await import("./faturasCartao");
        await vincularCompraAFatura(transacao.id, conta.id, transacao.data);
      }
    }

    if (input.tag_ids !== undefined) {
      await setTagsTransacao(transacao.id, input.tag_ids);
    }

    if (transacao.categoria_id != null && transacao.tipo !== "transferencia") {
      const { getCategoria } = await import("./categorias");
      const { garantirOrcamentoCategoriaMes } = await import("./orcamentos");
      const cat = await getCategoria(transacao.categoria_id);
      if (cat) {
        await garantirOrcamentoCategoriaMes(cat, transacao.data.slice(0, 7));
      }
    }

    return transacao;
  });
}

/**
 * Cria N despesas no cartão, uma por fatura/mês, agrupadas por compra_parcelada_id.
 * Todas as parcelas guardam a data da compra; o ciclo da fatura segue o número da parcela.
 * `parcelas_ja_pagas`: primeiras parcelas já cobradas — não são criadas de novo;
 * as restantes mantêm a numeração (ex.: 5/10).
 */
export async function createCompraParceladaCartao(
  input: Omit<TransacaoInput, "tipo" | "parcela_numero" | "parcela_total" | "compra_parcelada_id"> & {
    parcelas: number;
    /** Quantas primeiras parcelas já entraram na fatura (0 = compra nova). */
    parcelas_ja_pagas?: number;
  },
): Promise<Transacao[]> {
  const n = Math.floor(input.parcelas);
  if (n < 2 || n > 48) {
    throw new DatabaseError("Informe entre 2 e 48 parcelas");
  }

  const jaPagas = Math.floor(input.parcelas_ja_pagas ?? 0);
  if (jaPagas < 0 || jaPagas >= n) {
    throw new DatabaseError(
      jaPagas >= n
        ? "Parcelas já pagas deve ser menor que o total (deixe ao menos 1 em aberto)."
        : "Informe um número válido de parcelas já pagas.",
    );
  }

  const conta = await getConta(input.conta_id);
  if (!conta || conta.tipo !== "cartao_credito") {
    throw new DatabaseError("Parcelamento só está disponível para cartão de crédito");
  }

  const { dividirValorTotal } = await import("../utils/financiamentoCalc");
  const valores = dividirValorTotal(input.valor, n);
  const groupId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `parc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const {
    parcelas: _parcelas,
    parcelas_ja_pagas: _jaPagas,
    ...baseInput
  } = input as typeof input & { parcelas: number; parcelas_ja_pagas?: number };

  const dataCompra = baseInput.data;
  const criadas: Transacao[] = [];
  for (let indice = jaPagas; indice < n; indice++) {
    const numero = indice + 1;
    const created = await createTransacao({
      ...baseInput,
      tipo: "despesa",
      valor: valores[indice],
      data: dataCompra,
      descricao: `${baseInput.descricao} (${numero}/${n})`,
      categoria_id: baseInput.categoria_id ?? null,
      compra_parcelada_id: groupId,
      parcela_numero: numero,
      parcela_total: n,
    });
    criadas.push(created);
  }
  return criadas;
}

interface ParcelaDataRow {
  id: number;
  data: string;
  parcela_numero: number | null;
  fatura_cartao_id: number | null;
  fatura_mes: string | null;
}

function inferirDataCompraGrupo(items: ParcelaDataRow[], diaFechamento: number): string | null {
  if (items.length === 0) return null;

  const implied = items.map((i) => addMonths(i.data, 1 - (i.parcela_numero ?? 1)));
  const uniqueImplied = new Set(implied);
  const uniqueData = new Set(items.map((i) => i.data));

  if (items.length > 1 && uniqueImplied.size === 1) return implied[0];
  if (items.length > 1 && uniqueData.size === 1) return items[0].data;

  const minP = items.reduce((a, b) =>
    (a.parcela_numero ?? 1) <= (b.parcela_numero ?? 1) ? a : b,
  );
  const n = minP.parcela_numero ?? 1;
  const mesSeCompra = mesFechamentoParaData(dataCicloParcelaCartao(minP.data, n), diaFechamento);
  const mesSeCiclo = mesFechamentoParaData(minP.data, diaFechamento);
  if (minP.fatura_mes) {
    if (minP.fatura_mes === mesSeCompra && minP.fatura_mes !== mesSeCiclo) {
      return minP.data;
    }
    if (minP.fatura_mes === mesSeCiclo && minP.fatura_mes !== mesSeCompra) {
      return addMonths(minP.data, 1 - n);
    }
  }
  if (uniqueImplied.size === 1) return implied[0];
  if (uniqueData.size === 1) return items[0].data;
  return addMonths(minP.data, 1 - n);
}

/** Grava a data da compra em todas as parcelas e religa cada uma à fatura do ciclo. */
export async function alinharDatasCompraParceladaConta(contaId: number): Promise<void> {
  const conta = await getConta(contaId);
  if (!conta?.dia_fechamento || conta.tipo !== "cartao_credito") return;
  const diaFechamento = conta.dia_fechamento;

  await withDatabase(async () => {
    const db = await getDatabase();
    const grupos = await db.select<{ compra_parcelada_id: string }[]>(
      `SELECT DISTINCT compra_parcelada_id AS compra_parcelada_id
       FROM transacoes
       WHERE conta_id = $1 AND compra_parcelada_id IS NOT NULL`,
      [contaId],
    );

    const { vincularCompraAFatura, recalcularFaturaPorId } = await import("./faturasCartao");
    const ts = nowIso();

    for (const g of grupos) {
      const items = await db.select<ParcelaDataRow[]>(
        `SELECT t.id, t.data, t.parcela_numero, t.fatura_cartao_id,
                f.mes_referencia AS fatura_mes
         FROM transacoes t
         LEFT JOIN faturas_cartao f ON f.id = t.fatura_cartao_id
         WHERE t.compra_parcelada_id = $1
         ORDER BY t.parcela_numero ASC, t.id ASC`,
        [g.compra_parcelada_id],
      );
      const dataCompra = inferirDataCompraGrupo(items, diaFechamento);
      if (!dataCompra) continue;

      const faturasAntigas = new Set(
        items.map((i) => i.fatura_cartao_id).filter((id): id is number => id != null),
      );
      const precisaAtualizar = items.some((i) => i.data !== dataCompra);
      if (precisaAtualizar) {
        await db.execute(
          `UPDATE transacoes SET data = $1, updated_at = $2 WHERE compra_parcelada_id = $3`,
          [dataCompra, ts, g.compra_parcelada_id],
        );
      }
      if (precisaAtualizar || items.some((i) => i.fatura_cartao_id == null)) {
        for (const item of items) {
          await vincularCompraAFatura(item.id, contaId, dataCompra);
        }
      }
      if (precisaAtualizar) {
        for (const faturaId of faturasAntigas) {
          await recalcularFaturaPorId(faturaId);
        }
      }
    }
  });
}

export async function createTransferencia(
  input: TransferenciaInput,
): Promise<{ saida: Transacao; entrada: Transacao }> {
  return withDatabase(async () => {
    const origem = await getConta(input.conta_origem_id);
    const destino = await getConta(input.conta_destino_id);

    if (!origem || !destino) {
      throw new DatabaseError("Conta de origem ou destino não encontrada");
    }
    if (origem.id === destino.id) {
      throw new DatabaseError("Selecione contas de origem e destino diferentes");
    }

    const crossContext = origem.contexto !== destino.contexto;
    const obs = input.observacoes ?? null;

    const saidaId = await insertTransacao({
      descricao: input.descricao,
      valor: input.valor,
      data: input.data,
      tipo: crossContext ? "despesa" : "transferencia",
      conta_id: origem.id,
      categoria_id: crossContext ? (input.categoria_origem_id ?? null) : null,
      contexto: origem.contexto,
      observacoes: crossContext
        ? `${obs ? obs + " · " : ""}Transferência → ${destino.nome} (${destino.contexto})`
        : `${obs ? obs + " · " : ""}Transferência → ${destino.nome}`,
      transferencia_papel: crossContext ? null : "saida",
    });

    const entradaId = await insertTransacao({
      descricao: input.descricao,
      valor: input.valor,
      data: input.data,
      tipo: crossContext ? "receita" : "transferencia",
      conta_id: destino.id,
      categoria_id: crossContext ? (input.categoria_destino_id ?? null) : null,
      contexto: destino.contexto,
      transacao_vinculada_id: saidaId,
      observacoes: crossContext
        ? `${obs ? obs + " · " : ""}Transferência ← ${origem.nome} (${origem.contexto})`
        : `${obs ? obs + " · " : ""}Transferência ← ${origem.nome}`,
      transferencia_papel: crossContext ? null : "entrada",
    });

    const db = await getDatabase();
    await db.execute(
      "UPDATE transacoes SET transacao_vinculada_id = $1, updated_at = $2 WHERE id = $3",
      [entradaId, nowIso(), saidaId],
    );

    const saida = await getTransacao(saidaId);
    const entrada = await getTransacao(entradaId);
    if (!saida || !entrada) {
      throw new DatabaseError("Falha ao criar transferência");
    }
    return { saida, entrada };
  });
}

export interface UpdateTransferenciaVinculadaInput {
  descricao: string;
  valor: number;
  data: string;
  observacoes?: string | null;
  categoria_origem_id?: number | null;
  categoria_destino_id?: number | null;
}

export async function updateTransferenciaVinculada(
  id: number,
  input: UpdateTransferenciaVinculadaInput,
): Promise<void> {
  return withDatabase(async () => {
    const existing = await getTransacao(id);
    if (!existing) {
      throw new DatabaseError("Transação não encontrada");
    }

    const par = await getParVinculado(existing);
    if (!par) {
      throw new DatabaseError("Par de transferência não encontrado");
    }

    const saida = existing.tipo === "despesa" ? existing : par;
    const entrada = existing.tipo === "receita" ? existing : par;
    const crossContext = saida.contexto !== entrada.contexto;
    const obs = input.observacoes ?? null;
    const timestamp = nowIso();
    const db = await getDatabase();

    const contaOrigem = await getConta(saida.conta_id);
    const contaDestino = await getConta(entrada.conta_id);

    const obsSaida = crossContext
      ? `${obs ? obs + " · " : ""}Transferência → ${contaDestino?.nome ?? "?"} (${entrada.contexto})`
      : `${obs ? obs + " · " : ""}Transferência → ${contaDestino?.nome ?? "?"}`;
    const obsEntrada = crossContext
      ? `${obs ? obs + " · " : ""}Transferência ← ${contaOrigem?.nome ?? "?"} (${saida.contexto})`
      : `${obs ? obs + " · " : ""}Transferência ← ${contaOrigem?.nome ?? "?"}`;

    await db.execute(
      `UPDATE transacoes
       SET descricao = $1, valor = $2, data = $3, categoria_id = $4, observacoes = $5, updated_at = $6
       WHERE id = $7`,
      [
        input.descricao,
        input.valor,
        input.data,
        input.categoria_origem_id ?? null,
        obsSaida,
        timestamp,
        saida.id,
      ],
    );

    await db.execute(
      `UPDATE transacoes
       SET descricao = $1, valor = $2, data = $3, categoria_id = $4, observacoes = $5, updated_at = $6
       WHERE id = $7`,
      [
        input.descricao,
        input.valor,
        input.data,
        input.categoria_destino_id ?? null,
        obsEntrada,
        timestamp,
        entrada.id,
      ],
    );
  });
}

export async function updateTransacao(
  id: number,
  input: Partial<TransacaoInput>,
): Promise<Transacao> {
  return withDatabase(async () => {
    const existing = await getTransacao(id);
    if (!existing) {
      throw new DatabaseError("Transação não encontrada");
    }

    const par = await getParVinculado(existing);

    const db = await getDatabase();
    const timestamp = nowIso();

    const applyUpdate = async (txnId: number, patch: Partial<TransacaoInput>) => {
      const current = txnId === existing.id ? existing : par!;
      await db.execute(
        `UPDATE transacoes
         SET descricao = $1, valor = $2, data = $3, tipo = $4, conta_id = $5,
             categoria_id = $6, contexto = $7, status = $8, anexo_path = $9,
             observacoes = $10, updated_at = $11
         WHERE id = $12`,
        [
          patch.descricao ?? current.descricao,
          patch.valor ?? current.valor,
          patch.data ?? current.data,
          patch.tipo ?? current.tipo,
          patch.conta_id ?? current.conta_id,
          patch.categoria_id !== undefined ? patch.categoria_id : current.categoria_id,
          patch.contexto ?? current.contexto,
          patch.status ?? current.status,
          patch.anexo_path !== undefined ? patch.anexo_path : current.anexo_path,
          patch.observacoes !== undefined ? patch.observacoes : current.observacoes,
          timestamp,
          txnId,
        ],
      );
    };

    await applyUpdate(id, input);

    if (
      existing.compra_parcelada_id &&
      input.categoria_id !== undefined &&
      input.categoria_id != null
    ) {
      await db.execute(
        `UPDATE transacoes
         SET categoria_id = $1, updated_at = $2
         WHERE compra_parcelada_id = $3`,
        [input.categoria_id, timestamp, existing.compra_parcelada_id],
      );
    }

    if (
      existing.compra_parcelada_id &&
      input.data &&
      input.data !== existing.data
    ) {
      await db.execute(
        `UPDATE transacoes SET data = $1, updated_at = $2 WHERE compra_parcelada_id = $3`,
        [input.data, timestamp, existing.compra_parcelada_id],
      );
    }

    if (par) {
      await applyUpdate(par.id, {
        descricao: input.descricao ?? existing.descricao,
        valor: input.valor ?? existing.valor,
        data: input.data ?? existing.data,
        status: input.status ?? existing.status,
        observacoes: input.observacoes !== undefined ? input.observacoes : existing.observacoes,
      });
    }

    const transacao = await getTransacao(id);
    if (!transacao) {
      throw new DatabaseError("Falha ao atualizar transação");
    }
    if (input.tag_ids !== undefined) {
      await setTagsTransacao(id, input.tag_ids);
    }

    const conta = await getConta(transacao.conta_id);
    if (transacao.tipo === "despesa" && conta?.tipo === "cartao_credito") {
      const { vincularCompraAFatura, recalcularFaturaPorId } = await import("./faturasCartao");
      const dataMudou =
        !!existing.compra_parcelada_id && !!input.data && input.data !== existing.data;
      if (dataMudou && transacao.compra_parcelada_id) {
        const siblings = await db.select<{ id: number; fatura_cartao_id: number | null }[]>(
          `SELECT id, fatura_cartao_id FROM transacoes WHERE compra_parcelada_id = $1`,
          [transacao.compra_parcelada_id],
        );
        const faturasAntigas = new Set<number>();
        if (existing.fatura_cartao_id) faturasAntigas.add(existing.fatura_cartao_id);
        for (const s of siblings) {
          if (s.fatura_cartao_id) faturasAntigas.add(s.fatura_cartao_id);
          await vincularCompraAFatura(s.id, transacao.conta_id, transacao.data);
        }
        for (const faturaId of faturasAntigas) {
          await recalcularFaturaPorId(faturaId);
        }
      } else {
        await vincularCompraAFatura(transacao.id, transacao.conta_id, transacao.data);
        if (
          existing.fatura_cartao_id &&
          existing.fatura_cartao_id !== transacao.fatura_cartao_id
        ) {
          await recalcularFaturaPorId(existing.fatura_cartao_id);
        }
      }
    }

    return transacao;
  });
}

async function revertContasPagarReceber(db: Awaited<ReturnType<typeof getDatabase>>, id: number) {
  await db.execute(
    `UPDATE contas_a_pagar_receber
     SET status = 'pendente', transacao_id = NULL
     WHERE transacao_id = $1`,
    [id],
  );
}

export async function deleteTransacao(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const transacao = await getTransacao(id);
    if (!transacao) return;

    const par = await getParVinculado(transacao);
    const idsToDelete = par
      ? [transacao.id, par.id].sort((a, b) => a - b)
      : [transacao.id];
    const faturaIds = new Set<number>();
    if (transacao.fatura_cartao_id) faturaIds.add(transacao.fatura_cartao_id);
    if (par?.fatura_cartao_id) faturaIds.add(par.fatura_cartao_id);

    for (const t of [transacao, par]) {
      if (t?.anexo_path) {
        try {
          await removerAnexoArquivo(t.anexo_path);
        } catch {
          // arquivo pode já ter sido removido
        }
      }
    }

    for (const txnId of idsToDelete) {
      await revertContasPagarReceber(db, txnId);
      await reverterParcelaPorTransacao(txnId);
      await reverterParcelaEmprestimoPorTransacao(txnId);
    }

    for (const txnId of [...idsToDelete].reverse()) {
      await db.execute("UPDATE transacoes SET transacao_vinculada_id = NULL WHERE transacao_vinculada_id = $1", [txnId]);
      await db.execute("DELETE FROM transacoes WHERE id = $1", [txnId]);
    }

    if (faturaIds.size > 0) {
      const { recalcularFaturaPorId, limparFaturasVaziasConta } = await import("./faturasCartao");
      for (const faturaId of faturaIds) {
        await recalcularFaturaPorId(faturaId);
      }
      const contasCartao = new Set<number>();
      if (transacao) contasCartao.add(transacao.conta_id);
      if (par) contasCartao.add(par.conta_id);
      for (const contaId of contasCartao) {
        await limparFaturasVaziasConta(contaId);
      }
    }
  });
}

export async function listParcelasCompraCartao(groupId: string): Promise<Transacao[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<TransacaoRow[]>(
      `SELECT * FROM transacoes WHERE compra_parcelada_id = $1 ORDER BY parcela_numero ASC, id ASC`,
      [groupId],
    );
    return rows.map(mapTransacao);
  });
}

/**
 * Compras no cartão sem categoria (e parcelas irmãs) passam a usar
 * “Cartões de crédito”, para o envelope do orçamento ser consumido.
 */
export async function backfillCategoriasComprasCartao(): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const grupos = await db.select<{ compra_parcelada_id: string; categoria_id: number }[]>(
      `SELECT compra_parcelada_id, categoria_id
       FROM transacoes
       WHERE compra_parcelada_id IS NOT NULL AND categoria_id IS NOT NULL
       ORDER BY parcela_numero DESC, id DESC`,
    );
    const catPorGrupo = new Map<string, number>();
    for (const g of grupos) {
      if (!catPorGrupo.has(g.compra_parcelada_id)) {
        catPorGrupo.set(g.compra_parcelada_id, g.categoria_id);
      }
    }
    for (const [groupId, categoriaId] of catPorGrupo) {
      await db.execute(
        `UPDATE transacoes
         SET categoria_id = $1
         WHERE compra_parcelada_id = $2 AND categoria_id IS NULL`,
        [categoriaId, groupId],
      );
    }

    const { findCategoriaCartoesCreditoNaLista, listCategorias } = await import("./categorias");
    for (const ctx of ["pessoal", "empresa"] as const) {
      const cats = await listCategorias(ctx);
      const padrao = findCategoriaCartoesCreditoNaLista(cats, ctx);
      if (!padrao) continue;
      await db.execute(
        `UPDATE transacoes
         SET categoria_id = $1
         WHERE categoria_id IS NULL
           AND tipo = 'despesa'
           AND contexto = $2
           AND conta_id IN (SELECT id FROM contas WHERE tipo = 'cartao_credito')`,
        [padrao.id, ctx],
      );
    }
  });
}

export async function deleteCompraParceladaCartao(groupId: string): Promise<void> {
  const parcelas = await listParcelasCompraCartao(groupId);
  for (const parcela of parcelas) {
    await deleteTransacao(parcela.id);
  }
}

export async function getResumoMensal(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
): Promise<{ receitas: number; despesas: number }> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query: baseQuery, params } = applyContextoFilter(
      `SELECT tipo, SUM(valor) as total
       FROM transacoes
       WHERE status = 'efetivado'
         AND data LIKE $MES${filter.clause}${sqlExcluirTransferenciaCrossContext(contexto)}
       GROUP BY tipo`,
      filter,
      2,
    );
    const query = baseQuery.replace("$MES", "$1");
    const rows = await db.select<{ tipo: TipoTransacao; total: number }[]>(query, [
      `${mesReferencia}%`,
      ...params,
    ]);

    let receitas = 0;
    let despesas = 0;
    for (const row of rows) {
      if (row.tipo === "receita") receitas += row.total;
      if (row.tipo === "despesa") despesas += row.total;
    }
    return { receitas, despesas };
  });
}

export async function getFluxoCaixaPorDia(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
): Promise<{ data: string; receitas: number; despesas: number; saldo: number; saldoAbertura: number }[]> {
  return withDatabase(async () => {
    const saldoAbertura = await getSaldoAberturaMes(mesReferencia, contexto);
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query: baseQuery, params } = applyContextoFilter(
      `SELECT data, tipo, SUM(valor) as total
       FROM transacoes
       WHERE status = 'efetivado'
         AND data LIKE $MES${filter.clause}${sqlExcluirTransferenciaCrossContext(contexto)}
       GROUP BY data, tipo
       ORDER BY data ASC`,
      filter,
      2,
    );
    const query = baseQuery.replace("$MES", "$1");
    const rows = await db.select<{ data: string; tipo: TipoTransacao; total: number }[]>(query, [
      `${mesReferencia}%`,
      ...params,
    ]);

    const porDia = new Map<string, { receitas: number; despesas: number }>();
    for (const row of rows) {
      const entry = porDia.get(row.data) ?? { receitas: 0, despesas: 0 };
      if (row.tipo === "receita") entry.receitas += row.total;
      if (row.tipo === "despesa") entry.despesas += row.total;
      porDia.set(row.data, entry);
    }

    let saldoAcumulado = saldoAbertura;
    const fluxo = Array.from(porDia.entries()).map(([data, valores]) => {
      saldoAcumulado += valores.receitas - valores.despesas;
      return { data, ...valores, saldo: saldoAcumulado, saldoAbertura };
    });

    if (fluxo.length === 0) {
      return [{ data: `${mesReferencia}-01`, receitas: 0, despesas: 0, saldo: saldoAbertura, saldoAbertura }];
    }

    return fluxo;
  });
}

export interface GastoPorCategoriaResumo {
  categoria_id: number | null;
  categoria_nome: string | null;
  categoria_cor: string | null;
  total: number;
}

/** IDs sintéticos para transferências entre contextos nos gráficos de despesa */
export const CATEGORIA_TRANSFERENCIA_PESSOAL = -1;
export const CATEGORIA_TRANSFERENCIA_EMPRESA = -2;

const GRUPO_CATEGORIA_SQL = `
  CASE
    WHEN t.categoria_id IS NOT NULL THEN t.categoria_id
    WHEN t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'pessoal' THEN ${CATEGORIA_TRANSFERENCIA_PESSOAL}
    WHEN t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'empresa' THEN ${CATEGORIA_TRANSFERENCIA_EMPRESA}
    ELSE NULL
  END`;

function mapGastoPorCategoria(row: {
  categoria_id: number | string | null;
  categoria_nome: string | null;
  categoria_cor: string | null;
  total: number | string;
}): GastoPorCategoriaResumo {
  return {
    categoria_id: row.categoria_id != null ? Number(row.categoria_id) : null,
    categoria_nome: row.categoria_nome,
    categoria_cor: row.categoria_cor,
    total: Number(row.total),
  };
}

export async function getGastoPorCategoria(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
): Promise<GastoPorCategoriaResumo[]> {
  return getGastoPorCategoriaPeriodo(`${mesReferencia}%`, contexto);
}

export async function getGastoPorCategoriaPeriodo(
  periodoLike: string,
  contexto?: ContextoVisualizacao,
): Promise<GastoPorCategoriaResumo[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto, "t.contexto");
    const { query: baseQuery, params } = applyContextoFilter(
      `SELECT ${GRUPO_CATEGORIA_SQL} AS categoria_id,
              CASE
                WHEN t.categoria_id IS NOT NULL THEN MAX(c.nome)
                WHEN t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'pessoal' THEN 'Transferência → pessoal'
                WHEN t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'empresa' THEN 'Transferência → empresa'
                ELSE NULL
              END AS categoria_nome,
              CASE
                WHEN t.categoria_id IS NOT NULL THEN MAX(c.cor)
                WHEN t.transacao_vinculada_id IS NOT NULL THEN '#a78bfa'
                ELSE NULL
              END AS categoria_cor,
              SUM(t.valor) AS total
       FROM transacoes t
       LEFT JOIN categorias c ON CAST(c.id AS INTEGER) = CAST(t.categoria_id AS INTEGER)
       LEFT JOIN transacoes v ON v.id = t.transacao_vinculada_id
       WHERE t.status = 'efetivado'
         AND t.tipo = 'despesa'
         AND t.data LIKE $PER${filter.clause}${sqlExcluirTransferenciaCrossContext(contexto, "t")}
       GROUP BY ${GRUPO_CATEGORIA_SQL}
       ORDER BY total DESC`,
      filter,
      2,
    );
    const query = baseQuery.replace("$PER", "$1");
    const rows = await db.select<
      {
        categoria_id: number | string | null;
        categoria_nome: string | null;
        categoria_cor: string | null;
        total: number | string;
      }[]
    >(query, [periodoLike, ...params]);
    return rows.map(mapGastoPorCategoria);
  });
}

export async function getGastoPorCategoriaAno(
  ano: number,
  contexto?: ContextoVisualizacao,
): Promise<GastoPorCategoriaResumo[]> {
  return getGastoPorCategoriaPeriodo(`${ano}%`, contexto);
}

export async function getDespesasDetalhadas(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
  categoriaId?: number | null,
  limite = 8,
): Promise<{ id: number; descricao: string; valor: number }[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto, "t.contexto");
    let query = `SELECT t.id, t.descricao, t.valor
       FROM transacoes t
       LEFT JOIN transacoes v ON v.id = t.transacao_vinculada_id
       WHERE t.status = 'efetivado'
         AND t.tipo = 'despesa'
         AND t.data LIKE $MES`;
    const params: unknown[] = [`${mesReferencia}%`];

    if (filter.clause) {
      query += filter.clause.replace(/\$CTX/g, () => `$${params.length + 1}`);
      params.push(...filter.params);
    }

    if (categoriaId === CATEGORIA_TRANSFERENCIA_PESSOAL) {
      query += " AND t.categoria_id IS NULL AND t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'pessoal'";
    } else if (categoriaId === CATEGORIA_TRANSFERENCIA_EMPRESA) {
      query += " AND t.categoria_id IS NULL AND t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'empresa'";
    } else if (categoriaId !== undefined && categoriaId !== null) {
      query += ` AND t.categoria_id = $${params.length + 1}`;
      params.push(categoriaId);
    } else if (categoriaId === null) {
      query += " AND t.categoria_id IS NULL AND t.transacao_vinculada_id IS NULL";
    }

    query += ` ORDER BY t.valor DESC LIMIT ${limite}`;
    return db.select<{ id: number; descricao: string; valor: number }[]>(query, params);
  });
}

export async function getTotalDespesasPeriodo(
  periodoLike: string,
  contexto?: ContextoVisualizacao,
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query: baseQuery, params } = applyContextoFilter(
      `SELECT COALESCE(SUM(valor), 0) as total
       FROM transacoes
       WHERE status = 'efetivado'
         AND tipo = 'despesa'
         AND data LIKE $PER${filter.clause}${sqlExcluirTransferenciaCrossContext(contexto)}`,
      filter,
      2,
    );
    const query = baseQuery.replace("$PER", "$1");
    const rows = await db.select<{ total: number }[]>(query, [periodoLike, ...params]);
    return rows[0]?.total ?? 0;
  });
}

export async function getComparativoMensal(
  meses: string[],
  contexto?: ContextoVisualizacao,
): Promise<{ mes: string; receitas: number; despesas: number }[]> {
  return Promise.all(
    meses.map(async (mes) => {
      const resumo = await getResumoMensal(mes, contexto);
      return { mes, ...resumo };
    }),
  );
}

export async function listTransacoesParaExportacao(
  filters: TransacaoFilters = {},
): Promise<Transacao[]> {
  return listTransacoes(filters);
}

export { getParVinculado };
