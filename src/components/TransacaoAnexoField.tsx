import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "./ui/Button";
import {
  abrirAnexo,
  anexarArquivoTransacao,
  nomeAnexo,
  removerAnexoTransacao,
} from "../db/anexos";
import { getErrorMessage } from "../db/utils";

const ANEXO_FILTERS = [
  {
    name: "Comprovantes",
    extensions: ["pdf", "png", "jpg", "jpeg", "webp", "gif"],
  },
];

type Props = {
  transacaoId: number | null;
  anexoPath: string | null;
  onAnexoChange: (path: string | null) => void;
  pendingSource: string | null;
  onPendingSourceChange: (path: string | null) => void;
};

export function TransacaoAnexoField({
  transacaoId,
  anexoPath,
  onAnexoChange,
  pendingSource,
  onPendingSourceChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isTauri()) {
    return (
      <p className="text-sm text-slate-500">
        Anexos disponíveis apenas na versão desktop do app.
      </p>
    );
  }

  async function handleSelecionar() {
    setError(null);
    try {
      const selected = await open({
        title: "Selecionar comprovante",
        filters: ANEXO_FILTERS,
        multiple: false,
      });
      if (!selected || typeof selected !== "string") return;

      if (transacaoId) {
        setLoading(true);
        const dest = await anexarArquivoTransacao(transacaoId, selected, anexoPath);
        onAnexoChange(dest);
        onPendingSourceChange(null);
      } else {
        onPendingSourceChange(selected);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAbrir() {
    if (!anexoPath) return;
    setError(null);
    try {
      await abrirAnexo(anexoPath);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleRemover() {
    setError(null);
    try {
      if (transacaoId && anexoPath) {
        setLoading(true);
        await removerAnexoTransacao(transacaoId, anexoPath);
        onAnexoChange(null);
      } else {
        onPendingSourceChange(null);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const label = anexoPath
    ? nomeAnexo(anexoPath)
    : pendingSource
      ? nomeAnexo(pendingSource)
      : null;

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-600">Anexo</span>
      {label ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={label}>
            📎 {label}
          </span>
          {anexoPath && (
            <Button type="button" variant="ghost" className="px-2 py-1" onClick={() => void handleAbrir()}>
              Abrir
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="px-2 py-1"
            disabled={loading}
            onClick={() => void handleSelecionar()}
          >
            Trocar
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="px-2 py-1 text-rose-600"
            disabled={loading}
            onClick={() => void handleRemover()}
          >
            Remover
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          onClick={() => void handleSelecionar()}
        >
          {loading ? "Anexando..." : "Anexar comprovante"}
        </Button>
      )}
      {!transacaoId && pendingSource && (
        <p className="text-xs text-slate-500">O arquivo será anexado ao salvar a transação.</p>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

export async function aplicarAnexoPendente(
  transacaoId: number,
  pendingSource: string,
): Promise<string> {
  return anexarArquivoTransacao(transacaoId, pendingSource);
}
