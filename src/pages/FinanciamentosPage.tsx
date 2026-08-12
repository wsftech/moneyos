import { useCallback, useEffect, useMemo, useState } from "react";
import { ContextoBadge } from "../components/ContextoSelector";
import {
  ContextoFormSelect,
  defaultFormContexto,
  resolveContexto,
} from "../components/ContextoFormSelect";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select, Textarea } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { listCategorias } from "../db/categorias";
import { listContas } from "../db/contas";
import { ParcelasHistoricasSection } from "../components/ParcelasHistoricasSection";
import {
  aplicarPagamentosHistoricos,
  createFinanciamento,
  deleteFinanciamento,
  filtrarParcelasPorSelecao,
  listFinanciamentos,
  listParcelas,
  pagarParcelas,
  sincronizarStatusParcelas,
  updateFinanciamento,
  type FinanciamentoInput,
} from "../db/financiamentos";
import { getErrorMessage } from "../db/utils";
import type { Contexto, ContextoVisualizacao, FinanciamentoParcela, FinanciamentoResumo } from "../types";
import { formatCurrency, formatDate, mesAtual } from "../utils/format";
import {
  validarPagamentosHistoricos,
  type PagamentoHistoricoRow,
} from "../utils/parcelasHistoricas";

type SelecaoRapida = "mes" | "ultima" | "mes_e_ultima" | "todas" | "manual";
type PagamentoSelecionado = { valor: number; data: string };

export function FinanciamentosPage({
  embedded = false,
  onChanged,
  abrirNovo = false,
  onAbrirNovoConsumido,
}: {
  embedded?: boolean;
  onChanged?: () => void;
  abrirNovo?: boolean;
  onAbrirNovoConsumido?: () => void;
} = {}) {
  const { contexto, loading: ctxLoading } = useContexto();
  const [items, setItems] = useState<FinanciamentoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [editing, setEditing] = useState<FinanciamentoResumo | null>(null);
  const [pagando, setPagando] = useState<FinanciamentoResumo | null>(null);
  const [pagamentoHistorico, setPagamentoHistorico] = useState(false);

  useEffect(() => {
    if (!abrirNovo) return;
    setEditing(null);
    setModalCadastro(true);
    onAbrirNovoConsumido?.();
  }, [abrirNovo, onAbrirNovoConsumido]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await sincronizarStatusParcelas();
      setItems(await listFinanciamentos(contexto));
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  async function handleDelete(id: number) {
    if (!confirm("Excluir este financiamento e todas as parcelas?")) return;
    try {
      await deleteFinanciamento(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="Financiamentos"
          subtitle="Acompanhe parcelas, saldo devedor e pagamentos"
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setModalCadastro(true);
              }}
            >
              + Novo financiamento
            </Button>
          }
        />
      )}
      {embedded && (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              setEditing(null);
              setModalCadastro(true);
            }}
          >
            + Novo financiamento
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <EmptyState message="Nenhum financiamento cadastrado." />
      ) : (
        <div className="space-y-4">
          {items.map((fin) => (
            <FinanciamentoCard
              key={fin.id}
              fin={fin}
              contexto={contexto}
              onPagar={() => {
                setPagando(fin);
                setPagamentoHistorico(false);
                setModalPagamento(true);
              }}
              onRegistrarAnteriores={() => {
                setPagando(fin);
                setPagamentoHistorico(true);
                setModalPagamento(true);
              }}
              onEdit={() => {
                setEditing(fin);
                setModalCadastro(true);
              }}
              onDelete={() => void handleDelete(fin.id)}
            />
          ))}
        </div>
      )}

      <CadastroModal
        open={modalCadastro}
        onClose={() => setModalCadastro(false)}
        financiamento={editing}
        onSaved={() => {
          setModalCadastro(false);
          void carregar();
        }}
      />

      <PagamentoModal
        open={modalPagamento}
        onClose={() => {
          setModalPagamento(false);
          setPagamentoHistorico(false);
        }}
        financiamento={pagando}
        modoHistorico={pagamentoHistorico}
        onSaved={async () => {
          setModalPagamento(false);
          setPagamentoHistorico(false);
          await carregar();
        }}
      />
    </div>
  );
}

