import { createCategoria, listCategorias } from "./categorias";
import type { ContextoVisualizacao } from "../types";

export type TemplateCategoriaGrupo = "pessoal_basico" | "empresa_basico";

const TEMPLATES: Record<
  TemplateCategoriaGrupo,
  { nome: string; tipo: "receita" | "despesa"; contexto: "pessoal" | "empresa" | "ambos"; cor: string }[]
> = {
  pessoal_basico: [
    { nome: "Salário", tipo: "receita", contexto: "pessoal", cor: "#34d399" },
    { nome: "Freelance", tipo: "receita", contexto: "pessoal", cor: "#06b6d4" },
    { nome: "Alimentação", tipo: "despesa", contexto: "pessoal", cor: "#f97316" },
    { nome: "Moradia", tipo: "despesa", contexto: "pessoal", cor: "#6366f1" },
    { nome: "Transporte", tipo: "despesa", contexto: "pessoal", cor: "#a78bfa" },
    { nome: "Saúde", tipo: "despesa", contexto: "pessoal", cor: "#fb7185" },
    { nome: "Lazer", tipo: "despesa", contexto: "pessoal", cor: "#fbbf24" },
  ],
  empresa_basico: [
    { nome: "Vendas", tipo: "receita", contexto: "empresa", cor: "#34d399" },
    { nome: "Serviços", tipo: "receita", contexto: "empresa", cor: "#06b6d4" },
    { nome: "Fornecedores", tipo: "despesa", contexto: "empresa", cor: "#f97316" },
    { nome: "Folha de pagamento", tipo: "despesa", contexto: "empresa", cor: "#6366f1" },
    { nome: "Impostos", tipo: "despesa", contexto: "empresa", cor: "#ef4444" },
    { nome: "Marketing", tipo: "despesa", contexto: "empresa", cor: "#a78bfa" },
    { nome: "Infraestrutura", tipo: "despesa", contexto: "empresa", cor: "#94a3b8" },
  ],
};

export function listTemplatesDisponiveis(): { id: TemplateCategoriaGrupo; label: string }[] {
  return [
    { id: "pessoal_basico", label: "Pessoal — básico" },
    { id: "empresa_basico", label: "Empresa — básico" },
  ];
}

export async function importarTemplateCategorias(
  grupo: TemplateCategoriaGrupo,
  contexto?: ContextoVisualizacao,
): Promise<{ criadas: number; ignoradas: number }> {
  const existentes = await listCategorias("consolidado");
  const nomesExistentes = new Set(existentes.map((c) => `${c.nome.toLowerCase()}|${c.tipo}|${c.contexto}`));

  let criadas = 0;
  let ignoradas = 0;

  for (const item of TEMPLATES[grupo]) {
    if (contexto && contexto !== "consolidado") {
      if (item.contexto !== "ambos" && item.contexto !== contexto) {
        ignoradas++;
        continue;
      }
    }
    const ctx = item.contexto === "ambos" ? "ambos" : item.contexto;
    const key = `${item.nome.toLowerCase()}|${item.tipo}|${ctx}`;
    if (nomesExistentes.has(key)) {
      ignoradas++;
      continue;
    }
    await createCategoria({
      nome: item.nome,
      tipo: item.tipo,
      contexto: ctx,
      cor: item.cor,
    });
    nomesExistentes.add(key);
    criadas++;
  }

  return { criadas, ignoradas };
}
