import { useCallback, useEffect, useMemo, useState } from "react";
import { ContextoBadge } from "../components/ContextoSelector";
import { useConfirm } from "../components/ConfirmDialog";
import {
  ContextoFormSelect,
  defaultFormContexto,
  resolveContexto,
} from "../components/ContextoFormSelect";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select, ValorInput } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { findCategoriaById, listCategorias } from "../db/categorias";
import {
  aplicarLimiteMesesPosteriores,
  createOrcamento,
  copiarOrcamentosDoMesAnterior,
  deleteOrcamento,
  getOrcamentosComProgresso,
  garantirOrcamentosCategoriasNoMes,
  pararRecorrenciaOrcamento,
  updateOrcamento,
  type OrcamentoComProgresso,
  type OrcamentoInput,
} from "../db/orcamentos";
import { getErrorMessage } from "../db/utils";
import type { Contexto, TipoCategoria } from "../types";
import { formatCurrency, labelMes, mesAtual } from "../utils/format";
type AbaOrcamento = TipoCategoria;
export function OrcamentosPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const [mes, setMes] = useState(mesAtual());
  const [aba, setAba] = useState<AbaOrcamento>("despesa");
  const [orcamentos, setOrcamentos] = useState<OrcamentoComProgresso[]>([]);
  const [categorias, setCategorias] = useState<Awaited<ReturnType<typeof listCategorias>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrcamentoComProgresso | null>(null);
  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await garantirOrcamentosCategoriasNoMes(mes, contexto);
      const [o, cat] = await Promise.all([
        getOrcamentosComProgresso(contexto, mes),
        listCategorias("consolidado"),
      ]);
      setOrcamentos(o);
      setCategorias(cat);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto, mes]);
  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);
  const orcamentosAba = useMemo(
    () => orcamentos.filter((o) => o.tipo_categoria === aba),
    [orcamentos, aba],
  );
  const categoriasAba = useMemo(
    () => categorias.filter((c) => c.tipo === aba),
    [categorias, aba],
  );
  const totais = useMemo(() => {
    const limiteTotal = orcamentosAba.reduce((s, o) => s + o.valor_limite, 0);
    // Gasto/comprometido são por categoria: deduplicar irmãos no mesmo envelope
    const porCategoria = new Map<string, OrcamentoComProgresso>();
    for (const o of orcamentosAba) {
      const key = `${o.categoria_id}|${o.contexto}`;
      if (!porCategoria.has(key)) porCategoria.set(key, o);
    }
    const unicos = [...porCategoria.values()];
    const realizadoTotal = unicos.reduce((s, o) => s + o.gasto, 0);
    const comprometidoTotal = unicos.reduce((s, o) => s + o.comprometido, 0);
    const previstoTotal = unicos.reduce((s, o) => s + o.total_usado, 0);
    const percentual =
      limiteTotal > 0 ? Math.min((previstoTotal / limiteTotal) * 100, 999) : 0;
    const saldo = limiteTotal - previstoTotal;
    return {
      limiteTotal,
      realizadoTotal,
      comprometidoTotal,
      previstoTotal,
      percentual,
      saldo,
      alerta:
        aba === "despesa" ? previstoTotal > limiteTotal : previstoTotal < limiteTotal * 0.8,
    };
  }, [orcamentosAba, aba]);
  async function handleDelete(orc: OrcamentoComProgresso) {
    const cat = findCategoriaById(categorias, orc.categoria_id);
    if (
      !(await confirm({
        message: `Excluir "${tituloOrcamento(orc, cat)}" deste mês?`,
      }))
    ) {
      return;
    }
    let pararRecorrencia = false;
    if (orc.recorrente_id) {
      pararRecorrencia = await confirm({
        title: "Parar recorrência?",
        message:
          "Este item se repete todo mês. Deseja também parar a recorrência para os próximos meses?\n\nSe cancelar, remove só este mês e a recorrência continua.",
        confirmLabel: "Parar recorrência",
        cancelLabel: "Manter recorrência",
        tone: "danger",
      });
    }
    try {
      await deleteOrcamento(orc.id);
      if (pararRecorrencia && orc.recorrente_id) {
        await pararRecorrenciaOrcamento(orc.recorrente_id);
      }
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }
  async function handleCopiarMesAnterior() {
    try {
      await copiarOrcamentosDoMesAnterior(mes, contexto);
      await carregar();
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }
  function tituloOrcamento(orc: OrcamentoComProgresso, cat?: { nome: string }) {
    return cat?.nome || orc.descricao || `Categoria #${orc.categoria_id}`;
  }
  const isReceita = aba === "receita";
  return (
    <div>
      <PageHeader
        title="Orçamentos"
        subtitle={
          isReceita
            ? "Receita planejada do mês por categoria — realizado e a receber"
            : "Um limite por categoria. Despesas, Agenda, financiamentos, empréstimos e parcelamentos nela contam no mesmo envelope."
        }
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void handleCopiarMesAnterior()}>
              Copiar mês anterior
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              + Limite por categoria
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="max-w-xs flex-1">
          <Input
            label="Mês de referência"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              aba === "despesa"
                ? "bg-white text-teal-800 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setAba("despesa")}
          >
            Despesas
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              aba === "receita"
                ? "bg-white text-emerald-800 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setAba("receita")}
          >
            Receitas
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}
      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : orcamentosAba.length === 0 ? (
        <EmptyState
          message={
            isReceita
              ? `Nenhuma receita planejada para ${labelMes(mes)}.`
              : `Nenhum orçamento de despesa para ${labelMes(mes)}.`
          }
        />
      ) : (
        <div className="space-y-4">
          {!isReceita && (
            <div
              className={`app-card p-5 ${
                totais.saldo >= 0 ? "border-emerald-200" : "border-rose-200"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {totais.saldo >= 0
                  ? "Você economizou"
                  : "Você estourou o orçamento em"}
              </p>
              <p
                className={`mt-1 text-3xl font-bold tracking-tight ${
                  totais.saldo >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatCurrency(Math.abs(totais.saldo))}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Limite {formatCurrency(totais.limiteTotal)} − já usado/comprometido{" "}
                {formatCurrency(totais.previstoTotal)}. É o “envelope” do mês — não o saldo do banco.
              </p>
            </div>
          )}
          <div className="app-card p-5">
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <ResumoCard
                title={isReceita ? "Planejado total" : "Limite total"}
                value={formatCurrency(totais.limiteTotal)}
                subtitle={`${orcamentosAba.length} categoria(s) com ${isReceita ? "receita planejada" : "orçamento"}`}
                accent="indigo"
              />
              <ResumoCard
                title="Realizado"
                value={formatCurrency(totais.realizadoTotal)}
                subtitle={
                  totais.comprometidoTotal > 0
                    ? `+ ${formatCurrency(totais.comprometidoTotal)} comprometido${isReceita ? " (a receber)" : " (agenda / recorrentes / dívidas)"}`
                    : isReceita
                      ? "Receitas efetivadas no mês"
                      : "Despesas efetivadas no mês"
                }
                accent="amber"
              />
              <ResumoCard
                title={isReceita ? "Previsto vs planejado" : "Utilizado vs limite"}
                value={formatCurrency(totais.previstoTotal)}
                subtitle={
                  isReceita
                    ? totais.saldo > 0
                      ? `${formatCurrency(totais.saldo)} faltando para o planejado`
                      : `${formatCurrency(Math.abs(totais.saldo))} acima do planejado`
                    : totais.saldo >= 0
                      ? `${formatCurrency(totais.saldo)} ainda disponível`
                      : `${formatCurrency(Math.abs(totais.saldo))} acima do limite`
                }
                accent={totais.alerta ? "red" : "green"}
              />
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  isReceita
                    ? totais.percentual >= 80
                      ? "bg-gradient-to-r from-emerald-400 to-cyan-500"
                      : "bg-gradient-to-r from-amber-400 to-orange-500"
                    : totais.alerta
                      ? "bg-gradient-to-r from-rose-500 to-orange-500"
                      : totais.percentual >= 80
                        ? "bg-gradient-to-r from-amber-400 to-orange-500"
                        : "bg-gradient-to-r from-emerald-400 to-cyan-500"
                }`}
                style={{ width: `${Math.min(totais.percentual, 100)}%` }}
              />
            </div>
            <p
              className={`mt-2 text-right text-xs ${
                totais.alerta ? "font-medium text-rose-600" : "text-slate-500"
              }`}
            >
              {totais.percentual.toFixed(0)}% {isReceita ? "do planejado" : "do limite utilizado"}
              {totais.alerta &&
                (isReceita ? " — abaixo do planejado!" : " — orçamento geral excedido!")}
            </p>
          </div>
          {orcamentosAba.map((orc) => {
            const cat = findCategoriaById(categorias, orc.categoria_id);
            const pct = Math.min(orc.percentual, 100);
            const alertaItem =
              orc.tipo_categoria === "receita"
                ? orc.valor_limite > 0 && orc.total_usado < orc.valor_limite * 0.8
                : orc.valor_limite > 0 && orc.total_usado > orc.valor_limite;
            const atencaoItem =
              orc.tipo_categoria === "despesa" &&
              !alertaItem &&
              orc.valor_limite > 0 &&
              orc.percentual >= 80;
            const semLimite = orc.valor_limite <= 0;
            return (
              <div key={orc.id} className="app-card p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{tituloOrcamento(orc, cat)}</p>
                    {orc.recorrente_id && (
                      <span className="mt-1 inline-block rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-200">
                        Recorrente
                      </span>
                    )}
                    <p className="text-sm text-slate-500">
                      {semLimite
                        ? `${formatCurrency(orc.total_usado)} usados · defina o limite`
                        : `${formatCurrency(orc.total_usado)} de ${formatCurrency(orc.valor_limite)}`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Realizado: {formatCurrency(orc.gasto)}
                      {orc.comprometido > 0 && (
                        <> · Comprometido: {formatCurrency(orc.comprometido)}</>
                      )}
                    </p>
                    {semLimite && (
                      <p className="mt-1 text-xs font-medium text-amber-800">
                        Orçamento da categoria sem limite — edite para acompanhar o teto.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {contexto === "consolidado" && (
                      <ContextoBadge itemContexto={orc.contexto} />
                    )}
                    <Button
                      variant="ghost"
                      className="px-2 py-1"
                      onClick={() => {
                        setEditing(orc);
                        setModalOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-rose-600"
                      onClick={() => void handleDelete(orc)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      orc.tipo_categoria === "receita"
                        ? orc.percentual >= 80
                          ? "bg-gradient-to-r from-emerald-400 to-cyan-500"
                          : "bg-gradient-to-r from-amber-400 to-orange-500"
                        : alertaItem
                          ? "bg-gradient-to-r from-rose-500 to-orange-500"
                          : atencaoItem
                            ? "bg-gradient-to-r from-amber-400 to-orange-500"
                            : "bg-gradient-to-r from-emerald-400 to-cyan-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p
                  className={`mt-1 text-right text-xs ${
                    alertaItem ? "font-medium text-rose-600" : "text-slate-500"
                  }`}
                >
                  {orc.percentual.toFixed(0)}% {isReceita ? "do planejado" : "utilizado"}
                  {alertaItem &&
                    (isReceita ? " — abaixo do planejado!" : " — limite excedido!")}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <OrcamentoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        orcamento={editing}
        mes={mes}
        tipoOrcamento={editing?.tipo_categoria ?? aba}
        categorias={categoriasAba}
        orcamentosMes={orcamentosAba}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />
    </div>
  );
}
function ResumoCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent: "indigo" | "amber" | "green" | "red";
}) {
  const colors = {
    indigo: "border-teal-200 bg-teal-50 text-teal-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-rose-200 bg-rose-50 text-rose-900",
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[accent]}`}>
      <p className="text-xs font-medium text-slate-600">{title}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
    </div>
  );
}
function OrcamentoModal({
  open,
  onClose,
  orcamento,
  mes,
  tipoOrcamento,
  categorias,
  orcamentosMes,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orcamento: OrcamentoComProgresso | null;
  mes: string;
  tipoOrcamento: TipoCategoria;
  categorias: Awaited<ReturnType<typeof listCategorias>>;
  orcamentosMes: OrcamentoComProgresso[];
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const confirm = useConfirm();
  const isReceita = tipoOrcamento === "receita";
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [categoriaId, setCategoriaId] = useState("");
  const [mesRef, setMesRef] = useState(mes);
  const [valorLimite, setValorLimite] = useState("");
  const [atualizarRecorrente, setAtualizarRecorrente] = useState(true);
  const [aplicarPosteriores, setAplicarPosteriores] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (orcamento) {
      setFormContexto(orcamento.contexto);
      setCategoriaId(String(orcamento.categoria_id));
      setMesRef(orcamento.mes_referencia);
      setValorLimite(orcamento.valor_limite > 0 ? String(orcamento.valor_limite) : "");
      setAtualizarRecorrente(true);
      setAplicarPosteriores(true);
    } else {
      setFormContexto(defaultFormContexto(contexto));
      setCategoriaId(categorias[0] ? String(categorias[0].id) : "");
      setMesRef(mes);
      setValorLimite("");
      setAtualizarRecorrente(true);
      setAplicarPosteriores(true);
    }
    setFormError(null);
  }, [orcamento, open, contexto, categorias, mes]);

  const previewCategoria = useMemo(() => {
    const ctx = resolveContexto(contexto, formContexto);
    const catId = Number(categoriaId);
    const novoLimite = parseFloat(valorLimite);
    const limite = !isNaN(novoLimite) ? novoLimite : 0;

    if (!catId) {
      return { limite, realizado: 0, previsto: 0 };
    }

    const daCategoria = orcamentosMes.filter(
      (o) =>
        o.mes_referencia === mesRef &&
        o.contexto === ctx &&
        o.categoria_id === catId,
    );
    const amostra =
      daCategoria.find((o) => o.id === orcamento?.id) ?? daCategoria[0] ?? null;

    return {
      limite,
      realizado: amostra?.gasto ?? 0,
      previsto: amostra?.total_usado ?? 0,
    };
  }, [
    orcamentosMes,
    mesRef,
    formContexto,
    contexto,
    orcamento,
    valorLimite,
    categoriaId,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valor = parseFloat(valorLimite);
    if (!categoriaId || !valorLimite || isNaN(valor)) {
      setFormError("Informe a categoria e o limite.");
      return;
    }

    const ctx = resolveContexto(contexto, formContexto);
    const catId = Number(categoriaId);

    const input: OrcamentoInput = {
      categoria_id: catId,
      contexto: ctx,
      mes_referencia: mesRef,
      valor_limite: valor,
      descricao: null,
      recorrente: false,
      atualizar_recorrente: orcamento?.recorrente_id ? atualizarRecorrente : undefined,
    };
    setSaving(true);
    try {
      if (aplicarPosteriores) {
        await aplicarLimiteMesesPosteriores(catId, ctx, mesRef, valor);
        if (orcamento?.recorrente_id && atualizarRecorrente) {
          await updateOrcamento(orcamento.id, {
            ...input,
            atualizar_recorrente: true,
          });
        }
      } else if (orcamento) {
        await updateOrcamento(orcamento.id, input);
      } else {
        const existente = orcamentosMes.find(
          (o) =>
            o.mes_referencia === mesRef &&
            o.contexto === ctx &&
            o.categoria_id === catId &&
            o.recorrente_id == null,
        );
        if (existente) {
          await updateOrcamento(existente.id, input);
        } else {
          await createOrcamento(input);
        }
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePararRecorrencia() {
    if (!orcamento?.recorrente_id) return;
    if (
      !(await confirm({
        title: "Parar recorrência",
        message:
          "O limite deixa de ser recriado automaticamente nos próximos meses. Os meses já cadastrados permanecem.",
        confirmLabel: "Parar recorrência",
        tone: "danger",
      }))
    ) {
      return;
    }
    setSaving(true);
    try {
      await pararRecorrenciaOrcamento(orcamento.recorrente_id);
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        orcamento
          ? isReceita
            ? "Editar receita planejada"
            : "Editar limite da categoria"
          : isReceita
            ? "Receita planejada por categoria"
            : "Limite por categoria"
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Select
          label="Categoria"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          options={categorias.map((c) => ({ value: String(c.id), label: c.nome }))}
          required
        />
        <Input label="Mês" type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
        <ValorInput
          label={isReceita ? "Valor planejado" : "Valor limite"}
          min="0"
          value={valorLimite}
          onChange={(e) => setValorLimite(e.target.value)}
          required
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={aplicarPosteriores}
            onChange={(e) => setAplicarPosteriores(e.target.checked)}
          />
          <div>
            <span className="text-sm font-medium text-slate-800">
              Aplicar a todos os meses posteriores
            </span>
            <p className="mt-0.5 text-xs text-slate-500">
              Usa este {isReceita ? "planejado" : "limite"} a partir de {labelMes(mesRef)}, inclusive
              nos meses futuros ainda sem envelope.
            </p>
          </div>
        </label>
        {orcamento?.recorrente_id && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={atualizarRecorrente}
              onChange={(e) => setAtualizarRecorrente(e.target.checked)}
            />
            <div>
              <span className="text-sm font-medium text-teal-900">Atualizar todos os meses</span>
              <p className="mt-0.5 text-xs text-teal-800">
                Propaga o limite para este e os próximos meses desta recorrência antiga.
              </p>
            </div>
          </label>
        )}
        {(categoriaId || valorLimite) && (
          <div className="app-muted-box px-3 py-3 text-sm text-slate-600">
            <p className="text-xs text-slate-500">
              Resumo só desta categoria (lançamentos, agenda e dívidas nela).
            </p>
            <p className="mt-1">
              <span className="text-slate-500">
                {isReceita ? "Planejado:" : "Limite:"}
              </span>{" "}
              <strong>{formatCurrency(previewCategoria.limite)}</strong>
            </p>
            <p className="mt-1">
              <span className="text-slate-500">Realizado:</span>{" "}
              <strong>{formatCurrency(previewCategoria.realizado)}</strong>
            </p>
            <p className="mt-1">
              <span className="text-slate-500">Previsto (realizado + comprometido):</span>{" "}
              <strong>{formatCurrency(previewCategoria.previsto)}</strong>
              {previewCategoria.limite > 0 && (
                <span className="text-xs text-slate-500">
                  {" "}
                  (
                  {Math.min(
                    (previewCategoria.previsto / previewCategoria.limite) * 100,
                    999,
                  ).toFixed(0)}
                  % {isReceita ? "do planejado" : "do limite"})
                </span>
              )}
            </p>
          </div>
        )}
        {contexto === "consolidado" && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}
        {orcamento?.recorrente_id && (
          <div className="flex justify-start">
            <Button
              type="button"
              variant="ghost"
              className="text-rose-600"
              disabled={saving}
              onClick={() => void handlePararRecorrencia()}
            >
              Parar recorrência
            </Button>
          </div>
        )}
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
