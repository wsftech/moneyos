import { useCallback, useEffect, useState } from "react";
import {
  ContextoFormSelect,
  defaultFormContexto,
  resolveContexto,
} from "./ContextoFormSelect";
import { ContextoBadge } from "./ContextoSelector";
import { useConfirm } from "./ConfirmDialog";
import { Button } from "./ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner } from "./ui/Feedback";
import { Input, Textarea, ValorInput } from "./ui/FormFields";
import { Modal } from "./ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import {
  createAtivoManual,
  deleteAtivoManual,
  listAtivosManuais,
  updateAtivoManual,
  type AtivoManual,
} from "../db/ativosManuais";
import { getErrorMessage } from "../db/utils";
import type { Contexto } from "../types";
import { formatCurrency } from "../utils/format";

/** Ativos fora do banco (imóvel, veículo…) — entram no patrimônio, não no caixa. */
export function AtivosManuaisSection() {
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const [itens, setItens] = useState<AtivoManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AtivoManual | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItens(await listAtivosManuais(contexto));
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
    if (!(await confirm("Excluir este ativo do patrimônio?"))) return;
    try {
      await deleteAtivoManual(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const total = itens.reduce((s, a) => s + a.valor, 0);

  return (
    <section className="mt-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Patrimônio fora do banco</h2>
          <p className="mt-1 text-sm text-slate-500">
            Imóvel, veículo e outros bens — entram no patrimônio líquido, não no caixa.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + Novo ativo
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}
      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : itens.length === 0 ? (
        <EmptyState message="Nenhum ativo manual. Cadastre imóvel, veículo ou outro bem para completar o patrimônio." />
      ) : (
        <div className="space-y-3">
          <div className="app-card p-4">
            <p className="text-xs text-slate-500">Total em ativos manuais</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(total)}</p>
          </div>
          <div className="overflow-hidden app-card">
            <table className="w-full text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  {contexto === "consolidado" && (
                    <th className="px-4 py-3 font-medium">Contexto</th>
                  )}
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((a) => (
                  <tr key={a.id} className="app-table-row">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{a.descricao}</p>
                      {a.observacoes && (
                        <p className="mt-0.5 text-xs text-slate-500">{a.observacoes}</p>
                      )}
                    </td>
                    {contexto === "consolidado" && (
                      <td className="px-4 py-3">
                        <ContextoBadge itemContexto={a.contexto} />
                      </td>
                    )}
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(a.valor)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={() => {
                            setEditing(a);
                            setModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-xs text-rose-600"
                          onClick={() => void handleDelete(a.id)}
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
        </div>
      )}

      <AtivoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ativo={editing}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />
    </section>
  );
}

function AtivoModal({
  open,
  onClose,
  ativo,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  ativo: AtivoManual | null;
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (ativo) {
      setFormContexto(ativo.contexto);
      setDescricao(ativo.descricao);
      setValor(String(ativo.valor));
      setObservacoes(ativo.observacoes ?? "");
    } else {
      setFormContexto(defaultFormContexto(contexto));
      setDescricao("");
      setValor("");
      setObservacoes("");
    }
    setFormError(null);
  }, [ativo, open, contexto]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const input = {
        descricao,
        valor: Number(valor),
        contexto: resolveContexto(contexto, formContexto),
        observacoes: observacoes.trim() || null,
      };
      if (ativo) await updateAtivoManual(ativo.id, input);
      else await createAtivoManual(input);
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={ativo ? "Editar ativo" : "Novo ativo"}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        {contexto === "consolidado" && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}
        <Input
          label="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: Apartamento, carro, terreno"
          required
        />
        <ValorInput
          label="Valor estimado"
          min="0"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
        />
        <Textarea
          label="Observações (opcional)"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
        />
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
