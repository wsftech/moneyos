import { useContexto } from "../contexts/ContextoContext";
import type { ContextoVisualizacao } from "../types";

const OPCOES: { valor: ContextoVisualizacao; label: string; cor: string }[] = [
  { valor: "pessoal", label: "Pessoal", cor: "bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]" },
  { valor: "empresa", label: "Empresa", cor: "bg-[#bf5af2] shadow-[0_0_8px_rgba(191,90,242,0.6)]" },
  { valor: "consolidado", label: "Consolidado", cor: "bg-slate-400" },
];

export function ContextoSelector() {
  const { contexto, setContexto, loading } = useContexto();

  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
      {OPCOES.map((opcao) => (
        <button
          key={opcao.valor}
          type="button"
          disabled={loading}
          onClick={() => void setContexto(opcao.valor)}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
            contexto === opcao.valor
              ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/30"
              : "text-slate-400 hover:text-slate-200"
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
          ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30"
          : "bg-[#bf5af2]/15 text-purple-300 ring-1 ring-[#bf5af2]/30"
      }`}
    >
      {isPessoal ? "Pessoal" : "Empresa"}
    </span>
  );
}
