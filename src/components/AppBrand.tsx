import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { ErrorAlert } from "./ui/Feedback";
import { Input } from "./ui/FormFields";
import { getNomeUsuario, setNomeUsuario } from "../db/appConfig";
import { getErrorMessage } from "../db/utils";

export function AppLogo({
  className = "h-10 w-10",
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <img
      src="/logo.png"
      alt="WSF Money"
      title={title}
      className={`shrink-0 border-none object-cover ${className}`}
      draggable={false}
    />
  );
}

export function useNomeUsuario() {
  const [nome, setNome] = useState("Usuário");
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    try {
      setNome(await getNomeUsuario());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
    function onPerfilAtualizado() {
      void recarregar();
    }
    window.addEventListener("wsf-perfil-atualizado", onPerfilAtualizado);
    return () => window.removeEventListener("wsf-perfil-atualizado", onPerfilAtualizado);
  }, [recarregar]);

  return { nome, loading, recarregar };
}

export function PerfilForm() {
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getNomeUsuario()
      .then((n) => setNome(n === "Usuário" ? "" : n))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSalvo(false);
    setSaving(true);
    try {
      await setNomeUsuario(nome);
      window.dispatchEvent(new Event("wsf-perfil-atualizado"));
      setSalvo(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando perfil…</p>;
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {error && <ErrorAlert message={error} />}
      <div className="flex items-center gap-3">
        <AppLogo className="h-14 w-14" />
        <div>
          <p className="font-semibold text-slate-900">WSF Money</p>
          <p className="text-xs text-slate-500">Logo e nome exibidos no menu lateral</p>
        </div>
      </div>
      <Input
        label="Seu nome"
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
          setSalvo(false);
        }}
        placeholder="Ex.: Wesley França"
        maxLength={80}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar nome"}
        </Button>
        {salvo && <p className="text-sm text-emerald-600">Nome atualizado.</p>}
      </div>
    </form>
  );
}
