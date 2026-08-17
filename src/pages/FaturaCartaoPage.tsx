import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CompraCartaoModal } from "../components/CompraCartaoModal";
import { useConfirm } from "../components/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select, ValorInput } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { getConta, listContas } from "../db/contas";
import {
  getFaturaCartao,
  getResumoCartaoCredito,
  listFaturasCartao,
  pagarFaturaCartao,
} from "../db/faturasCartao";
import {
  deleteCompraParceladaCartao,
  deleteTransacao,
  getTransacao,
} from "../db/transacoes";
import { getErrorMessage } from "../db/utils";
import type { Conta, FaturaCartaoResumo, StatusFaturaCartao, Transacao } from "../types";
import { formatCurrency, formatDate, labelMes } from "../utils/format";
import {
  dataCicloParcelaCartao,
  mesCompetenciaParaData,
  mesFechamentoAtual,
  ultimoDiaComprasFatura,
} from "../utils/faturaCartao";

type AbaFatura = "todos" | "a_vista" | "parceladas";
type ItemFatura = FaturaCartaoResumo["itens"][number];

function ehCompraParcelada(item: ItemFatura): boolean {
  return (item.parcela_total ?? 0) > 1;
}

function descricaoItemFatura(item: ItemFatura): string {
  const limpa = item.descricao.replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "").trim();
  return limpa || item.descricao;
}

function previsaoConclusaoParcela(
  dataCompra: string,
  parcelaTotal: number,
  diaFechamento: number,
): string {
  return mesCompetenciaParaData(
    dataCicloParcelaCartao(dataCompra, parcelaTotal),
    diaFechamento,
  );
}

function labelStatus(status: StatusFaturaCartao | undefined): string {
  switch (status) {
    case "aberta":
      return "Em aberto";
    case "fechada":
      return "Fechada";
    case "futura":
      return "Futura";
    case "paga":
      return "Paga";
    default:
      return "—";
  }
}

