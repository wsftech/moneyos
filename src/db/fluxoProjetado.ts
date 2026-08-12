import { getDatabase } from "./connection";
import { getSaldoContextoAtual } from "./contas";
import { listFaturasPendentesContexto } from "./faturasCartao";
import {
  sincronizarStatusContasPagarReceber,
} from "./contasPagarReceber";
import { sincronizarStatusParcelas as sincronizarFinanciamentos } from "./financiamentos";
import { sincronizarStatusParcelas as sincronizarEmprestimos } from "./emprestimos";
import { listTransacoesRecorrentes } from "./transacoesRecorrentes";
import {
  applyContextoFilter,
  buildContextoFilter,
  withDatabase,
} from "./utils";
import type { ContextoVisualizacao, FluxoProjetado12Meses, FluxoProjetadoResumo } from "../types";
import { intervaloDoMes } from "../utils/dates";
import { arredondarMoeda, labelMes } from "../utils/format";

interface EventoFluxo {
  data: string;
  entrada: number;
  saida: number;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function dataRecorrenteNoMes(mesReferencia: string, diaMes: number): string {
  const { fim } = intervaloDoMes(mesReferencia);
  const ultimoDia = Number(fim.slice(8, 10));
  const dia = Math.min(diaMes, ultimoDia);
  return `${mesReferencia}-${String(dia).padStart(2, "0")}`;
}

function mesesNoHorizonte(inicio: string, dias: number): string[] {
  const fim = addDays(inicio, dias);
  const meses: string[] = [];
  let cursor = inicio.slice(0, 7);
  const fimMes = fim.slice(0, 7);
  while (cursor <= fimMes) {
    meses.push(cursor);
    const [y, m] = cursor.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    cursor = next;
  }
  return meses;
}

async function coletarVencimentosPendentes(
  contexto: ContextoVisualizacao | undefined,
  hoje: string,
  limiteData: string,
): Promise<EventoFluxo[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filterConta = buildContextoFilter(contexto);
    const filterContrato = buildContextoFilter(contexto, "f.contexto");

    const { query: qContas, params: pContas } = applyContextoFilter(
      `SELECT vencimento, valor, tipo
       FROM contas_a_pagar_receber
       WHERE status IN ('pendente', 'atrasado')
         AND vencimento >= $1 AND vencimento <= $2${filterConta.clause}`,
      filterConta,
      3,
    );

    const { query: qFin, params: pFin } = applyContextoFilter(
      `SELECT fp.vencimento, fp.valor_previsto AS valor
       FROM financiamento_parcelas fp
       JOIN financiamentos f ON f.id = fp.financiamento_id
       WHERE f.ativo = 1 AND fp.status IN ('pendente', 'atrasada')
         AND fp.vencimento >= $1 AND fp.vencimento <= $2${filterContrato.clause}`,
      filterContrato,
      3,
    );

    const { query: qEmp, params: pEmp } = applyContextoFilter(
      `SELECT fp.vencimento, fp.valor_previsto AS valor
       FROM emprestimo_parcelas fp
       JOIN emprestimos f ON f.id = fp.emprestimo_id
       WHERE f.ativo = 1 AND fp.status IN ('pendente', 'atrasada')
         AND fp.vencimento >= $1 AND fp.vencimento <= $2${filterContrato.clause}`,
      filterContrato,
      3,
    );

    const baseParams = [hoje, limiteData];
    const [contas, fin, emp] = await Promise.all([
      db.select<{ vencimento: string; valor: number; tipo: "pagar" | "receber" }[]>(
        qContas,
        [...baseParams, ...pContas],
      ),
      db.select<{ vencimento: string; valor: number }[]>(qFin, [...baseParams, ...pFin]),
      db.select<{ vencimento: string; valor: number }[]>(qEmp, [...baseParams, ...pEmp]),
    ]);

    const eventos: EventoFluxo[] = [];
    for (const c of contas) {
      eventos.push({
        data: c.vencimento,
        entrada: c.tipo === "receber" ? c.valor : 0,
        saida: c.tipo === "pagar" ? c.valor : 0,
      });
    }
    for (const p of [...fin, ...emp]) {
      eventos.push({ data: p.vencimento, entrada: 0, saida: p.valor });
    }
    return eventos;
  });
}

function projetarRecorrentes(
  hoje: string,
  limiteData: string,
  recorrentes: Awaited<ReturnType<typeof listTransacoesRecorrentes>>,
): EventoFluxo[] {
  const eventos: EventoFluxo[] = [];
  const meses = mesesNoHorizonte(hoje, 90);

  for (const rec of recorrentes.filter((r) => r.ativo)) {
    const mesCriacao = rec.created_at.slice(0, 7);
    for (const mes of meses) {
      if (mes < mesCriacao) continue;
      const data = dataRecorrenteNoMes(mes, rec.dia_mes);
      if (data < hoje || data > limiteData) continue;
      eventos.push({
        data,
        entrada: rec.tipo === "receita" ? rec.valor : 0,
        saida: rec.tipo === "despesa" ? rec.valor : 0,
      });
    }
  }
  return eventos;
}

function projetarFaturasCartao(
  hoje: string,
  limiteData: string,
  faturas: Awaited<ReturnType<typeof listFaturasPendentesContexto>>,
): EventoFluxo[] {
  const eventos: EventoFluxo[] = [];
  for (const f of faturas) {
    const pendente = f.total - (f.valor_pago ?? 0);
    if (f.vencimento >= hoje && f.vencimento <= limiteData && pendente > 0) {
      eventos.push({ data: f.vencimento, entrada: 0, saida: pendente });
    }
  }
  return eventos;
}

