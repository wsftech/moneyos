import { getConta, getSaldoConta, listContas } from "./contas";
import { getDatabase } from "./connection";
import { createTransferencia } from "./transacoes";
import { isUniqueConstraintError, nowIso, withDatabase } from "./utils";
import type {
  Contexto,
  ContextoVisualizacao,
  FaturaCartaoResumo,
  ResumoCartaoCredito,
  StatusFaturaCartao,
} from "../types";
import {
  dataCicloParcelaCartao,
  mesCompetenciaFatura,
  mesFechamentoAtual,
  mesFechamentoParaData,
  periodoFaturaCartao,
  statusFaturaPersistido,
  statusFaturaPorPeriodo,
} from "../utils/faturaCartao";
import { todayIsoDate } from "../utils/dates";
import { arredondarMoeda, labelMes } from "../utils/format";

interface FaturaRow {
  id: number;
  conta_id: number;
  mes_referencia: string;
  periodo_inicio: string;
  periodo_fim: string;
  vencimento: string;
  total: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: StatusFaturaCartao;
  transacao_pagamento_id: number | null;
}


async function recalcularTotalFatura(db: Awaited<ReturnType<typeof getDatabase>>, faturaId: number) {
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(valor), 0) AS total
     FROM transacoes
     WHERE fatura_cartao_id = $1 AND status = 'efetivado' AND tipo = 'despesa'`,
    [faturaId],
  );
  const total = rows[0]?.total ?? 0;
  await db.execute(
    `UPDATE faturas_cartao SET total = $1, updated_at = $2 WHERE id = $3`,
    [total, nowIso(), faturaId],
  );
  return total;
}

async function ensureFaturaRecord(
  contaId: number,
  mesReferencia: string,
): Promise<FaturaRow | null> {
  const conta = await getConta(contaId);
  if (!conta?.dia_fechamento || !conta.dia_vencimento) return null;

  const { inicio, fim, vencimento } = periodoFaturaCartao(
    mesReferencia,
    conta.dia_fechamento,
    conta.dia_vencimento,
  );

  return withDatabase(async () => {
    const db = await getDatabase();
    const existing = await db.select<FaturaRow[]>(
      "SELECT * FROM faturas_cartao WHERE conta_id = $1 AND mes_referencia = $2",
      [contaId, mesReferencia],
    );

    let row = existing[0] ?? null;
    if (!row) {
      const ts = nowIso();
      try {
        const result = await db.execute(
          `INSERT INTO faturas_cartao
           (conta_id, mes_referencia, periodo_inicio, periodo_fim, vencimento, total, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 0, 'aberta', $6, $6)`,
          [contaId, mesReferencia, inicio, fim, vencimento, ts],
        );
        const rows = await db.select<FaturaRow[]>("SELECT * FROM faturas_cartao WHERE id = $1", [
          result.lastInsertId,
        ]);
        row = rows[0] ?? null;
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err;
        const again = await db.select<FaturaRow[]>(
          "SELECT * FROM faturas_cartao WHERE conta_id = $1 AND mes_referencia = $2",
          [contaId, mesReferencia],
        );
        row = again[0] ?? null;
      }
    }
    if (!row) return null;

    if (
      row.periodo_inicio !== inicio ||
      row.periodo_fim !== fim ||
      row.vencimento !== vencimento
    ) {
      await db.execute(
        `UPDATE faturas_cartao
         SET periodo_inicio = $1, periodo_fim = $2, vencimento = $3, updated_at = $4
         WHERE id = $5`,
        [inicio, fim, vencimento, nowIso(), row.id],
      );
      return { ...row, periodo_inicio: inicio, periodo_fim: fim, vencimento };
    }
    return row;
  });
}

export async function sincronizarFaturaCartao(
  contaId: number,
  mesReferencia: string,
): Promise<FaturaCartaoResumo | null> {
  const fatura = await ensureFaturaRecord(contaId, mesReferencia);
  if (!fatura) return null;

  return withDatabase(async () => {
    const db = await getDatabase();

    await db.execute(
      `UPDATE transacoes
       SET fatura_cartao_id = $1
       WHERE conta_id = $2
         AND tipo = 'despesa'
         AND status = 'efetivado'
         AND fatura_cartao_id IS NULL
         AND pagamento_fatura_id IS NULL
         AND compra_parcelada_id IS NULL
         AND data >= $3
         AND data < $4`,
      [fatura.id, contaId, fatura.periodo_inicio, fatura.periodo_fim],
    );

    const total = await recalcularTotalFatura(db, fatura.id);
    const hoje = todayIsoDate();
    const status = statusFaturaPersistido({ ...fatura, total }, hoje);

    await db.execute(
      `UPDATE faturas_cartao SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, nowIso(), fatura.id],
    );

    return buildFaturaResumo(fatura.id);
  });
}

