import { useContexto } from "../contexts/ContextoContext";
import type { ContextoVisualizacao } from "../types";

const OPCOES: { valor: ContextoVisualizacao; label: string; cor: string }[] = [
  { valor: "pessoal", label: "Pessoal", cor: "bg-teal-500" },
  { valor: "empresa", label: "Empresa", cor: "bg-violet-500" },
  { valor: "consolidado", label: "Consolidado", cor: "bg-slate-400" },
];

export function ContextoSelector() {
  const { contexto, setContexto, loading } = useContexto();

  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {OPCOES.map((opcao) => (
        <button
          key={opcao.valor}
          type="button"
          disabled={loading}
          onClick={() => void setContexto(opcao.valor)}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
            contexto === opcao.valor
              ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${opcao.cor}`} />
          {opcao.label}
        </button>
      ))}
    </div>
  );
}

export function ContextoBadge({ itemContexto }: { itemContexto: "pessoal" | "empresa" }) {
  const isPessoal = itemContexto === "pessoal";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isPessoal
          ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200"
          : "bg-violet-50 text-violet-800 ring-1 ring-violet-200"
      }`}
    >
      {isPessoal ? "Pessoal" : "Empresa"}
    </span>
  );
}
