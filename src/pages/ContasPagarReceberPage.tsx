import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ContextoBadge } from "../components/ContextoSelector";
import {
  ContextoFormSelect,
  defaultFormContexto,
  resolveContexto,
} from "../components/ContextoFormSelect";
import { useConfirm } from "../components/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { filtrarCategoriasParaLancamento, findCategoriaById, listCategorias } from "../db/categorias";
import { listContas } from "../db/contas";
import {
  createContaPagarReceber,
  deleteContaPagarReceber,
  efetivarContaPagarReceber,
  listContasPagarReceber,
  updateContaPagarReceber,
  type ContaPagarReceberInput,
} from "../db/contasPagarReceber";
import { listContatos } from "../db/contatos";
import { getProgressoOrcamentoCategoria, type ProgressoOrcamentoCategoria } from "../db/orcamentos";
import { getErrorMessage } from "../db/utils";
import type { ContaPagarReceber, Contato, Contexto, TipoContaPagarReceber } from "../types";
import { formatCurrency, formatDate, labelMes, labelStatusPagarReceber } from "../utils/format";

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  pago: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  atrasado: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
};

export function ContasPagarReceberPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ContaPagarReceber[]>([]);
  const [contas, setContas] = useState<Awaited<ReturnType<typeof listContas>>>([]);
  const [categorias, setCategorias] = useState<Awaited<ReturnType<typeof listCategorias>>>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [efetivarItem, setEfetivarItem] = useState<ContaPagarReceber | null>(null);
  const [editing, setEditing] = useState<ContaPagarReceber | null>(null);
  const [filtroStatus, setFiltroStatus] = useState("");

  useEffect(() => {
    if (searchParams.get("nova") !== "1") return;
    setEditing(null);
    setModalOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [i, c, cat, cts] = await Promise.all([
        listContasPagarReceber({
          contexto,
          status: filtroStatus ? (filtroStatus as ContaPagarReceber["status"]) : undefined,
        }),
        listContas(contexto),
        listCategorias("consolidado"),
        listContatos(contexto),
      ]);
      setItems(i);
      setContas(c);
      setCategorias(cat);
      setContatos(cts);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto, filtroStatus]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  async function handleDelete(id: number) {
    if (!(await confirm("Excluir este lançamento?"))) return;
    try {
      await deleteContaPagarReceber(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Contas a pagar/receber"
        subtitle="Controle de vencimentos"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + Novo lançamento
          </Button>
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          label="Filtrar por status"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          options={[
            { value: "", label: "Todos" },
            { value: "pendente", label: "Pendente" },
            { value: "atrasado", label: "Atrasado" },
            { value: "pago", label: "Pago" },
          ]}
        />
      </div>

      {error && <div className="mb-4"><ErrorAlert message={error} /></div>}
      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <EmptyState message="Nenhum lançamento encontrado." />
      ) : (
        <div className="overflow-hidden app-card">
          <table className="w-full text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                {contexto === "consolidado" && (
                  <th className="px-4 py-3 font-medium">Contexto</th>
                )}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="app-table-row">
                  <td className="px-4 py-3 font-medium text-slate-700">
                    <div>{item.descricao}</div>
                    {item.contato_id != null && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {contatos.find((c) => c.id === item.contato_id)?.nome ?? "Contato"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {findCategoriaById(categorias, item.categoria_id)?.nome ?? "—"}
                  </td>
                  <td className="px-4 py-3">{formatDate(item.vencimento)}</td>
                  <td className="px-4 py-3 capitalize">{item.tipo}</td>
                  {contexto === "consolidado" && (
                    <td className="px-4 py-3">
                      <ContextoBadge itemContexto={item.contexto} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status]}`}
                    >
                      {labelStatusPagarReceber(item.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatCurrency(item.valor)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.status !== "pago" && (
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-emerald-700"
                          onClick={() => setEfetivarItem(item)}
                        >
                          {item.tipo === "pagar" ? "Marcar pago" : "Marcar recebido"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="px-2 py-1"
                        onClick={() => {
                          setEditing(item);
                          setModalOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-rose-600"
                        onClick={() => void handleDelete(item.id)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ItemModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        item={editing}
        categorias={categorias}
        contatos={contatos}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />

      <EfetivarModal
        open={!!efetivarItem}
        onClose={() => setEfetivarItem(null)}
        item={efetivarItem}
        contas={contas.filter(
          (c) => !efetivarItem || contexto === "consolidado" || c.contexto === efetivarItem.contexto,
        )}
        categorias={categorias}
        onSaved={() => {
          setEfetivarItem(null);
          void carregar();
        }}
      />
    </div>
  );
}

function ItemModal({
  open,
  onClose,
  item,
  categorias,
  contatos,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  item: ContaPagarReceber | null;
  categorias: Awaited<ReturnType<typeof listCategorias>>;
  contatos: Contato[];
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [tipo, setTipo] = useState<TipoContaPagarReceber>("pagar");
  const [categoriaId, setCategoriaId] = useState("");
  const [contatoId, setContatoId] = useState("");
  const [mesReferencia, setMesReferencia] = useState("");
  const [mesReferenciaManual, setMesReferenciaManual] = useState(false);
  const [preview, setPreview] = useState<ProgressoOrcamentoCategoria | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categoriasFiltradas = useMemo(
    () =>
      filtrarCategoriasParaLancamento(
        categorias,
        resolveContexto(contexto, formContexto),
        tipo === "pagar" ? "despesa" : "receita",
      ),
    [categorias, contexto, formContexto, tipo],
  );

  const contatosFiltrados = useMemo(
    () =>
      contatos.filter((c) => {
        if (tipo === "pagar") return c.tipo === "fornecedor" || c.tipo === "ambos";
        return c.tipo === "cliente" || c.tipo === "ambos";
      }),
    [contatos, tipo],
  );

  useEffect(() => {
    if (item) {
      setFormContexto(item.contexto);
      setDescricao(item.descricao);
      setValor(String(item.valor));
      setVencimento(item.vencimento);
      setTipo(item.tipo);
      setCategoriaId(item.categoria_id ? String(item.categoria_id) : "");
      setContatoId(item.contato_id ? String(item.contato_id) : "");
      setMesReferencia(item.mes_referencia ?? item.vencimento.slice(0, 7));
      setMesReferenciaManual(!!item.mes_referencia);
    } else {
      setFormContexto(defaultFormContexto(contexto));
      setDescricao("");
      setValor("");
      setVencimento("");
      setTipo("pagar");
      setCategoriaId("");
      setContatoId("");
      setMesReferencia("");
      setMesReferenciaManual(false);
    }
  }, [item, open, contexto]);

  useEffect(() => {
    if (!vencimento || mesReferenciaManual) return;
    setMesReferencia(vencimento.slice(0, 7));
  }, [vencimento, mesReferenciaManual]);

  useEffect(() => {
    if (!categoriaId || !mesReferencia) {
      setPreview(null);
      return;
    }

    const valorNum = parseFloat(valor);
    const ctx = resolveContexto(contexto, formContexto);
    let cancelled = false;

    async function carregarPreview() {
      setPreviewLoading(true);
      try {
        const progresso = await getProgressoOrcamentoCategoria(
          Number(categoriaId),
          ctx,
          mesReferencia,
          {
            excludeContaId: item?.id,
            valorExtra: !isNaN(valorNum) ? valorNum : 0,
          },
        );
        if (!cancelled) setPreview(progresso);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    void carregarPreview();
    return () => {
      cancelled = true;
    };
  }, [tipo, categoriaId, mesReferencia, valor, formContexto, contexto, item?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valorNum = parseFloat(valor);
    if (!descricao || !valor || isNaN(valorNum) || !vencimento) {
      setFormError("Preencha todos os campos.");
      return;
    }

    const input: ContaPagarReceberInput = {
      descricao,
      valor: valorNum,
      vencimento,
      tipo,
      contexto: resolveContexto(contexto, formContexto),
      categoria_id: categoriaId ? Number(categoriaId) : null,
      contato_id: contatoId ? Number(contatoId) : null,
      mes_referencia:
        categoriaId && mesReferencia && mesReferencia !== vencimento.slice(0, 7)
          ? mesReferencia
          : null,
    };

    setSaving(true);
    try {
      if (item) {
        await updateContaPagarReceber(item.id, input);
      } else {
        await createContaPagarReceber(input);
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? "Editar lançamento" : "Novo lançamento"}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        <Input label="Valor" type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} required />
        <Input label="Vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
        <Select
          label="Tipo"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as TipoContaPagarReceber);
            setCategoriaId("");
            setContatoId("");
          }}
          options={[
            { value: "pagar", label: "A pagar" },
            { value: "receber", label: "A receber" },
          ]}
        />
        <Select
          label={tipo === "pagar" ? "Fornecedor" : "Cliente"}
          value={contatoId}
          onChange={(e) => setContatoId(e.target.value)}
          options={[
            { value: "", label: "Sem contato" },
            ...contatosFiltrados.map((c) => ({ value: String(c.id), label: c.nome })),
          ]}
        />
        <p className="-mt-2 text-xs text-slate-500">
          Gerencie contatos em{" "}
          <Link to="/configuracoes/contatos" className="text-teal-700 hover:underline">
            Configurações → Contatos
          </Link>
        </p>
        <Select
          label="Categoria"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          options={[
            { value: "", label: "Sem categoria" },
            ...categoriasFiltradas.map((c) => ({ value: String(c.id), label: c.nome })),
          ]}
        />
        {categoriaId && (
          <>
            <Input
              label="Mês do orçamento"
              type="month"
              value={mesReferencia}
              onChange={(e) => {
                setMesReferenciaManual(true);
                setMesReferencia(e.target.value);
              }}
            />
            <p className="-mt-2 text-xs text-slate-500">
              {tipo === "pagar"
                ? "Para faturas de cartão, use o mês em que os gastos ocorreram (ex.: agosto), mesmo que o vencimento seja em outro mês."
                : "Use o mês em que a receita deve contar para a meta (ex.: mês da prestação do serviço)."}
            </p>
            <OrcamentoPreviewBox
              preview={preview}
              loading={previewLoading}
              mes={mesReferencia}
            />
          </>
        )}
        {contexto === "consolidado" && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function OrcamentoPreviewBox({
  preview,
  loading,
  mes,
}: {
  preview: ProgressoOrcamentoCategoria | null;
  loading: boolean;
  mes: string;
}) {
  if (loading) {
    return (
      <div className="app-muted-box px-3 py-3 text-sm">
        Carregando orçamento...
      </div>
    );
  }
  if (!preview) return null;

  const isReceita = preview.tipo_categoria === "receita";
  const estourou =
    !isReceita && preview.valor_limite != null && preview.total_usado > preview.valor_limite;
  const abaixoMeta =
    isReceita && preview.valor_limite != null && preview.total_usado < preview.valor_limite * 0.8;

  return (
    <div
      className={`rounded-lg border px-3 py-3 text-sm ${
        estourou
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : abaixoMeta
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-teal-200 bg-teal-50 text-teal-900"
      }`}
    >
      <p className="font-medium">
        {isReceita ? "Meta de receita" : "Orçamento"} — {labelMes(mes)}
      </p>
      {preview.valor_limite != null ? (
        <>
          <p className="mt-1">
            {formatCurrency(preview.total_usado)} de {formatCurrency(preview.valor_limite)} (
            {preview.percentual.toFixed(0)}% {isReceita ? "da meta" : "utilizado"})
          </p>
          <p className="mt-1 text-xs opacity-80">
            Realizado: {formatCurrency(preview.gasto)} · Comprometido:{" "}
            {formatCurrency(preview.comprometido)}
          </p>
          {preview.disponivel != null && (
            <p className="mt-1 text-xs opacity-80">
              {isReceita
                ? preview.disponivel > 0
                  ? `${formatCurrency(preview.disponivel)} faltando após este lançamento`
                  : `${formatCurrency(Math.abs(preview.disponivel))} acima da meta`
                : preview.disponivel >= 0
                  ? `${formatCurrency(preview.disponivel)} disponível após este lançamento`
                  : `${formatCurrency(Math.abs(preview.disponivel))} acima do limite`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs opacity-80">
          Sem {isReceita ? "meta" : "orçamento"} cadastrada para esta categoria. Comprometido
          previsto: {formatCurrency(preview.comprometido)} (inclui este lançamento).
        </p>
      )}
    </div>
  );
}

function EfetivarModal({
  open,
  onClose,
  item,
  contas,
  categorias,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  item: ContaPagarReceber | null;
  contas: Awaited<ReturnType<typeof listContas>>;
  categorias: Awaited<ReturnType<typeof listCategorias>>;
  onSaved: () => void;
}) {
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (item && open) {
      const contasCtx = contas.filter((c) => c.contexto === item.contexto);
      setContaId(contasCtx[0] ? String(contasCtx[0].id) : "");
      setCategoriaId(item.categoria_id ? String(item.categoria_id) : "");
      setData(new Date().toISOString().slice(0, 10));
    }
  }, [item, open, contas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !contaId) {
      setFormError("Selecione uma conta.");
      return;
    }
    setSaving(true);
    try {
      await efetivarContaPagarReceber(item.id, {
        conta_id: Number(contaId),
        categoria_id: categoriaId ? Number(categoriaId) : null,
        data,
      });
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!item) return null;

  const contasFiltradas = contas.filter((c) => c.contexto === item.contexto);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.tipo === "pagar" ? "Marcar como pago" : "Marcar como recebido"}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <p className="text-sm text-slate-600">
          {item.descricao} — <strong>{formatCurrency(item.valor)}</strong>
        </p>
        <p className="text-xs text-slate-500">
          Uma transação será criada automaticamente.
        </p>
        <Select
          label="Conta"
          value={contaId}
          onChange={(e) => setContaId(e.target.value)}
          options={contasFiltradas.map((c) => ({ value: String(c.id), label: c.nome }))}
        />
        <Select
          label="Categoria"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          options={[
            { value: "", label: "Sem categoria" },
            ...categorias
              .filter((c) => c.tipo === (item.tipo === "pagar" ? "despesa" : "receita"))
              .map((c) => ({ value: String(c.id), label: c.nome })),
          ]}
        />
        <Input label="Data da transação" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Processando..." : "Confirmar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