const syncPorConta = new Map<number, Promise<void>>();

async function religarComprasAoCicloFatura(contaId: number): Promise<void> {
  const conta = await getConta(contaId);
  if (!conta?.dia_fechamento) return;
  const diaFechamento = conta.dia_fechamento;

  const db = await getDatabase();
  const compras = await db.select<
    {
      id: number;
      data: string;
      parcela_numero: number | null;
      fatura_cartao_id: number | null;
      fatura_mes: string | null;
    }[]
  >(
    `SELECT t.id, t.data, t.parcela_numero, t.fatura_cartao_id,
            f.mes_referencia AS fatura_mes
     FROM transacoes t
     LEFT JOIN faturas_cartao f ON f.id = t.fatura_cartao_id
     WHERE t.conta_id = $1
       AND t.tipo = 'despesa'
       AND t.status = 'efetivado'
       AND t.pagamento_fatura_id IS NULL`,
    [contaId],
  );

  const faturasAntigas = new Set<number>();
  for (const compra of compras) {
    const dataCiclo = dataCicloParcelaCartao(compra.data, compra.parcela_numero);
    const mesEsperado = mesFechamentoParaData(dataCiclo, diaFechamento);
    if (compra.fatura_mes === mesEsperado) continue;
    if (compra.fatura_cartao_id) faturasAntigas.add(compra.fatura_cartao_id);
    await vincularCompraAFatura(compra.id, contaId, compra.data);
  }
  for (const faturaId of faturasAntigas) {
    await recalcularFaturaPorId(faturaId);
  }
}

async function atualizarPeriodosFaturasConta(contaId: number): Promise<void> {
  const db = await getDatabase();
  const meses = await db.select<{ mes_referencia: string }[]>(
    "SELECT mes_referencia FROM faturas_cartao WHERE conta_id = $1",
    [contaId],
  );
  for (const row of meses) {
    await ensureFaturaRecord(contaId, row.mes_referencia);
  }
}

export async function sincronizarFaturasCartaoConta(contaId: number): Promise<void> {
  const emAndamento = syncPorConta.get(contaId);
  if (emAndamento) {
    await emAndamento;
    return;
  }

  const run = (async () => {
    const conta = await getConta(contaId);
    if (!conta?.dia_fechamento) return;

    const { alinharDatasCompraParceladaConta } = await import("./transacoes");
    await alinharDatasCompraParceladaConta(contaId);
    await atualizarPeriodosFaturasConta(contaId);
    await religarComprasAoCicloFatura(contaId);

    const mesAtualRef = mesFechamentoAtual(conta.dia_fechamento);
    const [y, m] = mesAtualRef.split("-").map(Number);

    // Só o ciclo atual e os 2 anteriores. Faturas futuras nascem ao lançar a compra.
    const meses: string[] = [];
    for (let i = -2; i <= 0; i++) {
      const d = new Date(y, m - 1 + i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    for (const mes of meses) {
      await sincronizarFaturaCartao(contaId, mes);
    }
    await limparFaturasVaziasConta(contaId, mesAtualRef);
  })().finally(() => {
    if (syncPorConta.get(contaId) === run) syncPorConta.delete(contaId);
  });

  syncPorConta.set(contaId, run);
  await run;
}

/** Remove faturas sem compras e sem pagamento, exceto o ciclo aberto atual. */
export async function limparFaturasVaziasConta(
  contaId: number,
  mesAtualRef?: string,
): Promise<void> {
  const conta = await getConta(contaId);
  if (!conta?.dia_fechamento) return;
  const atual = mesAtualRef ?? mesFechamentoAtual(conta.dia_fechamento);

  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(
      `DELETE FROM faturas_cartao
       WHERE conta_id = $1
         AND mes_referencia != $2
         AND (valor_pago IS NULL OR valor_pago = 0)
         AND transacao_pagamento_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM transacoes t WHERE t.fatura_cartao_id = faturas_cartao.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM transacoes t WHERE t.pagamento_fatura_id = faturas_cartao.id
         )`,
      [contaId, atual],
    );
  });
}

