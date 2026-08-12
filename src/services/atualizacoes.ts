import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";

export type StatusAtualizacao =
  | { tipo: "indisponivel" }
  | { tipo: "atualizado" }
  | { tipo: "disponivel"; versao: string; notas?: string }
  | { tipo: "sem_publicacao" }
  | { tipo: "erro"; mensagem: string };

function traduzirErroAtualizacao(err: unknown): StatusAtualizacao {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("could not fetch a valid release json") ||
    lower.includes("404") ||
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("release json")
  ) {
    return { tipo: "sem_publicacao" };
  }

  return { tipo: "erro", mensagem: msg };
}

export type ProgressoAtualizacao =
  | { fase: "idle" }
  | { fase: "baixando"; baixado: number; total?: number }
  | { fase: "instalando" }
  | { fase: "reiniciando" };

export function percentualProgresso(progresso: ProgressoAtualizacao): number | null {
  if (progresso.fase !== "baixando" || !progresso.total || progresso.total <= 0) {
    return null;
  }
  return Math.min(100, Math.round((progresso.baixado / progresso.total) * 100));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function obterVersaoApp(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await getVersion();
  } catch {
    return null;
  }
}

export async function verificarAtualizacao(): Promise<StatusAtualizacao> {
  if (!isTauri()) {
    return { tipo: "indisponivel" };
  }

  try {
    const update = await check();
    if (!update) {
      return { tipo: "atualizado" };
    }
    return {
      tipo: "disponivel",
      versao: update.version,
      notas: update.body ?? undefined,
    };
  } catch (err) {
    return traduzirErroAtualizacao(err);
  }
}

export async function baixarEInstalarAtualizacao(
  onProgresso?: (progresso: ProgressoAtualizacao) => void,
): Promise<void> {
  if (!isTauri()) {
    throw new Error("Atualizações só estão disponíveis no app desktop.");
  }

  const update = await check();
  if (!update) {
    throw new Error("Nenhuma atualização disponível.");
  }

  onProgresso?.({ fase: "baixando", baixado: 0 });

  let baixado = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? undefined;
        baixado = 0;
        onProgresso?.({ fase: "baixando", baixado: 0, total });
        break;
      case "Progress":
        baixado += event.data.chunkLength;
        onProgresso?.({ fase: "baixando", baixado, total });
        break;
      case "Finished":
        onProgresso?.({ fase: "instalando" });
        break;
    }
  });

  // Dá tempo do UI pintar "Reiniciando…" antes do processo sair.
  onProgresso?.({ fase: "reiniciando" });
  await new Promise((r) => setTimeout(r, 600));
  await relaunch();
}

export function chaveDismissAtualizacao(versao: string): string {
  return `moneyos_update_dismiss_${versao}`;
}

export function foiDismissAtualizacao(versao: string): boolean {
  try {
    return sessionStorage.getItem(chaveDismissAtualizacao(versao)) === "1";
  } catch {
    return false;
  }
}

export function dismissAtualizacao(versao: string): void {
  try {
    sessionStorage.setItem(chaveDismissAtualizacao(versao), "1");
  } catch {
    /* ignore */
  }
}
