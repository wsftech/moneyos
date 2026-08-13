import type { Contexto, ContextoVisualizacao, EscopoFinanceiro } from "../types";

export const CONFIG_KEY_ESCOPO_FINANCEIRO = "escopo_financeiro";
export const DEFAULT_ESCOPO_FINANCEIRO: EscopoFinanceiro = "ambos";

export function parseEscopoFinanceiro(valor: string | null | undefined): EscopoFinanceiro {
  if (valor === "pessoal" || valor === "empresa" || valor === "ambos") return valor;
  return DEFAULT_ESCOPO_FINANCEIRO;
}

export function visualizacoesParaEscopo(escopo: EscopoFinanceiro): ContextoVisualizacao[] {
  if (escopo === "pessoal") return ["pessoal"];
  if (escopo === "empresa") return ["empresa"];
  return ["pessoal", "empresa", "consolidado"];
}

export function contextosParaEscopo(escopo: EscopoFinanceiro): Contexto[] {
  if (escopo === "pessoal") return ["pessoal"];
  if (escopo === "empresa") return ["empresa"];
  return ["pessoal", "empresa"];
}

export function clampContextoVisualizacao(
  contexto: ContextoVisualizacao,
  escopo: EscopoFinanceiro,
): ContextoVisualizacao {
  const permitidos = visualizacoesParaEscopo(escopo);
  if (permitidos.includes(contexto)) return contexto;
  return permitidos[0];
}
