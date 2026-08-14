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
import { arredondarMoeda, gerarValoresPrevistos, normalizarFaixaInicial, redistribuirPrevistosPendentes } from "../utils/financiamentoCalc";
import type {
  Contexto,
  ContextoVisualizacao,
  Emprestimo,
  EmprestimoParcela,
  EmprestimoResumo,
  ModalidadeEmprestimo,
  StatusParcelaEmprestimo,
} from "../types";

export interface EmprestimoInput {
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
  modalidade?: ModalidadeEmprestimo;
  faixa_inicial_qtd?: number | null;
  faixa_inicial_valor?: number | null;
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
  criar_transacao?: boolean;
}

interface EmprestimoRow {
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
  modalidade: string | null;
  faixa_inicial_qtd: number | null;
  faixa_inicial_valor: number | null;
  created_at: string;
  updated_at: string;
}

interface ParcelaRow {
  id: number;
  emprestimo_id: number;
  numero_parcela: number;
  valor_previsto: number;
  vencimento: string;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: StatusParcelaEmprestimo;
  transacao_id: number | null;
  observacoes: string | null;
}

function normalizarModalidade(value: string | null | undefined): ModalidadeEmprestimo {
  return value === "parcelamento" ? "parcelamento" : "emprestimo";
}

function mapEmprestimo(row: EmprestimoRow): Emprestimo {
  return {
    ...row,
    ativo: toBoolean(row.ativo),
    modalidade: normalizarModalidade(row.modalidade),
    faixa_inicial_qtd: row.faixa_inicial_qtd && row.faixa_inicial_qtd > 0 ? row.faixa_inicial_qtd : null,
    faixa_inicial_valor:
      row.faixa_inicial_valor != null && row.faixa_inicial_valor > 0
        ? row.faixa_inicial_valor
        : null,
  };
}

function mapParcela(row: ParcelaRow): EmprestimoParcela {
  return row;
}

async function gerarParcelas(
  emprestimoId: number,
  valorTotal: number,
  valorParcela: number,
  totalParcelas: number,
  dataPrimeira: string,
  faixa?: ReturnType<typeof normalizarFaixaInicial>,
): Promise<void> {
  const db = await getDatabase();
  const valores = gerarValoresPrevistos(valorTotal, valorParcela, totalParcelas, faixa);
  for (let i = 0; i < totalParcelas; i++) {
    const vencimento = addMonths(dataPrimeira, i);
    const status = atualizarStatusParcela(vencimento, "pendente");
    await db.execute(
      `INSERT INTO emprestimo_parcelas
       (emprestimo_id, numero_parcela, valor_previsto, vencimento, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [emprestimoId, i + 1, valores[i], vencimento, status],
    );
  }
}

/** Redistribui valor previsto das parcelas pendentes com base no saldo devedor real */
async function recalcularParcelasPendentes(fin: Emprestimo): Promise<void> {
  const db = await getDatabase();
  const parcelas = await listParcelas(fin.id);
  const pagas = parcelas.filter((p) => p.status === "paga");
  const pendentes = parcelas.filter((p) => p.status !== "paga");
  const valorPago = pagas.reduce((s, p) => s + (p.valor_pago ?? 0), 0);
  const saldoRestante = arredondarMoeda(Math.max(0, fin.valor_total - valorPago));

  if (pendentes.length === 0) return;

  const faixa = normalizarFaixaInicial(fin.faixa_inicial_qtd, fin.faixa_inicial_valor);
  const valoresOriginais = gerarValoresPrevistos(
    fin.valor_total,
    fin.valor_parcela,
    fin.total_parcelas,
    faixa,
  );
  const updates = redistribuirPrevistosPendentes(saldoRestante, pendentes, valoresOriginais);
  for (const u of updates) {
    await db.execute("UPDATE emprestimo_parcelas SET valor_previsto = $1 WHERE id = $2", [
      u.previsto,
      u.id,
    ]);
  }
}

async function calcularResumoEmprestimo(fin: Emprestimo): Promise<EmprestimoResumo> {
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

export async function listEmprestimos(
  contexto?: ContextoVisualizacao,
  modalidade?: ModalidadeEmprestimo,
): Promise<EmprestimoResumo[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto);
    const { query: base, params } = applyContextoFilter(
      `SELECT * FROM emprestimos WHERE ativo = 1${filter.clause}`,
      filter,
    );
    const allParams = [...params];
    let query = base;
    if (modalidade) {
      query += ` AND modalidade = $${allParams.length + 1}`;
      allParams.push(modalidade);
    }
    query += " ORDER BY descricao ASC";
    const rows = await db.select<EmprestimoRow[]>(query, allParams);
    return Promise.all(rows.map((r) => calcularResumoEmprestimo(mapEmprestimo(r))));
  });
}

export async function getEmprestimo(id: number): Promise<Emprestimo | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<EmprestimoRow[]>(
      "SELECT * FROM emprestimos WHERE id = $1",
      [id],
    );
    return rows[0] ? mapEmprestimo(rows[0]) : null;
  });
}

export async function getEmprestimoComResumo(id: number): Promise<EmprestimoResumo | null> {
  const fin = await getEmprestimo(id);
  return fin ? calcularResumoEmprestimo(fin) : null;
}

export async function listParcelas(emprestimoId: number): Promise<EmprestimoParcela[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<ParcelaRow[]>(
      `SELECT * FROM emprestimo_parcelas
       WHERE emprestimo_id = $1
       ORDER BY numero_parcela ASC`,
      [emprestimoId],
    );
    return rows.map(mapParcela);
  });
}

export async function createEmprestimo(input: EmprestimoInput): Promise<EmprestimoResumo> {
  const modalidade = input.modalidade === "parcelamento" ? "parcelamento" : "emprestimo";
  if (input.categoria_id == null) {
    throw new DatabaseError(
      modalidade === "parcelamento"
        ? "Informe a categoria do orçamento (ex.: Parcelamentos) para a parcela entrar no controle mensal."
        : "Informe a categoria do orçamento (ex.: Empréstimo) para a parcela entrar no controle mensal.",
    );
  }

  const resumo = await withDatabase(async () => {
    const db = await getDatabase();
    const timestamp = nowIso();
    const faixa = normalizarFaixaInicial(input.faixa_inicial_qtd, input.faixa_inicial_valor);
    const result = await db.execute(
      `INSERT INTO emprestimos
       (descricao, valor_total, valor_parcela, total_parcelas, contexto, conta_id,
        categoria_id, data_primeira_parcela, ativo, observacoes, modalidade,
        faixa_inicial_qtd, faixa_inicial_valor, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        input.descricao,
        input.valor_total,
        input.valor_parcela,
        input.total_parcelas,
        input.contexto,
        input.conta_id,
        input.categoria_id,
        input.data_primeira_parcela,
        fromBoolean(input.ativo ?? true),
        input.observacoes ?? null,
        modalidade,
        faixa?.qtd ?? null,
        faixa?.valor ?? null,
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
      faixa,
    );
    const fin = await getEmprestimo(id);
    if (!fin) throw new DatabaseError("Falha ao criar dívida");
    return calcularResumoEmprestimo(fin);
  });

  if (input.categoria_id != null) {
    const { getCategoria } = await import("./categorias");
    const { garantirOrcamentoCategoriaMes } = await import("./orcamentos");
    const cat = await getCategoria(input.categoria_id);
    if (cat) await garantirOrcamentoCategoriaMes(cat);
  }

  return resumo;
}

