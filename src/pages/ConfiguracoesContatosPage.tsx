import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../components/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { ErrorAlert, LoadingSpinner } from "../components/ui/Feedback";
import { Input, Select, Textarea } from "../components/ui/FormFields";
import { useContexto } from "../contexts/ContextoContext";
import {
  createContato,
  deleteContato,
  listContatos,
  updateContato,
  type ContatoInput,
} from "../db/contatos";
import { getErrorMessage } from "../db/utils";
import type { Contato, ContextoCategoria, TipoContato } from "../types";

const TIPO_OPTIONS = [
  { value: "cliente", label: "Cliente" },
  { value: "fornecedor", label: "Fornecedor" },
  { value: "ambos", label: "Ambos" },
];

export function ConfiguracoesContatosPage() {
  const { contexto } = useContexto();
  const confirm = useConfirm();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contato | null>(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoContato>("fornecedor");
  const [contatoContexto, setContatoContexto] = useState<ContextoCategoria>("ambos");
  const [observacoes, setObservacoes] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setContatos(await listContatos(contexto));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function resetForm() {
    setEditing(null);
    setNome("");
    setTipo("fornecedor");
    setContatoContexto("ambos");
    setObservacoes("");
  }

  function startEdit(c: Contato) {
    setEditing(c);
    setNome(c.nome);
    setTipo(c.tipo);
    setContatoContexto(c.contexto);
    setObservacoes(c.observacoes ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    const input: ContatoInput = {
      nome: nome.trim(),
      tipo,
      contexto: contatoContexto,
      observacoes: observacoes.trim() || null,
    };
    try {
      if (editing) {
        await updateContato(editing.id, input);
      } else {
        await createContato(input);
      }
      resetForm();
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDelete(id: number) {
    if (!(await confirm("Excluir este contato?"))) return;
    try {
      await deleteContato(id);
      if (editing?.id === id) resetForm();
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Cadastro leve de clientes e fornecedores para vincular em contas a pagar/receber.
      </p>
      {error && <ErrorAlert message={error} />}

      <form onSubmit={(e) => void handleSubmit(e)} className="app-card space-y-4 p-5">
        <h2 className="font-semibold text-slate-900">
          {editing ? "Editar contato" : "Novo contato"}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <Select
            label="Tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoContato)}
            options={TIPO_OPTIONS}
          />
          <Select
            label="Contexto"
            value={contatoContexto}
            onChange={(e) => setContatoContexto(e.target.value as ContextoCategoria)}
            options={[
              { value: "ambos", label: "Ambos" },
              { value: "pessoal", label: "Pessoal" },
              { value: "empresa", label: "Empresa" },
            ]}
          />
        </div>
        <Textarea
          label="Observações"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit">{editing ? "Salvar" : "Criar contato"}</Button>
          {editing && (
            <Button type="button" variant="secondary" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {loading ? (
        <LoadingSpinner />
      ) : contatos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum contato cadastrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Contexto</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contatos.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 text-slate-700">{c.nome}</td>
                  <td className="px-3 py-2 capitalize text-slate-500">{c.tipo}</td>
                  <td className="px-3 py-2 capitalize text-slate-500">{c.contexto}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      className="px-2 py-1"
                      onClick={() => startEdit(c)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-rose-600"
                      onClick={() => void handleDelete(c.id)}
                    >
                      Excluir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
