import { Select } from "./ui/FormFields";
import type { Contexto, ContextoVisualizacao } from "../types";

export function ContextoFormSelect({
  value,
  onChange,
  required,
}: {
  value: Contexto;
  onChange: (v: Contexto) => void;
  required?: boolean;
}) {
  return (
    <Select
      label="Contexto"
      value={value}
      onChange={(e) => onChange(e.target.value as Contexto)}
      required={required}
      options={[
        { value: "pessoal", label: "Pessoal" },
        { value: "empresa", label: "Empresa" },
      ]}
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

export function defaultFormContexto(visualizacao: ContextoVisualizacao): Contexto {
  return visualizacao === "consolidado" ? "pessoal" : visualizacao;
}
