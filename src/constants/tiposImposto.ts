/** Tipos de guia/tributo — visão empresa. */
export const TIPOS_TRIBUTO = [
  { id: "das", label: "DAS (Simples / MEI)" },
  { id: "darf", label: "DARF Unificado" },
  { id: "fgts", label: "FGTS" },
  { id: "inss", label: "INSS" },
  { id: "iss", label: "ISS" },
  { id: "irpj", label: "IRPJ" },
  { id: "csll", label: "CSLL" },
  { id: "pis", label: "PIS" },
  { id: "cofins", label: "COFINS" },
  { id: "icms", label: "ICMS" },
  { id: "ipi", label: "IPI" },
  { id: "irrf", label: "IRRF" },
  { id: "outro", label: "Outro" },
] as const;

export type TipoTributo = (typeof TIPOS_TRIBUTO)[number]["id"];

export function labelTipoTributo(tipo: string): string {
  return TIPOS_TRIBUTO.find((t) => t.id === tipo)?.label ?? tipo;
}

export function descricaoPadraoImposto(tipo: TipoTributo, competencia: string): string {
  const label = labelTipoTributo(tipo);
  const [y, m] = competencia.split("-");
  if (y && m) return `${label} — ${m}/${y}`;
  return label;
}
