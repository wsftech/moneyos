import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { ErrorAlert } from "../components/ui/Feedback";
import { Input } from "../components/ui/FormFields";
import { getLembretesConfig, setLembretesConfig } from "../db/appConfig";
import { getErrorMessage } from "../db/utils";
import { isTauri } from "@tauri-apps/api/core";

export function ConfiguracoesNotificacoesPage() {
  const [ativos, setAtivos] = useState(true);
  const [dias, setDias] = useState("3");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void getLembretesConfig().then((cfg) => {
      setAtivos(cfg.ativos);
      setDias(String(cfg.dias));
      setLoading(false);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await setLembretesConfig(ativos, parseInt(dias, 10) || 3);
      setSuccess("Preferências salvas.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Receba alertas no desktop sobre vencimentos próximos (contas, parcelas e faturas).
      </p>
      {!isTauri() && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Notificações disponíveis apenas na versão desktop do app.
        </p>
      )}
      {error && <ErrorAlert message={error} />}
      {success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      )}
      <form onSubmit={(e) => void handleSave(e)} className="app-card max-w-lg space-y-4 p-5">
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={ativos} onChange={(e) => setAtivos(e.target.checked)} />
          <span className="text-sm text-slate-700">Ativar lembretes de vencimento</span>
        </label>
        <Input
          label="Antecedência (dias)"
          type="number"
          min="1"
          max="30"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
        />
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </div>
  );
}
