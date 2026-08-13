import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
type SubtipoDivida = "financiamento" | "emprestimo";

type ItemDivida = {
  chave: string;
  tipo: SubtipoDivida;
  descricao: string;
  contexto: "pessoal" | "empresa";
  valor_restante: number;
  percentual_pago: number;
  proximo_vencimento: string | null;
};

function labelSubtipo(tipo: SubtipoDivida): string {
  return tipo === "financiamento" ? "Financiamento" : "Empréstimo";
}

export function DividasParceladasPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const [searchParams, setSearchParams] = useSearchParams();
  const [aba, setAba] = useState<AbaDivida>("todos");
  const [resumo, setResumo] = useState<ItemDivida[]>([]);
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [abrirNovoFinanciamento, setAbrirNovoFinanciamento] = useState(false);
  const [abrirNovoEmprestimo, setAbrirNovoEmprestimo] = useState(false);
  const [escolherSubtipo, setEscolherSubtipo] = useState(false);

  useEffect(() => {
    if (searchParams.get("nova") !== "1") return;
    setEscolherSubtipo(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const carregarResumo = useCallback(async () => {
    setLoadingResumo(true);
    try {
      const { backfillCategoriasDividasSemCategoria } = await import("../db/categorias");
      await backfillCategoriasDividasSemCategoria(contexto);
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

  function iniciarNova(subtipo: SubtipoDivida) {
    setEscolherSubtipo(false);
    setAba(subtipo);
    if (subtipo === "financiamento") setAbrirNovoFinanciamento(true);
    else setAbrirNovoEmprestimo(true);
  }

  const totalRestante = resumo.reduce((s, i) => s + i.valor_restante, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dívidas"
        subtitle="Parcelas de financiamento ou empréstimo — escolha o tipo ao cadastrar"
        action={
          <Button type="button" onClick={() => setEscolherSubtipo((v) => !v)}>
            + Nova dívida
          </Button>
        }
      />

      {escolherSubtipo && (
        <div className="app-card flex flex-wrap gap-3 p-4">
          <p className="w-full text-sm text-slate-600">Qual tipo de dívida parcelada?</p>
          <Button type="button" onClick={() => iniciarNova("financiamento")}>
            Financiamento
          </Button>
          <Button type="button" variant="secondary" onClick={() => iniciarNova("emprestimo")}>
            Empréstimo
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEscolherSubtipo(false)}>
            Cancelar
          </Button>
        </div>
      )}

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
            <p className="text-2xl font-bold text-rose-700">{formatCurrency(totalRestante)}</p>
            <p className="mt-1 text-xs text-slate-500">{resumo.length} contrato(s) ativo(s)</p>
          </div>
          {loadingResumo || ctxLoading ? (
            <LoadingSpinner />
          ) : resumo.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhuma dívida parcelada. Cadastre um financiamento ou empréstimo — ambos aparecem
              aqui com o saldo que ainda falta pagar.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {resumo.map((item) => (
                <button
                  key={item.chave}
                  type="button"
                  className="app-card p-4 text-left transition-colors hover:bg-slate-50"
                  onClick={() => setAba(item.tipo)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{item.descricao}</p>
                      <p className="text-xs text-slate-500">{labelSubtipo(item.tipo)}</p>
                    </div>
                    {contexto === "consolidado" && (
                      <ContextoBadge itemContexto={item.contexto} />
                    )}
                  </div>
                  <p className="mt-2 text-lg font-bold text-rose-700">
                    {formatCurrency(item.valor_restante)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.percentual_pago}% pago
                    {item.proximo_vencimento &&
                      ` · Próx.: ${formatDate(item.proximo_vencimento)}`}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${item.percentual_pago}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {aba === "financiamento" && (
        <FinanciamentosPage
          embedded
          onChanged={carregarResumo}
          abrirNovo={abrirNovoFinanciamento}
          onAbrirNovoConsumido={() => setAbrirNovoFinanciamento(false)}
        />
      )}
      {aba === "emprestimo" && (
        <EmprestimosPage
          embedded
          onChanged={carregarResumo}
          abrirNovo={abrirNovoEmprestimo}
          onAbrirNovoConsumido={() => setAbrirNovoEmprestimo(false)}
        />
      )}
    </div>
  );
}