export async function updateEmprestimo(
  id: number,
  input: Partial<EmprestimoInput>,
): Promise<EmprestimoResumo> {
  const resumo = await withDatabase(async () => {
    const existing = await getEmprestimo(id);
    if (!existing) throw new DatabaseError("Emprestimo não encontrado");

    if (input.categoria_id === null) {
      throw new DatabaseError("A categoria do orçamento é obrigatória no empréstimo.");
    }

    const db = await getDatabase();
    const novoTotal = input.valor_total ?? existing.valor_total;
    const novaParcelaRef = input.valor_parcela ?? existing.valor_parcela;
    const novaFaixa = normalizarFaixaInicial(
      input.faixa_inicial_qtd !== undefined ? input.faixa_inicial_qtd : existing.faixa_inicial_qtd,
      input.faixa_inicial_valor !== undefined
        ? input.faixa_inicial_valor
        : existing.faixa_inicial_valor,
    );

    await db.execute(
      `UPDATE emprestimos
       SET descricao = $1, valor_total = $2, valor_parcela = $3, conta_id = $4,
           categoria_id = $5, ativo = $6, observacoes = $7,
           faixa_inicial_qtd = $8, faixa_inicial_valor = $9, updated_at = $10
       WHERE id = $11`,
      [
        input.descricao ?? existing.descricao,
        novoTotal,
        novaParcelaRef,
        input.conta_id ?? existing.conta_id,
        input.categoria_id !== undefined ? input.categoria_id : existing.categoria_id,
        fromBoolean(input.ativo ?? existing.ativo),
        input.observacoes !== undefined ? input.observacoes : existing.observacoes,
        novaFaixa?.qtd ?? null,
        novaFaixa?.valor ?? null,
        nowIso(),
        id,
      ],
    );

    const fin = await getEmprestimo(id);
    if (!fin) throw new DatabaseError("Falha ao atualizar empréstimo");

    if (
      (input.valor_total !== undefined && input.valor_total !== existing.valor_total) ||
      (input.valor_parcela !== undefined && input.valor_parcela !== existing.valor_parcela) ||
      input.faixa_inicial_qtd !== undefined ||
      input.faixa_inicial_valor !== undefined
    ) {
      await recalcularParcelasPendentes(fin);
    }

    return calcularResumoEmprestimo(fin);
  });

  if (resumo.categoria_id != null) {
    const { getCategoria } = await import("./categorias");
    const { garantirOrcamentoCategoriaMes } = await import("./orcamentos");
    const cat = await getCategoria(resumo.categoria_id);
    if (cat) await garantirOrcamentoCategoriaMes(cat);
  }

  return resumo;
}

export async function deleteEmprestimo(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute("DELETE FROM emprestimos WHERE id = $1", [id]);
  });
}

