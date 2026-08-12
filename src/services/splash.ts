import { invoke, isTauri } from "@tauri-apps/api/core";

const SPLASH_MIN_MS = 700;
const SPLASH_MAX_MS = 3500;
const startedAt = Date.now();
let fechando = false;
let fechada = false;

/** Fecha a splash e mostra a janela principal (só no desktop Tauri). */
export async function fecharSplashscreen(): Promise<void> {
  if (!isTauri() || fechada) return;
  if (fechando) return;
  fechando = true;
  try {
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    await invoke("fechar_splashscreen");
    fechada = true;
  } catch (err) {
    console.error("Falha ao fechar splashscreen:", err);
  } finally {
    fechando = false;
  }
}

/** Agenda fechamento automático mesmo se o restante do boot falhar. */
export function agendarFechamentoSplashFallback(): void {
  if (!isTauri()) return;
  window.setTimeout(() => {
    void fecharSplashscreen();
  }, SPLASH_MAX_MS);
}