async function buildFaturaResumo(faturaId: number): Promise<FaturaCartaoResumo | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<FaturaRow[]>("SELECT * FROM faturas_cartao WHERE id = $1", [
      faturaId,
    ]);
    const fatura = rows[0];
    if (!fatura) return null;

    const conta = await getConta(fatura.conta_id);
    const itens = await db.select<
      {
        id: number;
        data: string;
        descricao: string;
        valor: number;
        categoria_id: number | null;
        categoria_nome: string | null;
        parcela_numero: number | null;
        parcela_total: number | null;
        compra_parcelada_id: string | null;
      }[]
    >(
      `SELECT t.id, t.data, t.descricao, t.valor, t.categoria_id, c.nome AS categoria_nome,
              t.parcela_numero, t.parcela_total, t.compra_parcelada_id
       FROM transacoes t
       LEFT JOIN categorias c ON c.id = t.categoria_id
       WHERE t.fatura_cartao_id = $1 AND t.tipo = 'despesa'
       ORDER BY t.data ASC, t.parcela_numero ASC, t.id ASC`,
      [faturaId],
    );

    const hoje = todayIsoDate();
    const status = statusFaturaPorPeriodo(fatura, hoje);

    return {
      id: fatura.id,
      conta_id: fatura.conta_id,
      conta_nome: conta?.nome ?? "",
      mes_referencia: fatura.mes_referencia,
      mes_competencia: mesCompetenciaFatura(fatura.periodo_inicio, fatura.periodo_fim),
      periodo_inicio: fatura.periodo_inicio,
      periodo_fim: fatura.periodo_fim,
      vencimento: fatura.vencimento,
      total: fatura.total,
      valor_pago: fatura.valor_pago,
      data_pagamento: fatura.data_pagamento,
      status,
      itens,
    };
  });
}

export async function getFaturaCartao(
  contaId: number,
  mesReferencia?: string,
): Promise<FaturaCartaoResumo | null> {
  const conta = await getConta(contaId);
  if (!conta || conta.tipo !== "cartao_credito") return null;
  if (!conta.dia_fechamento || !conta.dia_vencimento) return null;

  const mesAtualRef = mesFechamentoAtual(conta.dia_fechamento);
  const mes = mesReferencia ?? mesAtualRef;

  if (mes <= mesAtualRef) {
    await sincronizarFaturaCartao(contaId, mes);
  }

  const db = await getDatabase();
  const rows = await db.select<FaturaRow[]>(
    "SELECT id FROM faturas_cartao WHERE conta_id = $1 AND mes_referencia = $2",
    [contaId, mes],
  );
  if (!rows[0]) return null;
  return buildFaturaResumo(rows[0].id);
}

export async function listFaturasCartao(
  contaId: number,
  limite?: number,
  opts?: { sincronizar?: boolean; ordem?: "asc" | "desc"; ateMes?: string },
): Promise<FaturaCartaoResumo[]> {
  if (opts?.sincronizar !== false) {
    await sincronizarFaturasCartaoConta(contaId);
  }
  const conta = await getConta(contaId);
  const mesAtual = conta?.dia_fechamento
    ? mesFechamentoAtual(conta.dia_fechamento)
    : "";

  return withDatabase(async () => {
    const db = await getDatabase();
    const ordem = opts?.ordem === "desc" ? "DESC" : "ASC";
    const params: unknown[] = [contaId, mesAtual];
    let sql = `SELECT id FROM faturas_cartao
       WHERE conta_id = $1
         AND (
           mes_referencia = $2
           OR (valor_pago IS NOT NULL AND valor_pago > 0)
           OR transacao_pagamento_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM transacoes t WHERE t.fatura_cartao_id = faturas_cartao.id
           )
         )`;
    if (opts?.ateMes) {
      params.push(opts.ateMes);
      sql += ` AND mes_referencia <= $${params.length}`;
    }
    sql += ` ORDER BY mes_referencia ${ordem}`;
    if (limite != null && limite > 0) {
      params.push(limite);
      sql += ` LIMIT $${params.length}`;
    }
    const rows = await db.select<{ id: number }[]>(sql, params);
    const faturas = await Promise.all(rows.map((r) => buildFaturaResumo(r.id)));
    return faturas.filter((f): f is FaturaCartaoResumo => f != null);
  });
}