export async function pagarParcelas(
  emprestimoId: number,
  input: PagarParcelasInput,
): Promise<EmprestimoParcela[]> {
  return withDatabase(async () => {
    const fin = await getEmprestimo(emprestimoId);
    if (!fin) throw new DatabaseError("Emprestimo não encontrado");
    if (input.pagamentos.length === 0) {
      throw new DatabaseError("Selecione ao menos uma parcela");
    }

    const dataPagamento = input.data_pagamento ?? todayIsoDate();
    const contaId = input.conta_id ?? fin.conta_id;
    const criarTransacao = input.criar_transacao !== false;
    const parcelasAtualizadas: EmprestimoParcela[] = [];
    const db = await getDatabase();

    for (const pag of input.pagamentos) {
      const dataPagamentoParcela = pag.data_pagamento ?? dataPagamento;
      const rows = await db.select<ParcelaRow[]>(
        "SELECT * FROM emprestimo_parcelas WHERE id = $1 AND emprestimo_id = $2",
        [pag.parcela_id, emprestimoId],
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
            observacoes: `${fin.modalidade === "parcelamento" ? "Parcelamento" : "Empréstimo"} #${fin.id}${desconto}`,
          })
        : null;

      await db.execute(
        `UPDATE emprestimo_parcelas
         SET valor_pago = $1, data_pagamento = $2, status = 'paga', transacao_id = $3
         WHERE id = $4`,
        [pag.valor_pago, dataPagamentoParcela, transacao?.id ?? null, pag.parcela_id],
      );

      const updated = await db.select<ParcelaRow[]>(
        "SELECT * FROM emprestimo_parcelas WHERE id = $1",
        [pag.parcela_id],
      );
      if (updated[0]) parcelasAtualizadas.push(mapParcela(updated[0]));
    }

    const finAtualizado = await getEmprestimo(emprestimoId);
    if (finAtualizado) {
      await recalcularParcelasPendentes(finAtualizado);
    }

    await db.execute("UPDATE emprestimos SET updated_at = $1 WHERE id = $2", [
      nowIso(),
      emprestimoId,
    ]);

    return parcelasAtualizadas;
  });
}

/** Usa valor previsto da parcela pendente/atrasada */
export async function getCompromissoEmprestimosMes(
  categoriaId: number,
  contexto: Contexto,
  mesReferencia: string,
): Promise<number> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const inicioMes = `${mesReferencia}-01`;
    const rows = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(fp.valor_previsto), 0) as total
       FROM emprestimo_parcelas fp
       JOIN emprestimos f ON f.id = fp.emprestimo_id
       WHERE f.ativo = 1
         AND f.categoria_id = $1
         AND f.contexto = $2
         AND fp.status IN ('pendente', 'atrasada')
         AND (
           fp.vencimento LIKE $3
           OR (fp.status = 'atrasada' AND fp.vencimento < $4)
         )`,
      [categoriaId, contexto, `${mesReferencia}%`, inicioMes],
    );
    return rows[0]?.total ?? 0;
  });
}

export async function sincronizarStatusParcelas(emprestimoId?: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const hoje = todayIsoDate();
    let query = `UPDATE emprestimo_parcelas
                 SET status = 'atrasada'
                 WHERE status = 'pendente' AND vencimento < $1`;
    const params: unknown[] = [hoje];
    if (emprestimoId) {
      query += " AND emprestimo_id = $2";
      params.push(emprestimoId);
    }
    await db.execute(query, params);
  });
}

/**
 * Antes gerava despesa sozinha no vencimento do parcelamento, inflando o caixa
 * antes do pagamento real. Mantido como no-op — pague pela tela de Dívidas.
 */
export async function sincronizarLancamentosParcelamentos(
  _contexto?: ContextoVisualizacao,
): Promise<number> {
  await sincronizarStatusParcelas();
  return 0;
}

export async function reverterParcelaEmprestimoPorTransacao(transacaoId: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ emprestimo_id: number }[]>(
      "SELECT emprestimo_id FROM emprestimo_parcelas WHERE transacao_id = $1",
      [transacaoId],
    );
    await db.execute(
      `UPDATE emprestimo_parcelas
       SET status = 'pendente', valor_pago = NULL, data_pagamento = NULL, transacao_id = NULL
       WHERE transacao_id = $1`,
      [transacaoId],
    );
    if (rows[0]) {
      const fin = await getEmprestimo(rows[0].emprestimo_id);
      if (fin) await recalcularParcelasPendentes(fin);
    }
  });
}

export function filtrarParcelasPorSelecao(
  parcelas: EmprestimoParcela[],
  selecao: "mes" | "ultima" | "mes_e_ultima" | "todas",
  mesReferencia?: string,
): EmprestimoParcela[] {
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
      const result: EmprestimoParcela[] = [];
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
  emprestimoId: number,
  pagamentos: PagamentoHistoricoPorNumero[],
  options?: { criar_transacao?: boolean; conta_id?: number },
): Promise<void> {
  if (pagamentos.length === 0) return;
  const parcelas = await listParcelas(emprestimoId);
  await pagarParcelas(emprestimoId, {
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
