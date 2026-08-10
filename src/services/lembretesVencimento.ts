import { isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getLembretesConfig, getUltimoLembrete, setUltimoLembrete } from "../db/appConfig";
import { listProximosVencimentosUnificados } from "../db/proximosVencimentos";
import type { ContextoVisualizacao } from "../types";

function chaveVencimento(item: { chave: string; vencimento: string }): string {
  return `${item.chave}-${item.vencimento}`;
}

export async function verificarLembretesVencimento(
  contexto?: ContextoVisualizacao,
): Promise<void> {
  if (!isTauri()) return;

  const config = await getLembretesConfig();
  if (!config.ativos) return;

  let granted = await isPermissionGranted();
  if (!granted) {
    const perm = await requestPermission();
    granted = perm === "granted";
  }
  if (!granted) return;

  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date();
  limite.setDate(limite.getDate() + config.dias);
  const limiteStr = limite.toISOString().slice(0, 10);

  const vencimentos = await listProximosVencimentosUnificados(contexto, 50);
  const proximos = vencimentos.filter(
    (v) => v.vencimento >= hoje && v.vencimento <= limiteStr,
  );

  for (const item of proximos) {
    const chave = chaveVencimento(item);
    const ultimo = await getUltimoLembrete(chave);
    if (ultimo === hoje) continue;

    const diasRestantes = Math.ceil(
      (new Date(`${item.vencimento}T12:00:00`).getTime() - new Date(`${hoje}T12:00:00`).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const quando =
      diasRestantes === 0
        ? "vence hoje"
        : diasRestantes === 1
          ? "vence amanhã"
          : `vence em ${diasRestantes} dias`;

    sendNotification({
      title: "Vencimento próximo",
      body: `${item.descricao} — ${quando}`,
    });
    await setUltimoLembrete(chave, hoje);
  }
}