export async function listFaturasCartaoContexto(
  contexto?: ContextoVisualizacao,
): Promise<FaturaCartaoResumo[]> {
  const contas = await listContas(contexto);
  const cartoes = contas.filter(
    (c) => c.tipo === "cartao_credito" && c.dia_fechamento && c.dia_vencimento,
  );
  const faturas: FaturaCartaoResumo[] = [];
  for (const c of cartoes) {
    const f = await getFaturaCartao(c.id);
    if (f && f.status !== "paga" && f.total > 0) faturas.push(f);
  }
  return faturas;
}

function faturaEntraNoPeriodo(
  f: FaturaCartaoResumo,
  dataInicio: string,
  dataFim: string,
): boolean {
  if (f.vencimento >= dataInicio && f.vencimento <= dataFim) return true;
  if (f.periodo_fim >= dataInicio && f.periodo_fim <= dataFim) return true;
  return (
    (f.status === "aberta" || f.status === "futura") &&
    f.periodo_inicio <= dataFim &&
    f.periodo_fim >= dataInicio
  );
}

/** Faturas com valor para a aba Lançamentos (uma linha por fatura, sem as compras). */
export async function listFaturasParaLancamentos(
  dataInicio: string,
  dataFim: string,
  contexto?: ContextoVisualizacao,
): Promise<{ fatura: FaturaCartaoResumo; contexto: Contexto }[]> {
  const contas = await listContas(contexto);
  const cartoes = contas.filter(
    (c) => c.tipo === "cartao_credito" && c.dia_fechamento && c.dia_vencimento,
  );
  const resultado: { fatura: FaturaCartaoResumo; contexto: Contexto }[] = [];
  for (const c of cartoes) {
    await sincronizarFaturasCartaoConta(c.id);
    const lista = await listFaturasCartao(c.id, undefined, { sincronizar: false });
    for (const f of lista) {
      if (f.total <= 0) continue;
      if (!faturaEntraNoPeriodo(f, dataInicio, dataFim)) continue;
      resultado.push({ fatura: f, contexto: c.contexto });
    }
  }
  return resultado;
}

/** Faturas não pagas (para fluxo de caixa projetado). */
export async function listFaturasPendentesContexto(
  contexto?: ContextoVisualizacao,
): Promise<FaturaCartaoResumo[]> {
  const contas = await listContas(contexto);
  const cartoes = contas.filter(
    (c) => c.tipo === "cartao_credito" && c.dia_fechamento && c.dia_vencimento,
  );
  const faturas: FaturaCartaoResumo[] = [];
  for (const c of cartoes) {
    await sincronizarFaturasCartaoConta(c.id);
    const lista = await listFaturasCartao(c.id, undefined, { sincronizar: false });
    for (const f of lista) {
      const pendente = f.total - (f.valor_pago ?? 0);
      if (f.status !== "paga" && pendente > 0) faturas.push(f);
    }
  }
  return faturas;
}

export async function vincularCompraAFatura(
  transacaoId: number,
  contaId: number,
  dataCompra?: string,
): Promise<void> {
  const conta = await getConta(contaId);
  if (!conta?.dia_fechamento || conta.tipo !== "cartao_credito") return;

  const { getTransacao } = await import("./transacoes");
  const transacao = await getTransacao(transacaoId);
  const compra = dataCompra ?? transacao?.data;
  if (!compra) return;
  const dataCiclo = dataCicloParcelaCartao(compra, transacao?.parcela_numero);

  const mesRef = mesFechamentoParaData(dataCiclo, conta.dia_fechamento);
  await sincronizarFaturaCartao(contaId, mesRef);

  const db = await getDatabase();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM faturas_cartao WHERE conta_id = $1 AND mes_referencia = $2",
    [contaId, mesRef],
  );
  if (!rows[0]) return;

  await db.execute("UPDATE transacoes SET fatura_cartao_id = $1 WHERE id = $2", [
    rows[0].id,
    transacaoId,
  ]);
  await recalcularTotalFatura(db, rows[0].id);
}