export async function getFluxoProjetado(
  contexto?: ContextoVisualizacao,
  diasHorizonte = 90,
): Promise<FluxoProjetadoResumo> {
  await Promise.all([
    sincronizarFinanciamentos(),
    sincronizarEmprestimos(),
    sincronizarStatusContasPagarReceber(),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);
  const limiteData = addDays(hoje, diasHorizonte);

  const [saldoAtual, vencimentos, recorrentes, faturas] = await Promise.all([
    getSaldoContextoAtual(contexto),
    coletarVencimentosPendentes(contexto, hoje, limiteData),
    listTransacoesRecorrentes(contexto),
    listFaturasPendentesContexto(contexto),
  ]);

  const todosEventos = [
    ...vencimentos,
    ...projetarRecorrentes(hoje, limiteData, recorrentes),
    ...projetarFaturasCartao(hoje, limiteData, faturas),
  ];

  const porDia = new Map<string, { entradas: number; saidas: number }>();
  for (const ev of todosEventos) {
    const atual = porDia.get(ev.data) ?? { entradas: 0, saidas: 0 };
    atual.entradas += ev.entrada;
    atual.saidas += ev.saida;
    porDia.set(ev.data, atual);
  }

  const dias: FluxoProjetadoResumo["dias"] = [];
  let saldo = saldoAtual;
  let saldo30 = saldoAtual;
  let saldo60 = saldoAtual;
  let saldo90 = saldoAtual;

  for (let i = 0; i <= diasHorizonte; i++) {
    const data = addDays(hoje, i);
    const mov = porDia.get(data) ?? { entradas: 0, saidas: 0 };
    saldo = arredondarMoeda(saldo + mov.entradas - mov.saidas);
    dias.push({ data, entradas: mov.entradas, saidas: mov.saidas, saldo });
    if (i === 30) saldo30 = saldo;
    if (i === 60) saldo60 = saldo;
    if (i === 90) saldo90 = saldo;
  }

  return {
    saldo_atual: saldoAtual,
    saldo_30: saldo30,
    saldo_60: saldo60,
    saldo_90: saldo90,
    dias,
  };
}

function proximosMeses(inicioMes: string, quantidade: number): string[] {
  const meses: string[] = [];
  let cursor = inicioMes;
  for (let i = 0; i < quantidade; i++) {
    meses.push(cursor);
    const [y, m] = cursor.split("-").map(Number);
    cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return meses;
}

function agregarFluxoPorMes(
  dias: FluxoProjetadoResumo["dias"],
  mesesAlvo: string[],
): FluxoProjetado12Meses["meses"] {
  const porMes = new Map<string, { entradas: number; saidas: number; saldo_final: number }>();

  for (const d of dias) {
    const mes = d.data.slice(0, 7);
    const atual = porMes.get(mes) ?? { entradas: 0, saidas: 0, saldo_final: d.saldo };
    atual.entradas = arredondarMoeda(atual.entradas + d.entradas);
    atual.saidas = arredondarMoeda(atual.saidas + d.saidas);
    atual.saldo_final = d.saldo;
    porMes.set(mes, atual);
  }

  let saldoAnterior = dias[0]?.saldo ?? 0;
  return mesesAlvo.map((mes) => {
    const dados = porMes.get(mes);
    if (dados) {
      saldoAnterior = dados.saldo_final;
      return {
        mes,
        mesLabel: labelMes(mes).split(" de ")[0].slice(0, 3),
        entradas: dados.entradas,
        saidas: dados.saidas,
        saldo_final: dados.saldo_final,
      };
    }
    return {
      mes,
      mesLabel: labelMes(mes).split(" de ")[0].slice(0, 3),
      entradas: 0,
      saidas: 0,
      saldo_final: saldoAnterior,
    };
  });
}

export async function getFluxoProjetado12Meses(
  contexto?: ContextoVisualizacao,
): Promise<FluxoProjetado12Meses> {
  const hoje = new Date().toISOString().slice(0, 10);
  const mesInicio = hoje.slice(0, 7);
  const mesesAlvo = proximosMeses(mesInicio, 12);
  const ultimoMes = mesesAlvo[mesesAlvo.length - 1];
  const { fim } = intervaloDoMes(ultimoMes);
  const hojeMs = new Date(`${hoje}T12:00:00`).getTime();
  const fimMs = new Date(`${fim}T12:00:00`).getTime();
  const diasHorizonte = Math.max(0, Math.ceil((fimMs - hojeMs) / (1000 * 60 * 60 * 24)));

  const fluxo = await getFluxoProjetado(contexto, diasHorizonte);
  const meses = agregarFluxoPorMes(fluxo.dias, mesesAlvo);

  let saldo_minimo = fluxo.saldo_atual;
  let mes_saldo_minimo: string | null = mesInicio;
  for (const m of meses) {
    if (m.saldo_final < saldo_minimo) {
      saldo_minimo = m.saldo_final;
      mes_saldo_minimo = m.mes;
    }
  }

  return {
    saldo_atual: fluxo.saldo_atual,
    meses,
    saldo_minimo,
    mes_saldo_minimo,
    saldo_final_12m: meses[meses.length - 1]?.saldo_final ?? fluxo.saldo_atual,
  };
}
