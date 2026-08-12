import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useConfirm } from "../components/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { ErrorAlert } from "../components/ui/Feedback";
import { backupDatabase, getDatabasePath, restoreDatabase } from "../db/backup";
import { getErrorMessage } from "../db/utils";

export function ConfiguracoesDadosPage() {
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dbPath, setDbPath] = useState<string | null>(null);

  async function mostrarCaminho() {
    try {
      setDbPath(await getDatabasePath());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleBackup() {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const dest = await save({
        title: "Salvar backup",
        defaultPath: `wsf-money-backup-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "SQLite", extensions: ["db"] }],
      });
      if (!dest) return;
      await backupDatabase(dest);
      setSuccess(`Backup salvo em ${dest}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    if (
      !(await confirm({
        title: "Restaurar backup",
        message:
          "Restaurar o backup substituirá todos os dados atuais. A aplicação será recarregada.",
        confirmLabel: "Restaurar",
        tone: "danger",
      }))
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const src = await open({
        title: "Selecionar backup",
        filters: [{ name: "SQLite", extensions: ["db"] }],
        multiple: false,
      });
      if (!src || typeof src !== "string") return;
      await restoreDatabase(src);
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Faça backup regular do banco de dados local. Recomendado antes de atualizações ou
        restaurações.
      </p>

      {error && <ErrorAlert message={error} />}
      {success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="app-card p-5">
          <h3 className="font-semibold text-slate-900">Backup</h3>
          <p className="mt-1 text-sm text-slate-500">Exporta uma cópia completa do banco SQLite.</p>
          <Button className="mt-4" onClick={() => void handleBackup()} disabled={loading}>
            {loading ? "Processando..." : "Exportar backup"}
          </Button>
        </div>

        <div className="app-card p-5">
          <h3 className="font-semibold text-slate-900">Restaurar</h3>
          <p className="mt-1 text-sm text-slate-500">
            Substitui os dados atuais por um arquivo de backup (.db).
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => void handleRestore()}
            disabled={loading}
          >
            Restaurar backup
          </Button>
        </div>
      </div>

      <div className="app-card p-5">
        <h3 className="font-semibold text-slate-900">Localização do banco</h3>
        <p className="mt-1 text-sm text-slate-500">Caminho do arquivo financas.db neste computador.</p>
        <Button variant="ghost" className="mt-3" onClick={() => void mostrarCaminho()}>
          Mostrar caminho
        </Button>
        {dbPath && <p className="mt-2 break-all font-mono text-xs text-slate-500">{dbPath}</p>}
      </div>
    </div>
  );
}