export async function recalcularFaturaPorId(faturaId: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await recalcularTotalFatura(db, faturaId);
  });
}

export interface PagarFaturaInput {
  faturaId: number;
  contaOrigemId: number;
  data: string;
  valor?: number;
}

export async function pagarFaturaCartao(input: PagarFaturaInput): Promise<FaturaCartaoResumo> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<FaturaRow[]>("SELECT * FROM faturas_cartao WHERE id = $1", [
      input.faturaId,
    ]);
    const fatura = rows[0];
    if (!fatura) throw new Error("Fatura não encontrada");
    if (fatura.status === "paga") throw new Error("Fatura já está paga.");

    const cartao = await getConta(fatura.conta_id);
    const origem = await getConta(input.contaOrigemId);
    if (!cartao || cartao.tipo !== "cartao_credito") throw new Error("Conta de cartão inválida.");
    if (!origem || origem.tipo === "cartao_credito") {
      throw new Error("Selecione uma conta bancária para pagar a fatura.");
    }
    if (origem.contexto !== cartao.contexto) {
      throw new Error("Conta de origem deve ser do mesmo contexto do cartão.");
    }

    const valorPagar = arredondarMoeda(
      input.valor ?? fatura.total - (fatura.valor_pago ?? 0),
    );
    if (valorPagar <= 0) throw new Error("Não há valor pendente nesta fatura.");

    const { saida, entrada } = await createTransferencia({
      descricao: `Pagamento fatura ${cartao.nome} · ${labelMes(mesCompetenciaFatura(fatura.periodo_inicio, fatura.periodo_fim))}`,
      valor: valorPagar,
      data: input.data,
      conta_origem_id: input.contaOrigemId,
      conta_destino_id: fatura.conta_id,
      observacoes: "Pagamento de fatura de cartão",
    });

    await db.execute(
      `UPDATE transacoes SET pagamento_fatura_id = $1 WHERE id = $2 OR id = $3`,
      [fatura.id, saida.id, entrada.id],
    );

    const novoPago = arredondarMoeda((fatura.valor_pago ?? 0) + valorPagar);
    const paga = novoPago >= fatura.total;
    const status: StatusFaturaCartao = paga ? "paga" : "fechada";

    await db.execute(
      `UPDATE faturas_cartao
       SET valor_pago = $1, data_pagamento = $2, status = $3,
           transacao_pagamento_id = $4, updated_at = $5
       WHERE id = $6`,
      [novoPago, input.data, status, entrada.id, nowIso(), fatura.id],
    );

    const resumo = await buildFaturaResumo(fatura.id);
    if (!resumo) throw new Error("Falha ao atualizar fatura");
    return resumo;
  });
}

export async function getResumoCartaoCredito(contaId: number): Promise<ResumoCartaoCredito | null> {
  const conta = await getConta(contaId);
  if (!conta || conta.tipo !== "cartao_credito") return null;

  await sincronizarFaturasCartaoConta(contaId);

  const [saldo, faturaAtual] = await Promise.all([
    getSaldoConta(contaId),
    conta.dia_fechamento && conta.dia_vencimento
      ? getFaturaCartao(contaId)
      : Promise.resolve(null),
  ]);

  const totalEmAberto = arredondarMoeda(Math.max(0, -saldo));
  const limite = conta.limite_credito;
  const limiteDisponivel =
    limite != null && limite > 0 ? arredondarMoeda(Math.max(0, limite - totalEmAberto)) : null;

  return {
    conta_id: conta.id,
    conta_nome: conta.nome,
    limite_credito: limite,
    total_em_aberto: totalEmAberto,
    limite_disponivel: limiteDisponivel,
    fatura_atual: faturaAtual,
    saldo_conta: saldo,
  };
}
