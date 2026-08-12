import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { getConta, listContas } from "../db/contas";
import {
  getFaturaCartao,
  getResumoCartaoCredito,
  listFaturasCartao,
  pagarFaturaCartao,
} from "../db/faturasCartao";
import { getErrorMessage } from "../db/utils";
import type { FaturaCartaoResumo, StatusFaturaCartao } from "../types";
import { formatCurrency, formatDate, labelMes } from "../utils/format";

function labelStatus(status: StatusFaturaCartao | undefined): string {
  switch (status) {
    case "aberta":
      return "Em aberto";
    case "fechada":
      return "Fechada";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faturas, setFaturas] = useState<FaturaCartaoResumo[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [faturaAtual, setFaturaAtual] = useState<FaturaCartaoResumo | null>(null);
  const [resumo, setResumo] = useState<Awaited<ReturnType<typeof getResumoCartaoCredito>>>(null);
  const [contasBanco, setContasBanco] = useState<Awaited<ReturnType<typeof listContas>>>([]);
  const [pagarModal, setPagarModal] = useState(false);

  const carregar = useCallback(async () => {
    if (!id || isNaN(id)) return;
    setLoading(true);
    setError(null);
    try {
      const conta = await getConta(id);
      if (!conta || conta.tipo !== "cartao_credito") {
        setError("Cartão não encontrado.");
        return;
      }
      const [lista, r, contas] = await Promise.all([
        listFaturasCartao(id, 8),
        getResumoCartaoCredito(id),
        listContas(contexto),
      ]);
      setFaturas(lista);
      setResumo(r);
      setContasBanco(
        contas.filter(
          (c) => c.tipo !== "cartao_credito" && c.contexto === conta.contexto,
        ),
      );
      const mes = lista[0]?.mes_referencia || "";
      if (mes) {
        const fat = await getFaturaCartao(id, mes);
        setFaturaAtual(fat);
        setMesSelecionado((prev) => prev || mes);
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

  if (!id || isNaN(id)) {
    return <ErrorAlert message="ID de cartão inválido." />;
  }

  if (loading || ctxLoading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;

  const pendente =
    faturaAtual != null
      ? faturaAtual.total - (faturaAtual.valor_pago ?? 0)
      : 0;
  const podePagar = faturaAtual && faturaAtual.status !== "paga" && pendente > 0;

  return (
    <div>
      <PageHeader
        title={resumo?.conta_nome ?? "Cartão"}
        subtitle="Faturas, limite e pagamento"
        action={
          <Link to="/contas">
            <Button variant="secondary">← Voltar às contas</Button>
          </Link>
        }
      />

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
              <p className="mt-1 text-xs text-slate-500">Vence {formatDate(faturaAtual.vencimento)}</p>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-48">
          <Select
            label="Fatura"
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value)}
            options={faturas.map((f) => ({
              value: f.mes_referencia,
              label: `${labelMes(f.mes_referencia)} · ${labelStatus(f.status)}`,
            }))}
          />
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
            Período {formatDate(faturaAtual.periodo_inicio)} a {formatDate(faturaAtual.periodo_fim)}
          </span>
        </div>
      )}

      {!faturaAtual || faturaAtual.itens.length === 0 ? (
        <EmptyState message="Nenhuma compra nesta fatura." />
      ) : (
        <div className="overflow-x-auto app-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {faturaAtual.itens.map((item) => (
                <tr key={item.id} className="app-table-row">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(item.data)}</td>
                  <td className="px-4 py-3">{item.descricao}</td>
                  <td className="px-4 py-3 text-right font-medium text-rose-700">
                    {formatCurrency(item.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold">
                <td colSpan={2} className="px-4 py-3 text-right text-slate-600">
                  Total
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {formatCurrency(faturaAtual.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Compras no cartão entram no orçamento na data da compra. O pagamento da fatura é uma
        transferência banco → cartão e não duplica despesas no P&L.
      </p>

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
          <Input
            label="Valor"
            type="number"
            step="0.01"
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
