import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { updateTransacao } from "./transacoes";

export async function salvarAnexoTransacao(
  transacaoId: number,
  sourcePath: string,
): Promise<string> {
  return invoke<string>("salvar_anexo_transacao", {
    transacaoId,
    sourcePath,
  });
}

export async function removerAnexoArquivo(path: string): Promise<void> {
  await invoke("remover_anexo_arquivo", { path });
}

export async function abrirAnexo(path: string): Promise<void> {
  await openPath(path);
}

export function nomeAnexo(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const match = base.match(/^\d+_\d+_(.+)$/);
  return match ? match[1] : base;
}

export async function anexarArquivoTransacao(
  transacaoId: number,
  sourcePath: string,
  anexoAtual?: string | null,
): Promise<string> {
  if (anexoAtual) {
    try {
      await removerAnexoArquivo(anexoAtual);
    } catch {
      // arquivo pode já ter sido removido manualmente
    }
  }
  const dest = await salvarAnexoTransacao(transacaoId, sourcePath);
  await updateTransacao(transacaoId, { anexo_path: dest });
  return dest;
}

export async function removerAnexoTransacao(
  transacaoId: number,
  anexoPath: string,
): Promise<void> {
  try {
    await removerAnexoArquivo(anexoPath);
  } catch {
    // ignore
  }
  await updateTransacao(transacaoId, { anexo_path: null });
}
