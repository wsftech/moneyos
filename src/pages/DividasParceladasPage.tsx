import { useCallback, useEffect, useState } from "react";
import { EmprestimosPage } from "./EmprestimosPage";
import { FinanciamentosPage } from "./FinanciamentosPage";
import { PageHeader, LoadingSpinner } from "../components/ui/Feedback";
import { Button } from "../components/ui/Button";
import { listEmprestimos, sincronizarStatusParcelas as syncEmp } from "../db/emprestimos";
import { listFinanciamentos, sincronizarStatusParcelas as syncFin } from "../db/financiamentos";
import { useContexto } from "../contexts/ContextoContext";
import { formatCurrency, formatDate } from "../utils/format";
import { ContextoBadge } from "../components/ContextoSelector";

type AbaDivida = "todos" | "financiamento" | "emprestimo";

type ItemDivida = {
  chave: string;
  tipo: "financiamento" | "emprestimo";
  descricao: string;
  contexto: "pessoal" | "empresa";
  valor_restante: number;
  percentual_pago: number;
  proximo_vencimento: string | null;
};

export function DividasParceladasPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const [aba, setAba] = useState<AbaDivida>("todos");
  const [resumo, setResumo] = useState<ItemDivida[]>([]);
  const [loadingResumo, setLoadingResumo] = useState(true);

  const carregarResumo = useCallback(async () => {
    setLoadingResumo(true);
    try {
      await Promise.all([syncFin(), syncEmp()]);
      const [fin, emp] = await Promise.all([
        listFinanciamentos(contexto),
        listEmprestimos(contexto),
      ]);
      const items: ItemDivida[] = [
        ...fin.map((f) => ({
          chave: `fin-${f.id}`,
          tipo: "financiamento" as const,
          descricao: f.descricao,
          contexto: f.contexto,
          valor_restante: f.valor_restante,
          percentual_pago: f.percentual_pago,
          proximo_vencimento: f.proximo_vencimento,
        })),
        ...emp.map((e) => ({
          chave: `emp-${e.id}`,
          tipo: "emprestimo" as const,
          descricao: e.descricao,
          contexto: e.contexto,
          valor_restante: e.valor_restante,
          percentual_pago: e.percentual_pago,
          proximo_vencimento: e.proximo_vencimento,
        })),
      ].sort((a, b) => b.valor_restante - a.valor_restante);
      setResumo(items);
    } finally {
      setLoadingResumo(false);
    }
  }, [contexto]);

  useEffect(() => {
    if (!ctxLoading) void carregarResumo();
  }, [carregarResumo, ctxLoading]);

  const totalRestante = resumo.reduce((s, i) => s + i.valor_restante, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dívidas parceladas"
        subtitle="Financiamentos e empréstimos em um só lugar"
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["todos", "Visão geral"],
            ["financiamento", "Financiamentos"],
            ["emprestimo", "Empréstimos"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            variant={aba === id ? "primary" : "secondary"}
            className="py-1.5 text-xs"
            onClick={() => setAba(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {aba === "todos" && (
        <section className="space-y-4">
          <div className="app-card p-5">
            <p className="text-xs text-slate-500">Saldo devedor total</p>
            <p className="text-2xl font-bold text-rose-300">{formatCurrency(totalRestante)}</p>
            <p className="mt-1 text-xs text-slate-500">{resumo.length} contrato(s) ativo(s)</p>
          </div>
          {loadingResumo || ctxLoading ? (
            <LoadingSpinner />
          ) : resumo.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma dívida parcelada cadastrada.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {resumo.map((item) => (
                <div key={item.chave} className="app-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-100">{item.descricao}</p>
                      <p className="text-xs capitalize text-slate-500">{item.tipo}</p>
                    </div>
                    {contexto === "consolidado" && (
                      <ContextoBadge itemContexto={item.contexto} />
                    )}
                  </div>
                  <p className="mt-2 text-lg font-bold text-rose-300">
                    {formatCurrency(item.valor_restante)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.percentual_pago}% pago
                    {item.proximo_vencimento &&
                      ` · Próx.: ${formatDate(item.proximo_vencimento)}`}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${item.percentual_pago}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {aba === "financiamento" && <FinanciamentosPage embedded onChanged={carregarResumo} />}
      {aba === "emprestimo" && <EmprestimosPage embedded onChanged={carregarResumo} />}
    </div>
  );
}
