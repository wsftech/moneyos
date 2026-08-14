import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CartaoFormModal } from "../components/CartaoFormModal";
import { CompraCartaoModal } from "../components/CompraCartaoModal";
import { ContaIcone } from "../components/ContaIcone";
import { ContextoBadge } from "../components/ContextoSelector";
import { useConfirm } from "../components/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { useContexto } from "../contexts/ContextoContext";
import { deleteConta, listContas } from "../db/contas";
import { getResumoCartaoCredito } from "../db/faturasCartao";
import { getErrorMessage } from "../db/utils";
import type { Conta, ResumoCartaoCredito } from "../types";
import { formatCurrency, formatDate } from "../utils/format";

export function CartoesPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cartoes, setCartoes] = useState<Conta[]>([]);
  const [resumos, setResumos] = useState<Map<number, ResumoCartaoCredito>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalCartao, setModalCartao] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [modalCompra, setModalCompra] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const contas = await listContas(contexto);
      const lista = contas.filter((c) => c.tipo === "cartao_credito");
      setCartoes(lista);
      const map = new Map<number, ResumoCartaoCredito>();
      await Promise.all(
        lista
          .filter((c) => c.dia_fechamento && c.dia_vencimento)
          .map(async (c) => {
            const r = await getResumoCartaoCredito(c.id);
            if (r) map.set(c.id, r);
          }),
      );
      setResumos(map);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  useEffect(() => {
    if (searchParams.get("nova") === "1") {
      setEditing(null);
      setModalCartao(true);
      setSearchParams({}, { replace: true });
    }
    if (searchParams.get("compra") === "1") {
      setModalCompra(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function handleDelete(id: number) {
    if (
      !(await confirm({
        title: "Excluir cartão",
        message:
          "Excluir este cartão? Compras e faturas vinculadas precisam ser removidas antes, se o banco impedir.",
      }))
    ) {
      return;
    }
    try {
      await deleteConta(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const ativos = cartoes.filter((c) => c.ativo);
  const totalAberto = [...resumos.values()].reduce((s, r) => s + r.total_em_aberto, 0);
  const limiteTotal = ativos.reduce((s, c) => s + (c.limite_credito ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Cartões de crédito"
        subtitle="Limite, faturas e compras — cada gasto entra no orçamento da categoria"
        action={
          <div className="flex gap-2">
            {cartoes.length > 0 && (
              <Button variant="secondary" onClick={() => setModalCompra(true)}>
                + Compra
              </Button>
            )}
            <Button
              onClick={() => {
                setEditing(null);
                setModalCartao(true);
              }}
            >
              + Novo cartão
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : cartoes.length === 0 ? (
        <EmptyState message="Nenhum cartão cadastrado. Cadastre o cartão com fechamento, vencimento e limite para lançar as compras." />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="app-card p-4">
              <p className="text-xs text-slate-500">Em aberto nos cartões</p>
              <p className="text-2xl font-bold text-rose-700">{formatCurrency(totalAberto)}</p>
            </div>
            {limiteTotal > 0 && (
              <div className="app-card p-4">
                <p className="text-xs text-slate-500">Limite total</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(limiteTotal)}</p>
                <p className="mt-1 text-sm text-emerald-700">
                  Disponível {formatCurrency(Math.max(0, limiteTotal - totalAberto))}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cartoes.map((cartao) => {
              const resumo = resumos.get(cartao.id);
              const limite = cartao.limite_credito ?? 0;
              const usado = resumo?.total_em_aberto ?? 0;
              const pct = limite > 0 ? Math.min((usado / limite) * 100, 100) : 0;
              return (
                <div
                  key={cartao.id}
                  className="app-card p-5"
                  style={{ borderTopColor: cartao.cor, borderTopWidth: 3 }}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <ContaIcone
                        icone={cartao.icone}
                        logoPath={cartao.logo_path}
                        tipo="cartao_credito"
                        cor={cartao.cor}
                      />
                      <div>
                        <h3 className="font-semibold text-slate-900">{cartao.nome}</h3>
                        <p className="text-xs text-slate-500">
                          {cartao.final_cartao ? `•••• ${cartao.final_cartao}` : "Sem final cadastrado"}
                          {cartao.dia_fechamento && cartao.dia_vencimento
                            ? ` · Fecha dia ${cartao.dia_fechamento} · vence dia ${cartao.dia_vencimento}`
                            : " · Informe fechamento e vencimento"}
                        </p>
                      </div>
                    </div>
                    {contexto === "consolidado" && <ContextoBadge itemContexto={cartao.contexto} />}
                  </div>

                  {limite > 0 ? (
                    <>
                      <p className="text-xl font-bold text-slate-900">
                        {formatCurrency(usado)}
                        <span className="ml-2 text-sm font-normal text-slate-500">
                          de {formatCurrency(limite)}
                        </span>
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Disponível {formatCurrency(Math.max(0, limite - usado))}
                      </p>
                    </>
                  ) : (
                    <p className="text-xl font-bold text-rose-600">{formatCurrency(usado)} em aberto</p>
                  )}

                  {resumo?.fatura_atual && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <p className="font-medium text-slate-600">Fatura atual</p>
                      <p className="text-slate-500">
                        Fecha {formatDate(resumo.fatura_atual.periodo_fim)} · vence{" "}
                        {formatDate(resumo.fatura_atual.vencimento)}
                      </p>
                      <p className="mt-1 font-semibold text-rose-600">
                        {formatCurrency(
                          resumo.fatura_atual.total - (resumo.fatura_atual.valor_pago ?? 0),
                        )}
                      </p>
                    </div>
                  )}

                  {!cartao.ativo && (
                    <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Inativo
                    </span>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/cartoes/${cartao.id}`} className="flex-1">
                      <Button variant="secondary" className="w-full py-1.5">
                        Faturas e compras
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      className="py-1.5"
                      onClick={() => {
                        setEditing(cartao);
                        setModalCartao(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-rose-600"
                      onClick={() => void handleDelete(cartao.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <CartaoFormModal
        open={modalCartao}
        onClose={() => setModalCartao(false)}
        cartao={editing}
        onSaved={() => {
          setModalCartao(false);
          void carregar();
        }}
      />
      <CompraCartaoModal
        open={modalCompra}
        onClose={() => setModalCompra(false)}
        cartoes={cartoes}
        onSaved={() => {
          setModalCompra(false);
          void carregar();
        }}
      />
    </div>
  );
}
