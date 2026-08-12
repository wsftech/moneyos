import { useCallback, useEffect, useState } from "react";
import { ContextoBadge } from "../components/ContextoSelector";
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
import { listContas } from "../db/contas";
import {
  createMetaFinanceira,
  deleteMetaFinanceira,
  listMetasFinanceiras,
  updateMetaFinanceira,
  type MetaFinanceiraInput,
} from "../db/metas";
import { getErrorMessage } from "../db/utils";
import type { Contexto, MetaFinanceiraComProgresso } from "../types";
import { formatCurrency, formatDate } from "../utils/format";

const CORES = ["#6366f1", "#22c55e", "#f59e0b", "#06b6d4", "#ec4899"];

export function MetasPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const [metas, setMetas] = useState<MetaFinanceiraComProgresso[]>([]);
  const [contas, setContas] = useState<Awaited<ReturnType<typeof listContas>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MetaFinanceiraComProgresso | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, c] = await Promise.all([listMetasFinanceiras(contexto), listContas(contexto)]);
      setMetas(m);
      setContas(c);
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
    if (!confirm("Excluir esta meta?")) return;
    try {
      await deleteMetaFinanceira(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Metas"
        subtitle="Reserva de emergência, objetivos e metas financeiras"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + Nova meta
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : metas.length === 0 ? (
        <EmptyState message="Nenhuma meta cadastrada. Crie uma meta de reserva ou objetivo." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metas.map((meta) => {
            const pct = Math.min(meta.percentual, 100);
            const concluida = meta.valor_atual_efetivo >= meta.valor_alvo;
            return (
              <div key={meta.id} className="app-card p-5" style={{ borderTopColor: meta.cor, borderTopWidth: 3 }}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{meta.nome}</h3>
                    {meta.prazo && (
                      <p className="text-xs text-slate-500">Prazo: {formatDate(meta.prazo)}</p>
                    )}
                    {meta.conta_id && (
                      <p className="text-xs text-cyan-400/80">Vinculada à conta · saldo automático</p>
                    )}
                  </div>
                  {contexto === "consolidado" && <ContextoBadge itemContexto={meta.contexto} />}
                </div>
                <p className="text-sm text-slate-400">
                  {formatCurrency(meta.valor_atual_efetivo)} de {formatCurrency(meta.valor_alvo)}
                </p>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${concluida ? "bg-gradient-to-r from-emerald-400 to-teal-500" : "bg-gradient-to-r from-teal-500 to-teal-700"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-slate-500">{meta.percentual.toFixed(0)}%</p>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 py-1.5"
                    onClick={() => {
                      setEditing(meta);
                      setModalOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-rose-600"
                    onClick={() => void handleDelete(meta.id)}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MetaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        meta={editing}
        contas={contas}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />
    </div>
  );
}

function MetaModal({
  open,
  onClose,
  meta,
  contas,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  meta: MetaFinanceiraComProgresso | null;
  contas: Awaited<ReturnType<typeof listContas>>;
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [nome, setNome] = useState("");
  const [valorAlvo, setValorAlvo] = useState("");
  const [valorAtual, setValorAtual] = useState("0");
  const [contaId, setContaId] = useState("");
  const [prazo, setPrazo] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (meta) {
      setFormContexto(meta.contexto);
      setNome(meta.nome);
      setValorAlvo(String(meta.valor_alvo));
      setValorAtual(String(meta.valor_atual));
      setContaId(meta.conta_id ? String(meta.conta_id) : "");
      setPrazo(meta.prazo ?? "");
      setCor(meta.cor);
    } else {
      setFormContexto(defaultFormContexto(contexto));
      setNome("");
      setValorAlvo("");
      setValorAtual("0");
      setContaId("");
      setPrazo("");
      setCor(CORES[0]);
    }
  }, [meta, open, contexto]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const alvo = parseFloat(valorAlvo);
    const atual = parseFloat(valorAtual) || 0;
    if (!nome || isNaN(alvo) || alvo <= 0) {
      setFormError("Informe nome e valor alvo válido.");
      return;
    }

    const input: MetaFinanceiraInput = {
      nome,
      valor_alvo: alvo,
      valor_atual: contaId ? 0 : atual,
      contexto: resolveContexto(contexto, formContexto),
      conta_id: contaId ? Number(contaId) : null,
      prazo: prazo || null,
      cor,
    };

    setSaving(true);
    try {
      if (meta) {
        await updateMetaFinanceira(meta.id, input);
      } else {
        await createMetaFinanceira(input);
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const contasFiltradas = contas.filter(
    (c) => contexto === "consolidado" || c.contexto === contexto,
  );

  return (
    <Modal open={open} onClose={onClose} title={meta ? "Editar meta" : "Nova meta"}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Valor alvo"
            type="number"
            step="0.01"
            min="0"
            value={valorAlvo}
            onChange={(e) => setValorAlvo(e.target.value)}
            required
          />
          {!contaId && (
            <Input
              label="Valor atual (manual)"
              type="number"
              step="0.01"
              min="0"
              value={valorAtual}
              onChange={(e) => setValorAtual(e.target.value)}
            />
          )}
        </div>
        {contexto === "consolidado" && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}
        <Select
          label="Vincular à conta (opcional)"
          value={contaId}
          onChange={(e) => setContaId(e.target.value)}
          options={[
            { value: "", label: "Progresso manual" },
            ...contasFiltradas.map((c) => ({ value: String(c.id), label: c.nome })),
          ]}
        />
        <Input label="Prazo (opcional)" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">Cor</p>
          <div className="flex gap-2">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                className={`h-8 w-8 rounded-full border-2 ring-offset-2 ${cor === c ? "border-slate-900 ring-2 ring-slate-900/30" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
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
