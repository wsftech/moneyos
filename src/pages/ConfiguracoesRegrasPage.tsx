import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner } from "../components/ui/Feedback";
import { Input, Select } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { findCategoriaById, listCategorias } from "../db/categorias";
import {
  createRegraCategorizacao,
  deleteRegraCategorizacao,
  listRegrasCategorizacao,
  updateRegraCategorizacao,
  type RegraCategorizacaoInput,
} from "../db/regrasCategorizacao";
import { getErrorMessage } from "../db/utils";
import type { ContextoCategoria, RegraCategorizacao } from "../types";

export function ConfiguracoesRegrasPage() {
  const { loading: ctxLoading } = useContexto();
  const [regras, setRegras] = useState<RegraCategorizacao[]>([]);
  const [categorias, setCategorias] = useState<Awaited<ReturnType<typeof listCategorias>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RegraCategorizacao | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, cat] = await Promise.all([
        listRegrasCategorizacao(),
        listCategorias("consolidado"),
      ]);
      setRegras(r);
      setCategorias(cat);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  async function handleDelete(id: number) {
    if (!confirm("Excluir esta regra?")) return;
    try {
      await deleteRegraCategorizacao(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-400">
          Categorização automática quando a descrição contém o padrão (ex.: UBER → Transporte).
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + Nova regra
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : regras.length === 0 ? (
        <EmptyState message="Nenhuma regra cadastrada." />
      ) : (
        <div className="overflow-x-auto app-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">Padrão</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Contexto</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Prioridade</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {regras.map((regra) => {
                const cat = findCategoriaById(categorias, regra.categoria_id);
                return (
                  <tr key={regra.id} className="app-table-row">
                    <td className="px-4 py-3 font-mono text-xs text-cyan-300">{regra.padrao}</td>
                    <td className="px-4 py-3">{cat?.nome ?? "—"}</td>
                    <td className="px-4 py-3 capitalize">{regra.contexto}</td>
                    <td className="px-4 py-3 capitalize">{regra.tipo}</td>
                    <td className="px-4 py-3">{regra.prioridade}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          className="px-2 py-1"
                          onClick={() => {
                            setEditing(regra);
                            setModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-rose-400"
                          onClick={() => void handleDelete(regra.id)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RegraModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        regra={editing}
        categorias={categorias}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />
    </div>
  );
}

function RegraModal({
  open,
  onClose,
  regra,
  categorias,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  regra: RegraCategorizacao | null;
  categorias: Awaited<ReturnType<typeof listCategorias>>;
  onSaved: () => void;
}) {
  const [padrao, setPadrao] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [contexto, setContexto] = useState<ContextoCategoria>("ambos");
  const [tipo, setTipo] = useState<"receita" | "despesa" | "ambos">("despesa");
  const [prioridade, setPrioridade] = useState("0");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (regra) {
      setPadrao(regra.padrao);
      setCategoriaId(String(regra.categoria_id));
      setContexto(regra.contexto);
      setTipo(regra.tipo);
      setPrioridade(String(regra.prioridade));
    } else {
      setPadrao("");
      setCategoriaId(categorias[0] ? String(categorias[0].id) : "");
      setContexto("ambos");
      setTipo("despesa");
      setPrioridade("0");
    }
  }, [regra, open, categorias]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!padrao.trim() || !categoriaId) {
      setFormError("Informe padrão e categoria.");
      return;
    }

    const input: RegraCategorizacaoInput = {
      padrao,
      categoria_id: Number(categoriaId),
      contexto,
      tipo,
      prioridade: Number(prioridade) || 0,
    };

    setSaving(true);
    try {
      if (regra) {
        await updateRegraCategorizacao(regra.id, input);
      } else {
        await createRegraCategorizacao(input);
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={regra ? "Editar regra" : "Nova regra"}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Input
          label="Padrão na descrição"
          value={padrao}
          onChange={(e) => setPadrao(e.target.value)}
          placeholder="Ex.: UBER, NETFLIX, SALARIO"
          required
        />
        <Select
          label="Categoria"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          options={categorias.map((c) => ({ value: String(c.id), label: c.nome }))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Contexto"
            value={contexto}
            onChange={(e) => setContexto(e.target.value as ContextoCategoria)}
            options={[
              { value: "ambos", label: "Ambos" },
              { value: "pessoal", label: "Pessoal" },
              { value: "empresa", label: "Empresa" },
            ]}
          />
          <Select
            label="Tipo de lançamento"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            options={[
              { value: "despesa", label: "Despesa" },
              { value: "receita", label: "Receita" },
              { value: "ambos", label: "Ambos" },
            ]}
          />
        </div>
        <Input
          label="Prioridade (maior = primeiro)"
          type="number"
          value={prioridade}
          onChange={(e) => setPrioridade(e.target.value)}
        />
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