function FinanciamentoCard({
  fin,
  contexto,
  onPagar,
  onRegistrarAnteriores,
  onEdit,
  onDelete,
}: {
  fin: FinanciamentoResumo;
  contexto: ContextoVisualizacao;
  onPagar: () => void;
  onRegistrarAnteriores: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [parcelas, setParcelas] = useState<FinanciamentoParcela[]>([]);
  const [loadingParcelas, setLoadingParcelas] = useState(false);

  async function toggleHistorico() {
    if (expandido) {
      setExpandido(false);
      return;
    }
    setLoadingParcelas(true);
    try {
      setParcelas(await listParcelas(fin.id));
      setExpandido(true);
    } finally {
      setLoadingParcelas(false);
    }
  }

  const pagas = parcelas.filter((p) => p.status === "paga");

  return (
    <div className="app-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{fin.descricao}</h3>
          <p className="text-sm text-slate-500">
            {fin.parcelas_pagas}/{fin.total_parcelas} parcelas · venc. dia{" "}
            {fin.data_primeira_parcela.slice(8, 10)} · ref. {formatCurrency(fin.valor_parcela)}/mês
          </p>
          {contexto === "consolidado" && (
            <div className="mt-1">
              <ContextoBadge itemContexto={fin.contexto} />
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-900">{formatCurrency(fin.valor_restante)}</p>
          <p className="text-xs text-slate-500">restante</p>
        </div>
      </div>

      <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
          style={{ width: `${fin.percentual_pago}%` }}
        />
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Você pagou {formatCurrency(fin.valor_pago)} de {formatCurrency(fin.valor_total_contrato)}
        {" · "}
        Falta {formatCurrency(fin.valor_restante)}
        {" · "}
        {fin.percentual_pago}% quitado
        {fin.proximo_vencimento && <> · Próx. venc.: {formatDate(fin.proximo_vencimento)}</>}
      </p>

      {expandido && pagas.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-xs">
            <thead className="app-table-head">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Vencimento</th>
                <th className="px-3 py-2 font-medium">Pago em</th>
                <th className="px-3 py-2 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagas.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">{p.numero_parcela}</td>
                  <td className="px-3 py-2">{formatDate(p.vencimento)}</td>
                  <td className="px-3 py-2">
                    {p.data_pagamento ? formatDate(p.data_pagamento) : "—"}
                    {p.data_pagamento && p.data_pagamento < p.vencimento && (
                      <span className="ml-1 text-green-600">antecipado</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCurrency(p.valor_pago ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {fin.parcelas_pagas > 0 && (
          <Button variant="secondary" className="py-1.5" onClick={() => void toggleHistorico()}>
            {loadingParcelas ? "..." : expandido ? "Ocultar histórico" : "Ver pagamentos"}
          </Button>
        )}
        {fin.parcelas_restantes > 0 && (
          <>
            <Button className="py-1.5" onClick={onPagar}>
              Pagar parcelas
            </Button>
            <Button variant="secondary" className="py-1.5" onClick={onRegistrarAnteriores}>
              Registrar anteriores
            </Button>
          </>
        )}
        <Button variant="secondary" className="py-1.5" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="ghost" className="text-rose-600" onClick={onDelete}>
          Excluir
        </Button>
      </div>
    </div>
  );
}

function CadastroModal({
  open,
  onClose,
  financiamento,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  financiamento: FinanciamentoResumo | null;
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const [contas, setContas] = useState<Awaited<ReturnType<typeof listContas>>>([]);
  const [categorias, setCategorias] = useState<Awaited<ReturnType<typeof listCategorias>>>([]);
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [descricao, setDescricao] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [valorParcela, setValorParcela] = useState("");
  const [totalParcelas, setTotalParcelas] = useState("");
  const [dataPrimeira, setDataPrimeira] = useState("");
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [historicoEnabled, setHistoricoEnabled] = useState(false);
  const [historicoQtd, setHistoricoQtd] = useState(0);
  const [historicoRows, setHistoricoRows] = useState<PagamentoHistoricoRow[]>([]);
  const [historicoCriarTransacoes, setHistoricoCriarTransacoes] = useState(true);

  useEffect(() => {
    if (!open) return;

    void (async () => {
      const ctxForm = financiamento?.contexto ?? defaultFormContexto(contexto);
      const ctxDivida = ctxForm === "empresa" ? "empresa" : "pessoal";
      const { ensureCategoriaDivida } = await import("../db/categorias");
      const padrao = await ensureCategoriaDivida("financiamento", ctxDivida);
      const [c, cat] = await Promise.all([listContas(contexto), listCategorias(contexto)]);
      setContas(c);
      setCategorias(cat.filter((x) => x.tipo === "despesa"));

      if (financiamento) {
        setFormContexto(financiamento.contexto);
        setDescricao(financiamento.descricao);
        setValorTotal(String(financiamento.valor_total));
        setValorParcela(String(financiamento.valor_parcela));
        setTotalParcelas(String(financiamento.total_parcelas));
        setDataPrimeira(financiamento.data_primeira_parcela);
        setContaId(String(financiamento.conta_id));
        setCategoriaId(
          financiamento.categoria_id ? String(financiamento.categoria_id) : String(padrao.id),
        );
        setObservacoes(financiamento.observacoes ?? "");
      } else {
        setFormContexto(defaultFormContexto(contexto));
        setDescricao("");
        setValorTotal("");
        setValorParcela("");
        setTotalParcelas("");
        setDataPrimeira(new Date().toISOString().slice(0, 10));
        setContaId(c[0] ? String(c[0].id) : "");
        setCategoriaId(String(padrao.id));
        setObservacoes("");
        setHistoricoEnabled(false);
        setHistoricoQtd(0);
        setHistoricoRows([]);
        setHistoricoCriarTransacoes(true);
      }
    })();
  }, [open, contexto, financiamento]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (financiamento) {
      const vt = parseFloat(valorTotal);
      const vp = parseFloat(valorParcela);
      if (!descricao || !contaId || !categoriaId || isNaN(vt) || vt <= 0 || isNaN(vp) || vp <= 0) {
        setFormError("Preencha descrição, categoria, valor total e parcela de referência.");
        return;
      }
      setSaving(true);
      try {
        await updateFinanciamento(financiamento.id, {
          descricao,
          valor_total: vt,
          valor_parcela: vp,
          conta_id: Number(contaId),
          categoria_id: Number(categoriaId),
          observacoes: observacoes || null,
        });
        onSaved();
      } catch (err) {
        setFormError(getErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    const vt = parseFloat(valorTotal);
    const vp = parseFloat(valorParcela);
    const tp = parseInt(totalParcelas, 10);
    if (
      !descricao ||
      !dataPrimeira ||
      !contaId ||
      !categoriaId ||
      isNaN(vt) ||
      vt <= 0 ||
      isNaN(vp) ||
      vp <= 0 ||
      isNaN(tp) ||
      tp <= 0
    ) {
      setFormError("Preencha todos os campos obrigatórios, incluindo a categoria do orçamento.");
      return;
    }

    if (historicoEnabled && historicoRows.length > 0) {
      const errHist = validarPagamentosHistoricos(historicoRows, tp);
      if (errHist) {
        setFormError(errHist);
        return;
      }
    }

    const input: FinanciamentoInput = {
      descricao,
      valor_total: vt,
      valor_parcela: vp,
      total_parcelas: tp,
      contexto: resolveContexto(contexto, formContexto),
      conta_id: Number(contaId),
      categoria_id: Number(categoriaId),
      data_primeira_parcela: dataPrimeira,
      observacoes: observacoes || null,
    };

    setSaving(true);
    try {
      const created = await createFinanciamento(input);
      if (historicoEnabled && historicoRows.length > 0) {
        await aplicarPagamentosHistoricos(
          created.id,
          historicoRows.map((r) => ({
            numero_parcela: r.numero_parcela,
            valor_pago: r.valor,
            data_pagamento: r.data,
          })),
          { criar_transacao: historicoCriarTransacoes, conta_id: Number(contaId) },
        );
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const isEdit = !!financiamento;
  const vtPreview = parseFloat(valorTotal);
  const vpPreview = parseFloat(valorParcela);
  const tpPreview = parseInt(totalParcelas, 10);
  const mediaParcela =
    !isNaN(vtPreview) && !isNaN(tpPreview) && tpPreview > 0
      ? vtPreview / tpPreview
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar financiamento" : "Novo financiamento"}
      wide
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        <Input
          label="Valor total do contrato"
          type="number"
          step="0.01"
          min="0"
          value={valorTotal}
          onChange={(e) => setValorTotal(e.target.value)}
          required
        />
        <p className="-mt-2 text-xs text-slate-500">
          Como aparece no app do banco (ex.: R$ 68.684,46).
        </p>
        {!isEdit && (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Parcela de referência (orçamento)"
              type="number"
              step="0.01"
              min="0"
              value={valorParcela}
              onChange={(e) => setValorParcela(e.target.value)}
              required
            />
            <Input
              label="Quantidade de parcelas"
              type="number"
              min="1"
              value={totalParcelas}
              onChange={(e) => setTotalParcelas(e.target.value)}
              required
            />
          </div>
        )}
        {isEdit && (
          <Input
            label="Parcela de referência (orçamento)"
            type="number"
            step="0.01"
            min="0"
            value={valorParcela}
            onChange={(e) => setValorParcela(e.target.value)}
            required
          />
        )}
        {!isEdit && mediaParcela !== null && (
          <p className="app-muted-box px-3 py-2 text-sm">
            Média contábil: {formatCurrency(mediaParcela)} ({tpPreview} parcelas). O{" "}
            <strong>valor previsto</strong> de cada parcela será a parcela de referência (
            {!isNaN(vpPreview) && vpPreview > 0 ? formatCurrency(vpPreview) : "acima"}), não a média.
          </p>
        )}
        {isEdit && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Ao corrigir o valor total, as parcelas pendentes serão recalculadas. Pagamentos já
            registrados mantêm o valor real pago.
          </p>
        )}
        {!isEdit && (
          <Input
            label="Vencimento da 1ª parcela"
            type="date"
            value={dataPrimeira}
            onChange={(e) => setDataPrimeira(e.target.value)}
            required
          />
        )}
        {!isEdit && (
          <ParcelasHistoricasSection
            enabled={historicoEnabled}
            onEnabledChange={setHistoricoEnabled}
            quantidade={historicoQtd}
            onQuantidadeChange={setHistoricoQtd}
            totalParcelas={tpPreview || 0}
            valorReferencia={vpPreview || 0}
            dataPrimeiraParcela={dataPrimeira}
            rows={historicoRows}
            onRowsChange={setHistoricoRows}
            criarTransacoes={historicoCriarTransacoes}
            onCriarTransacoesChange={setHistoricoCriarTransacoes}
          />
        )}
        {isEdit && (
          <p className="app-muted-box px-3 py-2 text-sm">
            Quantidade de parcelas ({financiamento?.total_parcelas}) não pode ser alterada.
            Exclua e recadastre se necessário.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Conta para pagamento"
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            options={contas.map((c) => ({ value: String(c.id), label: c.nome }))}
          />
          <Select
            label="Categoria (orçamento) *"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            options={categorias.map((c) => ({ value: String(c.id), label: c.nome }))}
          />
        </div>
        {contexto === "consolidado" && !isEdit && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}
        <Textarea label="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        <p className="text-xs text-slate-500">
          A parcela entra no orçamento da categoria escolhida (comprometido). Ao criar, um
          envelope recorrente com o valor da parcela · gerado automaticamente.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PagamentoModal({
  open,
  onClose,
  financiamento,
  modoHistorico = false,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  financiamento: FinanciamentoResumo | null;
  modoHistorico?: boolean;
  onSaved: () => void;
}) {
  const [parcelas, setParcelas] = useState<FinanciamentoParcela[]>([]);
  const [selecionadas, setSelecionadas] = useState<Map<number, PagamentoSelecionado>>(new Map());
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [criarTransacoes, setCriarTransacoes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selecaoRapida, setSelecaoRapida] = useState<SelecaoRapida>("mes");

  useEffect(() => {
    async function load() {
      if (!financiamento || !open) return;
      setLoading(true);
      setCriarTransacoes(true);
      try {
        await sincronizarStatusParcelas(financiamento.id);
        const ps = await listParcelas(financiamento.id);
        setParcelas(ps);
        if (modoHistorico) {
          setSelecionadas(new Map());
          setSelecaoRapida("manual");
        } else {
          aplicarSelecaoRapida(ps, "mes");
        }
      } catch (err) {
        setFormError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [financiamento, open, modoHistorico]);

  function aplicarSelecaoRapida(ps: FinanciamentoParcela[], modo: SelecaoRapida) {
    if (modo === "manual") return;
    const filtradas = filtrarParcelasPorSelecao(ps, modo, mesAtual());
    const hoje = new Date().toISOString().slice(0, 10);
    const map = new Map<number, PagamentoSelecionado>();
    for (const p of filtradas) {
      map.set(p.id, { valor: p.valor_previsto, data: hoje });
    }
    setSelecionadas(map);
    setSelecaoRapida(modo);
  }

  function toggleParcela(p: FinanciamentoParcela, checked: boolean) {
    setSelecaoRapida("manual");
    setSelecionadas((prev) => {
      const next = new Map(prev);
      if (checked) next.set(p.id, prev.get(p.id) ?? { valor: p.valor_previsto, data: dataPagamento });
      else next.delete(p.id);
      return next;
    });
  }

  function setValorParcela(id: number, valor: number) {
    setSelecionadas((prev) => {
      const next = new Map(prev);
      const cur = prev.get(id);
      if (cur) next.set(id, { ...cur, valor });
      return next;
    });
  }

  function setDataParcela(id: number, data: string) {
    setSelecionadas((prev) => {
      const next = new Map(prev);
      const cur = prev.get(id);
      if (cur) next.set(id, { ...cur, data });
      return next;
    });
  }

  function aplicarDataGlobal(data: string) {
    setDataPagamento(data);
    setSelecionadas((prev) => {
      const next = new Map(prev);
      for (const [id, sel] of prev) {
        next.set(id, { ...sel, data });
      }
      return next;
    });
  }

  const pendentes = useMemo(
    () => parcelas.filter((p) => p.status !== "paga"),
    [parcelas],
  );

  const totalSelecionado = useMemo(
    () => Array.from(selecionadas.values()).reduce((s, v) => s + v.valor, 0),
    [selecionadas],
  );

  const pagas = useMemo(() => parcelas.filter((p) => p.status === "paga"), [parcelas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!financiamento) return;
    if (selecionadas.size === 0) {
      setFormError("Selecione ao menos uma parcela.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await pagarParcelas(financiamento.id, {
        criar_transacao: criarTransacoes,
        pagamentos: Array.from(selecionadas.entries()).map(([parcela_id, sel]) => ({
          parcela_id,
          valor_pago: sel.valor,
          data_pagamento: sel.data,
        })),
      });
      await onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!financiamento) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        modoHistorico
          ? `Registrar pagamentos anteriores · ${financiamento.descricao}`
          : `Pagar parcelas · ${financiamento.descricao}`
      }
      wide
    >
      {loading ? (
        <LoadingSpinner label="Carregando parcelas..." />
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {formError && <ErrorAlert message={formError} />}

          {modoHistorico && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Selecione as parcelas já pagas antes do cadastro e informe data e valor do extrato.
            </p>
          )}

          {!modoHistorico && (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["mes", "Parcela do mês"],
                ["ultima", "Última parcela"],
                ["mes_e_ultima", "Mês + última"],
                ["todas", "Todas pendentes"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                variant={selecaoRapida === key ? "primary" : "secondary"}
                className="py-1.5 text-xs"
                onClick={() => aplicarSelecaoRapida(parcelas, key)}
              >
                {label}
              </Button>
            ))}
          </div>
          )}

          <Input
            label="Data padrão (aplica às selecionadas)"
            type="date"
            value={dataPagamento}
            onChange={(e) => aplicarDataGlobal(e.target.value)}
          />

          {pagas.length > 0 && (
            <div className="app-muted-box px-3 py-2 text-xs">
              <strong>{pagas.length} parcela(s) já paga(s)</strong>
              {" · "}
              Total pago: {formatCurrency(pagas.reduce((s, p) => s + (p.valor_pago ?? 0), 0))}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 app-table-head">
                <tr>
                  <th className="px-3 py-2 font-medium" />
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                  <th className="px-3 py-2 font-medium">Previsto</th>
                  <th className="px-3 py-2 font-medium">Data pago</th>
                  <th className="px-3 py-2 font-medium">Valor pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendentes.map((p) => {
                  const checked = selecionadas.has(p.id);
                  const sel = selecionadas.get(p.id);
                  return (
                    <tr key={p.id} className={checked ? "bg-teal-50" : ""}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleParcela(p, e.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-2">{p.numero_parcela}</td>
                      <td className="px-3 py-2">
                        {formatDate(p.vencimento)}
                        {p.status === "atrasada" && (
                          <span className="ml-1 text-xs text-rose-600">atrasada</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{formatCurrency(p.valor_previsto)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          disabled={!checked}
                          value={checked ? (sel?.data ?? dataPagamento) : ""}
                          onChange={(e) => setDataParcela(p.id, e.target.value)}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700 disabled:opacity-50"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={!checked}
                          value={checked ? (sel?.valor ?? p.valor_previsto) : ""}
                          onChange={(e) => setValorParcela(p.id, parseFloat(e.target.value) || 0)}
                          className="w-28 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700 disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selecionadas.size > 0 && (
            <p className="text-sm font-medium text-slate-600">
              Total selecionado: {formatCurrency(totalSelecionado)}
              {Array.from(selecionadas.entries()).some(([id, sel]) => {
                const p = parcelas.find((x) => x.id === id);
                return p && sel.valor < p.valor_previsto;
              }) && (
                <span className="ml-2 text-green-600">(valor menor que previsto — antecipação)</span>
              )}
            </p>
          )}

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={criarTransacoes}
              onChange={(e) => setCriarTransacoes(e.target.checked)}
            />
            <span className="text-xs text-slate-400">
              Criar transações de despesa (desmarque se já lançou manualmente em Transações)
            </span>
          </label>

          <p className="text-xs text-slate-500">
            Informe a data real do débito e o valor exato do extrato. Pode pagar antes do vencimento
            com valor diferente do previsto.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || selecionadas.size === 0}>
              {saving ? "Processando..." : `Confirmar pagamento (${selecionadas.size})`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
