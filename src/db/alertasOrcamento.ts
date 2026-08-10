import { findCategoriaById, listCategorias } from "./categorias";
import { getOrcamentosComProgresso } from "./orcamentos";
import type { AlertaOrcamento, ContextoVisualizacao } from "../types";
import { mesAtual } from "../utils/format";

export async function getAlertasOrcamento(
  contexto?: ContextoVisualizacao,
  mesReferencia?: string,
): Promise<AlertaOrcamento[]> {
  const mes = mesReferencia ?? mesAtual();
  const [orcamentos, categorias] = await Promise.all([
    getOrcamentosComProgresso(contexto, mes),
    listCategorias("consolidado"),
  ]);

  const alertas: AlertaOrcamento[] = [];

  for (const orc of orcamentos) {
    const cat = findCategoriaById(categorias, orc.categoria_id);
    const base = {
      orcamento_id: orc.id,
      descricao: orc.descricao ?? cat?.nome ?? "Orçamento",
      categoria_nome: cat?.nome ?? "Sem categoria",
      contexto: orc.contexto,
      tipo_categoria: orc.tipo_categoria,
      percentual: orc.percentual,
      total_usado: orc.total_usado,
      valor_limite: orc.valor_limite,
    };

    if (orc.tipo_categoria === "receita") {
      if (orc.percentual >= 80) continue;
      alertas.push({
        ...base,
        nivel: "abaixo_meta",
      });
    } else {
      if (orc.percentual < 80) continue;
      alertas.push({
        ...base,
        nivel: orc.total_usado > orc.valor_limite ? "estourado" : "atencao",
      });
    }
  }

  return alertas.sort((a, b) => {
    if (a.tipo_categoria !== b.tipo_categoria) {
      return a.tipo_categoria === "despesa" ? -1 : 1;
    }
    if (a.tipo_categoria === "receita") {
      return a.percentual - b.percentual;
    }
    return b.percentual - a.percentual;
  });
}

export async function contarAlertasOrcamento(
  contexto?: ContextoVisualizacao,
): Promise<number> {
  const alertas = await getAlertasOrcamento(contexto);
  return alertas.length;
}
