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
  | { fase: "concluido" };

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
  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        onProgresso?.({
          fase: "baixando",
          baixado: 0,
          total: event.data.contentLength ?? undefined,
        });
        break;
      case "Progress":
        baixado += event.data.chunkLength;
        onProgresso?.({ fase: "baixando", baixado });
        break;
      case "Finished":
        onProgresso?.({ fase: "instalando" });
        break;
    }
  });

  onProgresso?.({ fase: "concluido" });
  await relaunch();
}

export async function verificarAtualizacaoSilenciosa(): Promise<void> {
  const status = await verificarAtualizacao();
  if (status.tipo !== "disponivel") return;

  const chave = `moneyos_update_dismiss_${status.versao}`;
  try {
    if (sessionStorage.getItem(chave) === "1") return;
  } catch {
    /* ignore */
  }

  const instalar = confirm(
    `Atualização ${status.versao} disponível.\n\n${status.notas ?? "Deseja instalar agora?"}`,
  );
  if (!instalar) {
    try {
      sessionStorage.setItem(chave, "1");
    } catch {
      /* ignore */
    }
    return;
  }

  await baixarEInstalarAtualizacao();
}
