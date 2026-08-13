import { useContexto } from "../contexts/ContextoContext";
import type { EscopoFinanceiro } from "../types";

const OPCOES: {
  valor: EscopoFinanceiro;
  titulo: string;
  descricao: string;
}[] = [
  {
    valor: "pessoal",
    titulo: "Só pessoal",
    descricao: "Contas, lançamentos e metas da vida pessoal. O seletor Empresa some do topo.",
  },
  {
    valor: "empresa",
    titulo: "Só empresa",
    descricao: "Finanças do negócio. O seletor Pessoal some do topo.",
  },
  {
    valor: "ambos",
    titulo: "Pessoal e empresa",
    descricao: "Alterna entre os dois e usa o consolidado quando quiser ver tudo junto.",
  },
];

export function EscopoFinanceiroForm() {
  const { escopo, setEscopo, loading } = useContexto();

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-slate-900">O que você controla neste app?</h3>
        <p className="mt-1 text-sm text-slate-500">
          Isso só muda o que aparece na interface. Dados do outro lado, se existirem, ficam
          guardados.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {OPCOES.map((opcao) => {
          const ativo = escopo === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              disabled={loading}
              onClick={() => void setEscopo(opcao.valor)}
              className={`rounded-xl border p-3 text-left transition-all ${
                ativo
                  ? "border-app-sidebar/40 bg-app-sidebar/5 ring-1 ring-app-sidebar/30"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <span className="text-sm font-semibold text-slate-900">{opcao.titulo}</span>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{opcao.descricao}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
