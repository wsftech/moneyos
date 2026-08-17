import type { FaturaCartaoResumo, Transacao } from "../types";
import { labelMes } from "./format";

export interface TransacaoExibicao {
  /** ID usado em editar/excluir (lado saída quando agrupado) */
  id: number;
  transacao: Transacao;
  par?: Transacao;
  isTransferencia: boolean;
  contaOrigem: string | null;
  contaDestino: string | null;
  /** Linha sintética: total da fatura, sem as compras individuais */
  faturaResumo?: FaturaCartaoResumo;
}

export function isCompraNoCartao(t: Transacao, contasCartaoIds: Set<number>): boolean {
  if (t.pagamento_fatura_id != null) return false;
  if (t.fatura_cartao_id != null && t.tipo === "despesa") return true;
  return t.tipo === "despesa" && contasCartaoIds.has(t.conta_id);
}

export function isPagamentoFaturaCartao(t: Transacao): boolean {
  return t.pagamento_fatura_id != null;
}

export function faturaParaExibicao(
  fatura: FaturaCartaoResumo,
  contexto: Transacao["contexto"],
): TransacaoExibicao {
  const id = fatura.id != null ? -fatura.id : -(fatura.conta_id * 100000 + Number(fatura.mes_referencia.replace("-", "")));
  const transacao: Transacao = {
    id,
    descricao: `Fatura ${fatura.conta_nome} · ${labelMes(fatura.mes_competencia)}`,
    valor: fatura.total,
    data: fatura.vencimento,
    tipo: "despesa",
    conta_id: fatura.conta_id,
    categoria_id: null,
    contexto,
    status: "efetivado",
    anexo_path: null,
    observacoes: null,
    transacao_vinculada_id: null,
    transferencia_papel: null,
    fatura_cartao_id: fatura.id ?? null,
    pagamento_fatura_id: null,
    compra_parcelada_id: null,
    parcela_numero: null,
    parcela_total: null,
    created_at: "",
    updated_at: "",
  };
  return {
    id,
    transacao,
    isTransferencia: false,
    contaOrigem: fatura.conta_nome,
    contaDestino: null,
    faturaResumo: fatura,
  };
}

function isLadoSaida(t: Transacao): boolean {
  if (t.transferencia_papel === "saida") return true;
  if (t.transferencia_papel === "entrada") return false;
  if (t.tipo === "despesa") return true;
  if (t.tipo === "receita") return false;
  return true;
}

function ordenarParOrigemDestino(a: Transacao, b: Transacao): [Transacao, Transacao] {
  return isLadoSaida(a) ? [a, b] : [b, a];
}

function encontrarPar(t: Transacao, porId: Map<number, Transacao>): Transacao | undefined {
  if (t.transacao_vinculada_id) {
    return porId.get(t.transacao_vinculada_id);
  }
  for (const outra of porId.values()) {
    if (outra.transacao_vinculada_id === t.id && outra.id !== t.id) {
      return outra;
    }
  }
  return undefined;
}

function isParTransferencia(a: Transacao, b: Transacao): boolean {
  return a.transacao_vinculada_id === b.id || b.transacao_vinculada_id === a.id;
}

function extrairContaParObservacoes(obs: string | null): string | null {
  if (!obs) return null;
  const match =
    obs.match(/Transferência → (.+?)(?:\s\(|$)/) ?? obs.match(/Transferência ← (.+?)(?:\s\(|$)/);
  return match?.[1]?.trim() ?? null;
}

export function agruparTransacoesParaExibicao(
  transacoes: Transacao[],
  nomesContas: Map<number, string>,
  opts?: {
    contasCartaoIds?: Set<number>;
    ocultarPagamentosFatura?: boolean;
  },
): TransacaoExibicao[] {
  const cartoes = opts?.contasCartaoIds ?? new Set<number>();
  const ocultarPagamentos = opts?.ocultarPagamentosFatura ?? true;
  const porId = new Map(transacoes.map((t) => [t.id, t]));
  const processados = new Set<number>();
  const resultado: TransacaoExibicao[] = [];

  for (const t of transacoes) {
    if (processados.has(t.id)) continue;
    if (isCompraNoCartao(t, cartoes)) continue;
    if (ocultarPagamentos && isPagamentoFaturaCartao(t)) continue;

    const par = encontrarPar(t, porId);
    if (par && isParTransferencia(t, par)) {
      processados.add(t.id);
      processados.add(par.id);
      const [origem, destino] = ordenarParOrigemDestino(t, par);
      resultado.push({
        id: origem.id,
        transacao: origem,
        par: destino,
        isTransferencia: true,
        contaOrigem: nomesContas.get(origem.conta_id) ?? null,
        contaDestino: nomesContas.get(destino.conta_id) ?? null,
      });
      continue;
    }

    if (t.transacao_vinculada_id) {
      const parObs = extrairContaParObservacoes(t.observacoes);
      const contaAtual = nomesContas.get(t.conta_id) ?? null;
      const isSaida = isLadoSaida(t);
      resultado.push({
        id: t.id,
        transacao: t,
        isTransferencia: true,
        contaOrigem: isSaida ? contaAtual : parObs,
        contaDestino: isSaida ? parObs : contaAtual,
      });
      continue;
    }

    resultado.push({
      id: t.id,
      transacao: t,
      isTransferencia: t.tipo === "transferencia",
      contaOrigem: nomesContas.get(t.conta_id) ?? null,
      contaDestino: null,
    });
  }

  return resultado;
}

export function labelTipoTransacao(item: TransacaoExibicao): string {
  if (item.faturaResumo) return "Fatura";
  if (item.isTransferencia && item.contaDestino) return "Transferência";
  const t = item.transacao;
  if (t.tipo === "transferencia") return "Transferência";
  if (t.tipo === "receita") return "Receita";
  if (t.tipo === "despesa") return "Despesa";
  return t.tipo;
}
