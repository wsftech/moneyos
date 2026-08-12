import { invoke, isTauri } from "@tauri-apps/api/core";
import { updateConta } from "./contas";

export async function salvarLogoConta(contaId: number, sourcePath: string): Promise<string> {
  return invoke<string>("salvar_logo_conta", {
    contaId,
    sourcePath,
  });
}

export async function removerArquivoLogo(path: string): Promise<void> {
  await invoke("remover_anexo_arquivo", { path });
}

export async function lerArquivoDataUrl(path: string): Promise<string> {
  return invoke<string>("ler_arquivo_data_url", { path });
}

export async function anexarLogoConta(
  contaId: number,
  sourcePath: string,
  logoAtual?: string | null,
): Promise<string> {
  if (logoAtual) {
    try {
      await removerArquivoLogo(logoAtual);
    } catch {
      // arquivo pode já ter sido removido
    }
  }
  const dest = await salvarLogoConta(contaId, sourcePath);
  await updateConta(contaId, { logo_path: dest });
  return dest;
}

export async function removerLogoConta(
  contaId: number,
  logoPath: string | null | undefined,
): Promise<void> {
  if (logoPath) {
    try {
      await removerArquivoLogo(logoPath);
    } catch {
      // ignore
    }
  }
  await updateConta(contaId, { logo_path: null });
}

const previewCache = new Map<string, string>();

/** Resolve path local (salvo ou pendente) para data URL de pré-visualização. */
export async function resolverLogoPreview(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("data:") || path.startsWith("blob:") || path.startsWith("http")) {
    return path;
  }
  if (!isTauri()) return null;
  const cached = previewCache.get(path);
  if (cached) return cached;
  try {
    const url = await lerArquivoDataUrl(path);
    previewCache.set(path, url);
    return url;
  } catch {
    return null;
  }
}

export function invalidarLogoPreview(path: string | null | undefined) {
  if (path) previewCache.delete(path);
}