function statusClass(status: StatusFaturaCartao | undefined): string {
  switch (status) {
    case "aberta":
      return "bg-teal-50 text-teal-800 ring-1 ring-teal-200";
    case "fechada":
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    case "futura":
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    case "paga":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

export function FaturaCartaoPage() {
  const { contaId } = useParams<{ contaId: string }>();
  const id = Number(contaId);
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faturas, setFaturas] = useState<FaturaCartaoResumo[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [faturaAtual, setFaturaAtual] = useState<FaturaCartaoResumo | null>(null);
  const [resumo, setResumo] = useState<Awaited<ReturnType<typeof getResumoCartaoCredito>>>(null);
  const [contasBanco, setContasBanco] = useState<Awaited<ReturnType<typeof listContas>>>([]);
  const [pagarModal, setPagarModal] = useState(false);
  const [compraModal, setCompraModal] = useState(false);
  const [editing, setEditing] = useState<Transacao | null>(null);
  const [conta, setConta] = useState<Conta | null>(null);
  const [aba, setAba] = useState<AbaFatura>("todos");

  const carregar = useCallback(async () => {
    if (!id || isNaN(id)) return;
    setLoading(true);
    setError(null);
    try {
      const contaDb = await getConta(id);
      if (!contaDb || contaDb.tipo !== "cartao_credito") {
        setError("Cartão não encontrado.");
        return;
      }
      setConta(contaDb);
      const [lista, r, contas] = await Promise.all([
        listFaturasCartao(id),
        getResumoCartaoCredito(id),
        listContas(contexto),
      ]);
      setFaturas(lista);
      setResumo(r);
      setContasBanco(
        contas.filter(
          (c) => c.tipo !== "cartao_credito" && c.contexto === contaDb.contexto,
        ),
      );
      const mesAtualCiclo = contaDb.dia_fechamento
        ? mesFechamentoAtual(contaDb.dia_fechamento)
        : "";
      const mes = mesAtualCiclo || lista[0]?.mes_referencia || "";
      if (mes) {
        const fat = await getFaturaCartao(id, mes);
        setFaturaAtual(fat);
        setMesSelecionado((prev) =>
          prev && lista.some((f) => f.mes_referencia === prev) ? prev : mes,
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, contexto]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  useEffect(() => {
    if (!id || isNaN(id) || !mesSelecionado) return;
    void getFaturaCartao(id, mesSelecionado).then(setFaturaAtual);
  }, [id, mesSelecionado]);

  async function recarregarFaturaAtual() {
    if (!id || isNaN(id)) return;
    try {
      const [lista, r] = await Promise.all([
        listFaturasCartao(id),
        getResumoCartaoCredito(id),
      ]);
      setFaturas(lista);
      setResumo(r);
      const mesAtualCiclo = conta?.dia_fechamento
        ? mesFechamentoAtual(conta.dia_fechamento)
        : "";
      const mes =
        (mesSelecionado && lista.some((f) => f.mes_referencia === mesSelecionado)
          ? mesSelecionado
          : mesAtualCiclo) ||
        lista[0]?.mes_referencia ||
        "";
      if (mes !== mesSelecionado) setMesSelecionado(mes);
      setFaturaAtual(mes ? await getFaturaCartao(id, mes) : null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleEditar(itemId: number) {
    try {
      const t = await getTransacao(itemId);
      if (!t) {
        setError("Lançamento não encontrado.");
        return;
      }
      setEditing(t);
      setCompraModal(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleExcluir(item: FaturaCartaoResumo["itens"][number]) {
    const parcelada = item.parcela_total != null && item.parcela_total > 1 && item.compra_parcelada_id;
    const ok = await confirm({
      title: "Excluir lançamento",
      message: parcelada
        ? `Excluir a parcela ${item.parcela_numero}/${item.parcela_total} (${item.descricao})?`
        : `Excluir a compra "${item.descricao}"?`,
    });
    if (!ok) return;

    let excluirTodas = false;
    if (parcelada && item.compra_parcelada_id) {
      excluirTodas = await confirm({
        title: "Compra parcelada",
        message: "Excluir todas as parcelas desta compra ou somente esta?",
        confirmLabel: "Excluir todas",
        cancelLabel: "Somente esta",
      });
    }

    try {
      if (excluirTodas && item.compra_parcelada_id) {
        await deleteCompraParceladaCartao(item.compra_parcelada_id);
      } else {
        await deleteTransacao(item.id);
      }
      await recarregarFaturaAtual();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (!id || isNaN(id)) {
    return <ErrorAlert message="ID de cartão inválido." />;
  }

  if (loading || ctxLoading) return <LoadingSpinner />;
  if (error && !conta) return <ErrorAlert message={error} />;

  const pendente =
    faturaAtual != null
      ? faturaAtual.total - (faturaAtual.valor_pago ?? 0)
      : 0;
  const podePagar =
    faturaAtual &&
    faturaAtual.status !== "paga" &&
    faturaAtual.status !== "futura" &&
    pendente > 0;

  const itens = faturaAtual?.itens ?? [];
  const itensAVista = itens.filter((item) => !ehCompraParcelada(item));
  const itensParceladas = itens.filter(ehCompraParcelada);
  const itensVisiveis =
    aba === "a_vista" ? itensAVista : aba === "parceladas" ? itensParceladas : itens;
  const totalAba = itensVisiveis.reduce((s, item) => s + item.valor, 0);
  const diaFechamento = conta?.dia_fechamento ?? 1;

  return (
    <div>
      <PageHeader
        title={
          resumo?.conta_nome
            ? conta?.final_cartao
              ? `${resumo.conta_nome} •••• ${conta.final_cartao}`
              : resumo.conta_nome
            : "Cartão"
        }
        subtitle="Faturas, compras e limite — gastos entram no orçamento da categoria"
        action={
          <div className="flex gap-2">
            <Link to="/cartoes">
              <Button variant="secondary">← Cartões</Button>
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setCompraModal(true);
              }}
            >
              + Compra
            </Button>
          </div>
        }
      />

      {error && conta && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      {resumo && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="app-card p-4">
            <p className="text-xs text-slate-500">Total em aberto</p>
            <p className="text-xl font-bold text-rose-700">
              {formatCurrency(resumo.total_em_aberto)}
            </p>
          </div>
          {resumo.limite_credito != null && resumo.limite_credito > 0 && (
            <>
              <div className="app-card p-4">
                <p className="text-xs text-slate-500">Limite</p>
                <p className="text-xl font-bold text-slate-900">
                  {formatCurrency(resumo.limite_credito)}
                </p>
              </div>
              <div className="app-card p-4">
                <p className="text-xs text-slate-500">Limite disponível</p>
                <p className="text-xl font-bold text-emerald-600">
                  {formatCurrency(resumo.limite_disponivel ?? 0)}
                </p>
              </div>
            </>
          )}
          <div className="app-card p-4">
            <p className="text-xs text-slate-500">Fatura selecionada</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(pendente)}</p>
            {faturaAtual && (
              <p className="mt-1 text-xs text-slate-500">
                Fecha {formatDate(faturaAtual.periodo_fim)} · vence {formatDate(faturaAtual.vencimento)}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[16rem] flex-1 sm:max-w-md">
          <Select
            label="Fatura"
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value)}
            options={faturas.map((f) => ({
              value: f.mes_referencia,
              label: `${labelMes(f.mes_competencia)} · ${labelStatus(f.status)} · fecha ${formatDate(f.periodo_fim)}`,
            }))}
          />
          {faturas.some((f) => f.status === "futura") && (
            <p className="mt-1 text-xs text-slate-500">
              Faturas futuras são parcelas que ainda não fecharam o ciclo.
            </p>
          )}
        </div>
        {podePagar && faturaAtual?.id && (
          <Button onClick={() => setPagarModal(true)}>Pagar fatura</Button>
        )}
      </div>

      {faturaAtual && (
        <div className="mb-4 flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusClass(faturaAtual.status)}`}
          >
            {labelStatus(faturaAtual.status)}
          </span>
          <span className="text-sm text-slate-500">
            Período {formatDate(faturaAtual.periodo_inicio)} a{" "}
            {formatDate(ultimoDiaComprasFatura(faturaAtual.periodo_fim))} · fecha{" "}
            {formatDate(faturaAtual.periodo_fim)}
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant={aba === "todos" ? "primary" : "secondary"}
          className="py-1.5 text-xs"
          onClick={() => setAba("todos")}
        >
          Todas ({itens.length})
        </Button>
        <Button
          variant={aba === "a_vista" ? "primary" : "secondary"}
          className="py-1.5 text-xs"
          onClick={() => setAba("a_vista")}
        >
          À vista ({itensAVista.length})
        </Button>
        <Button
          variant={aba === "parceladas" ? "primary" : "secondary"}
          className="py-1.5 text-xs"
          onClick={() => setAba("parceladas")}
        >
          Parceladas ({itensParceladas.length})
        </Button>
      </div>

      {!faturaAtual || itens.length === 0 ? (
        <EmptyState message="Nenhuma compra nesta fatura." />
      ) : itensVisiveis.length === 0 ? (
        <EmptyState
          message={
            aba === "a_vista"
              ? "Nenhuma compra à vista nesta fatura."
              : "Nenhuma compra parcelada nesta fatura."
          }
        />
      ) : (
        <div className="overflow-x-auto app-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">Data da compra</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                {aba === "parceladas" && (
                  <>
                    <th className="px-4 py-3 font-medium">Parcela</th>
                    <th className="px-4 py-3 font-medium">Conclusão</th>
                  </>
                )}
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itensVisiveis.map((item) => {
                const parcelada = ehCompraParcelada(item);
                const restantes =
                  parcelada && item.parcela_numero != null && item.parcela_total != null
                    ? item.parcela_total - item.parcela_numero
                    : 0;
                const conclusao =
                  parcelada && item.parcela_total != null
                    ? previsaoConclusaoParcela(item.data, item.parcela_total, diaFechamento)
                    : null;
                return (
                  <tr key={item.id} className="app-table-row">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(item.data)}</td>
                    <td className="px-4 py-3">
                      {descricaoItemFatura(item)}
                      {aba !== "parceladas" && parcelada && (
                        <span className="ml-2 text-xs text-slate-400">
                          {item.parcela_numero}/{item.parcela_total}
                        </span>
                      )}
                    </td>
                    {aba === "parceladas" && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                          {item.parcela_numero}/{item.parcela_total}
                        </td>
                        <td className="px-4 py-3">
                          <p className="capitalize text-slate-700">
                            {conclusao ? labelMes(conclusao) : "—"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {restantes <= 0
                              ? "Última parcela"
                              : restantes === 1
                                ? "1 parcela depois desta"
                                : `${restantes} parcelas depois desta`}
                          </p>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-slate-500">{item.categoria_nome ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-rose-700">
                      {formatCurrency(item.valor)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() => void handleEditar(item.id)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-rose-600"
                        onClick={() => void handleExcluir(item)}
                      >
                        Excluir
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold">
                <td
                  colSpan={aba === "parceladas" ? 5 : 3}
                  className="px-4 py-3 text-right text-slate-600"
                >
                  {aba === "todos" ? "Total da fatura" : "Subtotal desta aba"}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {formatCurrency(totalAba)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Cada compra no cartão consome o orçamento da categoria no mês da compra. O pagamento da
        fatura é uma transferência banco → cartão e não duplica a despesa.
      </p>

      {conta && (
        <CompraCartaoModal
          open={compraModal}
          onClose={() => {
            setCompraModal(false);
            setEditing(null);
          }}
          cartao={conta}
          transacao={editing}
          onSaved={() => {
            setCompraModal(false);
            setEditing(null);
            void recarregarFaturaAtual();
          }}
        />
      )}

      {faturaAtual?.id && (
        <PagarFaturaModal
          open={pagarModal}
          onClose={() => setPagarModal(false)}
          fatura={faturaAtual}
          contasBanco={contasBanco}
          onPaid={() => {
            setPagarModal(false);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

function PagarFaturaModal({
  open,
  onClose,
  fatura,
  contasBanco,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  fatura: FaturaCartaoResumo;
  contasBanco: Awaited<ReturnType<typeof listContas>>;
  onPaid: () => void;
}) {
  const [contaOrigemId, setContaOrigemId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pendente = fatura.total - (fatura.valor_pago ?? 0);

  useEffect(() => {
    if (open) {
      setContaOrigemId(contasBanco[0] ? String(contasBanco[0].id) : "");
      setData(new Date().toISOString().slice(0, 10));
      setValor(String(pendente));
      setFormError(null);
    }
  }, [open, contasBanco, pendente]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!contaOrigemId || !fatura.id) {
      setFormError("Selecione a conta de origem.");
      return;
    }
    const valorNum = parseFloat(valor);
    if (isNaN(valorNum) || valorNum <= 0) {
      setFormError("Informe um valor válido.");
      return;
    }

    setSaving(true);
    try {
      await pagarFaturaCartao({
        faturaId: fatura.id,
        contaOrigemId: Number(contaOrigemId),
        data,
        valor: valorNum,
      });
      onPaid();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Pagar fatura">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <p className="text-sm text-slate-400">
          Será registrada uma <strong className="text-slate-700">transferência</strong> da conta
          bancária para o cartão — sem nova despesa no relatório.
        </p>
        <Select
          label="Conta de origem"
          value={contaOrigemId}
          onChange={(e) => setContaOrigemId(e.target.value)}
          options={contasBanco.map((c) => ({ value: String(c.id), label: c.nome }))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Data do pagamento" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <ValorInput
            label="Valor"
            min="0"
            max={pendente}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-500">Pendente: {formatCurrency(pendente)}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Processando..." : "Confirmar pagamento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
