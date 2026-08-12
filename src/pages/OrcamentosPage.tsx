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
import { Input, Select } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { findCategoriaById, listCategorias } from "../db/categorias";
import {
  createOrcamento,
  copiarOrcamentosDoMesAnterior,
  deleteOrcamento,
  getOrcamentosComProgresso,
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
    return orc.descricao || cat?.nome || `Categoria #${orc.categoria_id}`;
  }
  const isReceita = aba === "receita";
  return (
    <div>
      <PageHeader
        title="Or�amentos"
        subtitle={
          isReceita
            ? "Metas mensais de receita com realizado e valores a receber"
            : "Limites mensais por categoria ou item fixo (ex.: aluguel)"
        }
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void handleCopiarMesAnterior()}>
              Copiar m�s anterior
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              + Novo or�amento
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="max-w-xs flex-1">
          <Input
            label="M�s de refer�ncia"
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
              ? `Nenhuma meta de receita para ${labelMes(mes)}.`
              : `Nenhum orçamento de despesa para ${labelMes(mes)}.`
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="app-card p-5">
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <ResumoCard
                title={isReceita ? "Meta total" : "Limite total"}
                value={formatCurrency(totais.limiteTotal)}
                subtitle={`${orcamentosAba.length} item(ns) com ${isReceita ? "meta" : "orçamento"}`}
                accent="indigo"
              />
              <ResumoCard
                title="Realizado"
                value={formatCurrency(totais.realizadoTotal)}
                subtitle={
                  totais.comprometidoTotal > 0
                    ? `+ ${formatCurrency(totais.comprometidoTotal)} comprometido${isReceita ? " (a receber)" : " (financ./emprést./a pagar)"}`
                    : isReceita
                      ? "Receitas efetivadas no mês"
                      : "Despesas efetivadas no mês"
                }
                accent="amber"
              />
              <ResumoCard
                title={isReceita ? "Previsto vs meta" : "Utilizado vs limite"}
                value={formatCurrency(totais.previstoTotal)}
                subtitle={
                  isReceita
                    ? totais.saldo > 0
                      ? `${formatCurrency(totais.saldo)} faltando para a meta`
                      : `${formatCurrency(Math.abs(totais.saldo))} acima da meta`
                    : totais.saldo >= 0
                      ? `${formatCurrency(totais.saldo)} disponível`
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
              {totais.percentual.toFixed(0)}% {isReceita ? "da meta prevista" : "do limite utilizado"}
              {totais.alerta &&
                (isReceita ? " — abaixo da meta!" : " — orçamento geral excedido!")}
            </p>
          </div>
          {orcamentosAba.map((orc) => {
            const cat = findCategoriaById(categorias, orc.categoria_id);
            const pct = Math.min(orc.percentual, 100);
            const alertaItem =
              orc.tipo_categoria === "receita"
                ? orc.total_usado < orc.valor_limite * 0.8
                : orc.total_usado > orc.valor_limite;
            const atencaoItem =
              orc.tipo_categoria === "despesa" &&
              !alertaItem &&
              orc.percentual >= 80;
            return (
              <div key={orc.id} className="app-card p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{tituloOrcamento(orc, cat)}</p>
                    {orc.descricao && cat && (
                      <p className="text-xs text-slate-500">{cat.nome}</p>
                    )}
                    {orc.recorrente_id && (
                      <span className="mt-1 inline-block rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-200">
                        Recorrente
                      </span>
                    )}
                    <p className="text-sm text-slate-500">
                      {formatCurrency(orc.total_usado)} de {formatCurrency(orc.valor_limite)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Realizado: {formatCurrency(orc.gasto)}
                      {orc.comprometido > 0 && (
                        <> · Comprometido: {formatCurrency(orc.comprometido)}</>
                      )}
                    </p>
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
                  {orc.percentual.toFixed(0)}% {isReceita ? "da meta" : "utilizado"}
                  {alertaItem &&
                    (isReceita ? " — abaixo da meta!" : " — limite excedido!")}
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
  const [descricao, setDescricao] = useState("");
  const [recorrente, setRecorrente] = useState(false);
  const [atualizarRecorrente, setAtualizarRecorrente] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    if (orcamento) {
      setFormContexto(orcamento.contexto);
      setCategoriaId(String(orcamento.categoria_id));
      setMesRef(orcamento.mes_referencia);
      setValorLimite(String(orcamento.valor_limite));
      setDescricao(orcamento.descricao ?? "");
      setRecorrente(!!orcamento.recorrente_id);
      setAtualizarRecorrente(true);
    } else {
      setFormContexto(defaultFormContexto(contexto));
      setCategoriaId(categorias[0] ? String(categorias[0].id) : "");
      setMesRef(mes);
      setValorLimite("");
      setDescricao("");
      setRecorrente(false);
      setAtualizarRecorrente(true);
    }
  }, [orcamento, open, contexto, categorias, mes]);
  const previewTotais = useMemo(() => {
    const ctx = resolveContexto(contexto, formContexto);
    const doMes = orcamentosMes.filter((o) => o.mes_referencia === mesRef && o.contexto === ctx);
    const outros = doMes.filter((o) => o.id !== orcamento?.id);
    const novoLimite = parseFloat(valorLimite);
    const limiteTotal =
      outros.reduce((s, o) => s + o.valor_limite, 0) + (isNaN(novoLimite) ? 0 : novoLimite);
    const realizadoTotal = doMes.reduce((s, o) => s + o.gasto, 0);
    const previstoTotal = doMes.reduce((s, o) => s + o.total_usado, 0);
    return { limiteTotal, realizadoTotal, previstoTotal };
  }, [orcamentosMes, mesRef, formContexto, contexto, orcamento, valorLimite]);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valor = parseFloat(valorLimite);
    if (!categoriaId || !valorLimite || isNaN(valor)) {
      setFormError("Preencha todos os campos.");
      return;
    }
    if (recorrente && !orcamento && !descricao.trim()) {
      setFormError(
        isReceita
          ? "Informe a descrição do item recorrente (ex.: Mensalidade clientes)."
          : "Informe a descrição do item recorrente (ex.: Aluguel).",
      );
      return;
    }
    const input: OrcamentoInput = {
      categoria_id: Number(categoriaId),
      contexto: resolveContexto(contexto, formContexto),
      mes_referencia: mesRef,
      valor_limite: valor,
      descricao: descricao.trim() || null,
      recorrente: !orcamento && recorrente,
      atualizar_recorrente: orcamento?.recorrente_id ? atualizarRecorrente : undefined,
    };
    setSaving(true);
    try {
      if (orcamento) {
        await updateOrcamento(orcamento.id, input);
      } else {
        await createOrcamento(input);
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
          "O item deixa de ser criado automaticamente nos próximos meses. Os meses já cadastrados permanecem.",
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
            ? "Editar meta de receita"
            : "Editar orçamento"
          : isReceita
            ? "Nova meta de receita"
            : "Novo orçamento"
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Input
          label="Descrição do item"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={
            isReceita ? "Ex.: Mensalidade, Serviços, Vendas" : "Ex.: Aluguel, Internet, Condomínio"
          }
        />
        <Select
          label="Categoria"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          options={categorias.map((c) => ({ value: String(c.id), label: c.nome }))}
        />
        <Input label="Mês" type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
        <Input
          label={isReceita ? "Valor da meta" : "Valor limite"}
          type="number"
          step="0.01"
          min="0"
          value={valorLimite}
          onChange={(e) => setValorLimite(e.target.value)}
          required
        />
        {!orcamento && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={recorrente}
              onChange={(e) => setRecorrente(e.target.checked)}
            />
            <div>
              <span className="text-sm font-medium text-slate-700">Repetir todo mês</span>
              <p className="mt-0.5 text-xs text-slate-500">
                {isReceita
                  ? "Ideal para receitas recorrentes como mensalidades. A meta será recriada automaticamente nos meses seguintes."
                  : "Ideal para despesas fixas como aluguel. O limite será recriado automaticamente nos meses seguintes."}
              </p>
            </div>
          </label>
        )}
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
                Propaga valor e descrição para este e os próximos meses deste item recorrente.
              </p>
            </div>
          </label>
        )}
        {(valorLimite || orcamentosMes.length > 0) && (
          <div className="app-muted-box px-3 py-3 text-sm text-slate-600">
            <p>
              <span className="text-slate-500">
                {isReceita ? "Meta total do mês:" : "Limite total do mês:"}
              </span>{" "}
              <strong>{formatCurrency(previewTotais.limiteTotal)}</strong>
            </p>
            <p className="mt-1">
              <span className="text-slate-500">Realizado no mês:</span>{" "}
              <strong>{formatCurrency(previewTotais.realizadoTotal)}</strong>
            </p>
            {previewTotais.limiteTotal > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Previsto (realizado + comprometido): {formatCurrency(previewTotais.previstoTotal)} (
                {Math.min((previewTotais.previstoTotal / previewTotais.limiteTotal) * 100, 999).toFixed(0)}
                % {isReceita ? "da meta" : "do limite"})
              </p>
            )}
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
