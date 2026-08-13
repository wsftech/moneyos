import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { ErrorAlert } from "./ui/Feedback";
import { Input } from "./ui/FormFields";
import { getNomeUsuario, setNomeUsuario } from "../db/appConfig";
import { getErrorMessage } from "../db/utils";

/** Marca quadrada (`icon.svg`) ou wordmark (`logo.svg`, ideal em fundo escuro). */
export function AppLogo({
  variant = "icon",
  className = "h-10 w-10",
  title,
}: {
  variant?: "icon" | "logo";
  className?: string;
  title?: string;
}) {
  const src = variant === "logo" ? "/logo.svg" : "/icon.svg";
  return (
    <img
      src={src}
      alt="WSF Money"
      title={title}
      className={`shrink-0 border-none object-contain ${className}`}
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
      <div className="flex items-center gap-3 rounded-xl bg-app-sidebar p-3">
        <AppLogo variant="logo" className="h-8 w-auto max-w-[220px]" />
      </div>
      <p className="text-xs text-slate-500">
        Ícone e logo: o wordmark aparece na barra superior (fundo escuro).
      </p>
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
