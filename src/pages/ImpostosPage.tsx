import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useConfirm } from "../components/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select, ValorInput } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import {
  TIPOS_TRIBUTO,
  descricaoPadraoImposto,
  labelTipoTributo,
  type TipoTributo,
} from "../constants/tiposImposto";
import { useContexto } from "../contexts/ContextoContext";
import { ensureCategoriaImpostos, listCategorias } from "../db/categorias";
import { listContas } from "../db/contas";
import {
  createImposto,
  deleteImposto,
  efetivarImposto,
  listImpostos,
  updateImposto,
  type ImpostoInput,
} from "../db/impostos";
import { garantirOrcamentoCategoriaMes } from "../db/orcamentos";
import { getErrorMessage, todayIsoDate } from "../db/utils";
import type { Imposto, StatusImposto } from "../types";
import { formatCurrency, formatDate, labelMes, labelStatusPagarReceber } from "../utils/format";

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  pago: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  atrasado: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
};

function mesAtual(): string {
  return todayIsoDate().slice(0, 7);
}

export function ImpostosPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Imposto[]>([]);
  const [contas, setContas] = useState<Awaited<ReturnType<typeof listContas>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Imposto | null>(null);
  const [efetivarItem, setEfetivarItem] = useState<Imposto | null>(null);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  const visivel = contexto === "empresa" || contexto === "consolidado";

  useEffect(() => {
    if (searchParams.get("nova") !== "1") return;
    setEditing(null);
    setModalOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const carregar = useCallback(async () => {
    if (!visivel) return;
    setLoading(true);
    setError(null);
    try {
      const [lista, c] = await Promise.all([
        listImpostos({
          contexto,
          status: filtroStatus ? (filtroStatus as StatusImposto) : undefined,
          tipo_tributo: filtroTipo || undefined,
        }),
        listContas(contexto === "consolidado" ? "empresa" : contexto),
      ]);
      setItems(lista);
      setContas(c.filter((x) => x.tipo !== "cartao_credito" && x.ativo));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto, filtroStatus, filtroTipo, visivel]);

  useEffect(() => {
    if (!ctxLoading && visivel) void carregar();
  }, [carregar, ctxLoading, visivel]);

  const totalAberto = useMemo(
    () =>
      items
        .filter((i) => i.status === "pendente" || i.status === "atrasado")
        .reduce((s, i) => s + i.valor, 0),
    [items],
  );

  if (!ctxLoading && !visivel) {
    return <Navigate to="/" replace />;
  }

  async function handleDelete(id: number) {
    if (!(await confirm("Excluir esta guia de imposto?"))) return;
    try {
      await deleteImposto(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Impostos"
        subtitle="Guias da empresa — DAS, FGTS, INSS e demais tributos. Parcelamentos ficam em Dívidas."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + Nova guia
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-4">
        <div className="max-w-xs flex-1">
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
        <div className="max-w-xs flex-1">
          <Select
            label="Tributo"
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            options={[
              { value: "", label: "Todos" },
              ...TIPOS_TRIBUTO.map((t) => ({ value: t.id, label: t.label })),
            ]}
          />
        </div>
      </div>

      {totalAberto > 0 && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-900">
          Em aberto: <strong>{formatCurrency(totalAberto)}</strong>
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
        <EmptyState message="Nenhuma guia cadastrada. Cadastre DAS, FGTS e outros impostos da empresa aqui." />
      ) : (
        <div className="overflow-hidden app-card">
          <table className="w-full text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Tributo</th>
                <th className="px-4 py-3 font-medium">Competência</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="app-table-row">
                  <td className="px-4 py-3 font-medium text-slate-900">{item.descricao}</td>
                  <td className="px-4 py-3 text-slate-600">{labelTipoTributo(item.tipo_tributo)}</td>
                  <td className="px-4 py-3 text-slate-600">{labelMes(item.competencia)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(item.vencimento)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] ?? ""}`}
                    >
                      {labelStatusPagarReceber(item.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(item.valor)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.status !== "pago" && (
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => setEfetivarItem(item)}
                        >
                          Pagar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() => {
                          setEditing(item);
                          setModalOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-rose-600"
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

      <ImpostoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        item={editing}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />

      {efetivarItem && (
        <EfetivarImpostoModal
          item={efetivarItem}
          contas={contas}
          onClose={() => setEfetivarItem(null)}
          onSaved={() => {
            setEfetivarItem(null);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

function ImpostoModal({
  open,
  onClose,
  item,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  item: Imposto | null;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<TipoTributo>("das");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [competencia, setCompetencia] = useState(mesAtual());
  const [vencimento, setVencimento] = useState("");
  const [codigoGuia, setCodigoGuia] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setTipo((item.tipo_tributo as TipoTributo) || "das");
      setDescricao(item.descricao);
      setValor(String(item.valor));
      setCompetencia(item.competencia);
      setVencimento(item.vencimento);
      setCodigoGuia(item.codigo_guia ?? "");
      setObservacoes(item.observacoes ?? "");
    } else {
      setTipo("das");
      setDescricao("");
      setValor("");
      setCompetencia(mesAtual());
      setVencimento("");
      setCodigoGuia("");
      setObservacoes("");
    }
    setFormError(null);
  }, [item, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valorNum = parseFloat(valor);
    if (!valor || isNaN(valorNum) || valorNum < 0 || !competencia || !vencimento) {
      setFormError("Preencha tributo, valor, competência e vencimento.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const cat = await ensureCategoriaImpostos();
      const input: ImpostoInput = {
        tipo_tributo: tipo,
        descricao:
          descricao.trim() || descricaoPadraoImposto(tipo, competencia),
        valor: valorNum,
        competencia,
        vencimento,
        contexto: "empresa",
        categoria_id: cat.id,
        codigo_guia: codigoGuia.trim() || null,
        observacoes: observacoes.trim() || null,
      };
      if (item) await updateImposto(item.id, input);
      else await createImposto(input);
      await garantirOrcamentoCategoriaMes(cat, competencia);
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? "Editar guia" : "Nova guia de imposto"}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Select
          label="Tributo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoTributo)}
          options={TIPOS_TRIBUTO.map((t) => ({ value: t.id, label: t.label }))}
        />
        <Input
          label="Descrição (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={descricaoPadraoImposto(tipo, competencia || mesAtual())}
        />
        <ValorInput
          label="Valor"
          min="0"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Competência"
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            required
          />
          <Input
            label="Vencimento"
            type="date"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
            required
          />
        </div>
        <Input
          label="Código / linha digitável (opcional)"
          value={codigoGuia}
          onChange={(e) => setCodigoGuia(e.target.value)}
          placeholder="Referência da guia"
        />
        <Input
          label="Observações (opcional)"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          A guia entra no orçamento da categoria Impostos no mês de competência.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EfetivarImpostoModal({
  item,
  contas,
  onClose,
  onSaved,
}: {
  item: Imposto;
  contas: Awaited<ReturnType<typeof listContas>>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [contaId, setContaId] = useState(contas[0] ? String(contas[0].id) : "");
  const [data, setData] = useState(todayIsoDate());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<{ id: number; nome: string }[]>([]);
  const [categoriaId, setCategoriaId] = useState(item.categoria_id ? String(item.categoria_id) : "");

  useEffect(() => {
    void listCategorias("empresa").then((cats) => {
      const desp = cats.filter((c) => c.tipo === "despesa");
      setCategorias(desp);
      if (!categoriaId && item.categoria_id) setCategoriaId(String(item.categoria_id));
      else if (!categoriaId) {
        const imp = desp.find((c) => c.nome.toLowerCase() === "impostos");
        if (imp) setCategoriaId(String(imp.id));
      }
    });
  }, [item.categoria_id, categoriaId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contaId) {
      setFormError("Selecione a conta de pagamento.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await efetivarImposto(item.id, {
        conta_id: Number(contaId),
        categoria_id: categoriaId ? Number(categoriaId) : item.categoria_id,
        data,
      });
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Pagar guia">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <p className="text-sm text-slate-600">
          {item.descricao} · <strong>{formatCurrency(item.valor)}</strong>
        </p>
        <Select
          label="Conta de pagamento"
          value={contaId}
          onChange={(e) => setContaId(e.target.value)}
          options={[
            { value: "", label: "Selecione" },
            ...contas.map((c) => ({ value: String(c.id), label: c.nome })),
          ]}
          required
        />
        <Select
          label="Categoria"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          options={[
            { value: "", label: "Selecione" },
            ...categorias.map((c) => ({ value: String(c.id), label: c.nome })),
          ]}
        />
        <Input
          label="Data do pagamento"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          required
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Registrando…" : "Confirmar pagamento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
