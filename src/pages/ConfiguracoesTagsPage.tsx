import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../components/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { ErrorAlert, LoadingSpinner } from "../components/ui/Feedback";
import { Input, Select } from "../components/ui/FormFields";
import { useContexto } from "../contexts/ContextoContext";
import { createTag, deleteTag, listTags, type TagInput } from "../db/tags";
import { getErrorMessage } from "../db/utils";
import type { ContextoCategoria } from "../types";

export function ConfiguracoesTagsPage() {
  const { contexto } = useContexto();
  const confirm = useConfirm();
  const [tags, setTags] = useState<Awaited<ReturnType<typeof listTags>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [tagContexto, setTagContexto] = useState<ContextoCategoria>("ambos");
  const [cor, setCor] = useState("#6366f1");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setTags(await listTags(contexto));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      const input: TagInput = { nome: nome.trim(), contexto: tagContexto, cor };
      await createTag(input);
      setNome("");
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDelete(id: number) {
    if (!(await confirm("Excluir esta tag? Será removida das transações vinculadas."))) return;
    try {
      await deleteTag(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Tags funcionam como centros de custo — classifique transações por projeto, cliente ou
        departamento.
      </p>
      {error && <ErrorAlert message={error} />}
      <form onSubmit={(e) => void handleCreate(e)} className="app-card space-y-4 p-5">
        <h2 className="font-semibold text-slate-900">Nova tag</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <Select
            label="Contexto"
            value={tagContexto}
            onChange={(e) => setTagContexto(e.target.value as ContextoCategoria)}
            options={[
              { value: "ambos", label: "Ambos" },
              { value: "pessoal", label: "Pessoal" },
              { value: "empresa", label: "Empresa" },
            ]}
          />
          <Input label="Cor" type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
        </div>
        <Button type="submit">Criar tag</Button>
      </form>
      {loading ? (
        <LoadingSpinner />
      ) : tags.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma tag cadastrada.</p>
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: tag.cor }}
                />
                {tag.nome}
                <span className="text-xs text-slate-500">({tag.contexto})</span>
              </span>
              <Button variant="ghost" className="text-rose-600" onClick={() => void handleDelete(tag.id)}>
                Excluir
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
