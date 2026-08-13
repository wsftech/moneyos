import { useContexto } from "../contexts/ContextoContext";
import { Select } from "./ui/FormFields";
import type { Contexto, ContextoVisualizacao, EscopoFinanceiro } from "../types";

const LABELS: Record<Contexto, string> = {
  pessoal: "Pessoal",
  empresa: "Empresa",
};

export function ContextoFormSelect({
  value,
  onChange,
  required,
}: {
  value: Contexto;
  onChange: (v: Contexto) => void;
  required?: boolean;
}) {
  const { contextosDisponiveis, escopoUnico } = useContexto();

  if (escopoUnico || contextosDisponiveis.length <= 1) {
    return null;
  }

  return (
    <Select
      label="Contexto"
      value={value}
      onChange={(e) => onChange(e.target.value as Contexto)}
      required={required}
      options={contextosDisponiveis.map((c) => ({ value: c, label: LABELS[c] }))}
    />
  );
}

export function resolveContexto(
  visualizacao: ContextoVisualizacao,
  formContexto: Contexto,
): Contexto {
  if (visualizacao === "consolidado") return formContexto;
  return visualizacao;
}

export function defaultFormContexto(
  visualizacao: ContextoVisualizacao,
  escopo: EscopoFinanceiro = "ambos",
): Contexto {
  if (visualizacao !== "consolidado") return visualizacao;
  if (escopo === "empresa") return "empresa";
  return "pessoal";
}
