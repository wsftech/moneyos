import { listCategorias } from "./categorias";
import { createTransacao, listTransacoes, type TransacaoInput } from "./transacoes";
import { resolverCategoriaPorDescricao } from "./regrasCategorizacao";
import type { Contexto, Transacao } from "../types";
import type { LancamentoOfx } from "../utils/ofxParser";
import { intervaloOfx } from "../utils/ofxParser";

export type StatusConciliacao = "conciliado" | "pendente_ofx" | "pendente_app";

export interface ItemConciliacao {
  chave: string;
  origem: "ofx" | "app";
  status: StatusConciliacao;
  data: string;
  valor: number;
  tipo: "receita" | "despesa";
  descricao: string;
  fitid?: string;
  transacao_id?: number;
  selecionado: boolean;
}

export interface ResultadoConciliacao {
  itens: ItemConciliacao[];
  resumo: {
    conciliados: number;
    pendentesOfx: number;
    pendentesApp: number;
  };
  periodo: { inicio: string; fim: string } | null;
}

export interface ResultadoImportacaoOfx {
  importados: number;
  ignorados: number;
  erros: string[];
}

const FITID_PREFIX = "FITID:";

export function observacaoFitid(fitid: string): string {
  return `${FITID_PREFIX}${fitid}`;
}

function extrairFitid(observacoes: string | null): string | null {
  if (!observacoes) return null;
  const match = observacoes.match(/FITID:([^\s·]+)/);
  return match ? match[1] : null;
}

function diffDias(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  return Math.round(Math.abs(da - db) / (1000 * 60 * 60 * 24));
}

function valoresIguais(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function expandirPeriodo(inicio: string, fim: string, dias = 2): { inicio: string; fim: string } {
  const dInicio = new Date(`${inicio}T12:00:00`);
  dInicio.setDate(dInicio.getDate() - dias);
  const dFim = new Date(`${fim}T12:00:00`);
  dFim.setDate(dFim.getDate() + dias);
  return {
    inicio: dInicio.toISOString().slice(0, 10),
    fim: dFim.toISOString().slice(0, 10),
  };
}

function transacaoConciliavel(t: Transacao): boolean {
  return t.status === "efetivado" && (t.tipo === "receita" || t.tipo === "despesa");
}

function scoreMatch(ofx: LancamentoOfx, t: Transacao): number {
  if (ofx.tipo !== t.tipo || !valoresIguais(ofx.valor, t.valor)) return -1;
  const dias = diffDias(ofx.data, t.data);
  if (dias > 2) return -1;
  let score = 100 - dias * 10;
  const fitidSalvo = extrairFitid(t.observacoes);
  if (fitidSalvo === ofx.fitid) score += 50;
  const descApp = t.descricao.toLowerCase();
  const descOfx = ofx.descricao.toLowerCase();
  if (descApp.includes(descOfx.slice(0, 8)) || descOfx.includes(descApp.slice(0, 8))) {
    score += 15;
  }
  return score;
}

export async function conciliarOfxComTransacoes(
  lancamentos: LancamentoOfx[],
  contaId: number,
): Promise<ResultadoConciliacao> {
  const periodoBase = intervaloOfx(lancamentos);
  if (!periodoBase) {
    return {
      itens: [],
      resumo: { conciliados: 0, pendentesOfx: 0, pendentesApp: 0 },
      periodo: null,
    };
  }

  const periodo = expandirPeriodo(periodoBase.inicio, periodoBase.fim);
  const transacoes = (await listTransacoes({
    contaId,
    dataInicio: periodo.inicio,
    dataFim: periodo.fim,
  })).filter(transacaoConciliavel);

  const fitidsImportados = new Set(
    transacoes.map((t) => extrairFitid(t.observacoes)).filter(Boolean) as string[],
  );

  const usados = new Set<number>();
  const pares: Array<{ ofx: LancamentoOfx; transacao: Transacao }> = [];

  for (const ofx of lancamentos) {
    if (fitidsImportados.has(ofx.fitid)) {
      const existente = transacoes.find((t) => extrairFitid(t.observacoes) === ofx.fitid);
      if (existente) {
        usados.add(existente.id);
        pares.push({ ofx, transacao: existente });
      }
      continue;
    }

    let melhor: { t: Transacao; score: number } | null = null;
    for (const t of transacoes) {
      if (usados.has(t.id)) continue;
      const score = scoreMatch(ofx, t);
      if (score < 0) continue;
      if (!melhor || score > melhor.score) {
        melhor = { t, score };
      }
    }
    if (melhor) {
      usados.add(melhor.t.id);
      pares.push({ ofx, transacao: melhor.t });
    }
  }

  const itens: ItemConciliacao[] = [];

  for (const { ofx, transacao } of pares) {
    itens.push({
      chave: `conc-${ofx.fitid}`,
      origem: "ofx",
      status: "conciliado",
      data: ofx.data,
      valor: ofx.valor,
      tipo: ofx.tipo,
      descricao: ofx.descricao,
      fitid: ofx.fitid,
      transacao_id: transacao.id,
      selecionado: false,
    });
  }

  for (const ofx of lancamentos) {
    if (pares.some((p) => p.ofx.fitid === ofx.fitid)) continue;
    if (fitidsImportados.has(ofx.fitid)) continue;
    itens.push({
      chave: `ofx-${ofx.fitid}`,
      origem: "ofx",
      status: "pendente_ofx",
      data: ofx.data,
      valor: ofx.valor,
      tipo: ofx.tipo,
      descricao: ofx.descricao,
      fitid: ofx.fitid,
      selecionado: true,
    });
  }

  for (const t of transacoes) {
    if (usados.has(t.id)) continue;
    itens.push({
      chave: `app-${t.id}`,
      origem: "app",
      status: "pendente_app",
      data: t.data,
      valor: t.valor,
      tipo: t.tipo as "receita" | "despesa",
      descricao: t.descricao,
      transacao_id: t.id,
      selecionado: false,
    });
  }

  itens.sort(
    (a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao),
  );

  const conciliados = itens.filter((i) => i.status === "conciliado").length;
  const pendentesOfx = itens.filter((i) => i.status === "pendente_ofx").length;
  const pendentesApp = itens.filter((i) => i.status === "pendente_app").length;

  return {
    itens,
    resumo: { conciliados, pendentesOfx, pendentesApp },
    periodo: periodoBase,
  };
}

export async function importarLancamentosOfx(
  lancamentos: LancamentoOfx[],
  contaId: number,
  contextoConta: Contexto,
): Promise<ResultadoImportacaoOfx> {
  const categorias = await listCategorias("consolidado");
  let importados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  for (const [i, linha] of lancamentos.entries()) {
    try {
      let categoriaId = await resolverCategoriaPorDescricao(
        linha.descricao,
        contextoConta,
        linha.tipo,
      );
      if (!categoriaId && linha.tipo) {
        const cat = categorias.find((c) => c.tipo === linha.tipo && c.contexto === contextoConta);
        categoriaId = cat?.id ?? null;
      }

      const input: TransacaoInput = {
        descricao: linha.descricao,
        valor: linha.valor,
        data: linha.data,
        tipo: linha.tipo,
        conta_id: contaId,
        categoria_id: categoriaId,
        contexto: contextoConta,
        status: "efetivado",
        observacoes: observacaoFitid(linha.fitid),
      };
      await createTransacao(input);
      importados++;
    } catch (err) {
      ignorados++;
      erros.push(`Item ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { importados, ignorados, erros };
}
