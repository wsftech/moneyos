import { getDatabase } from "./connection";
import { withDatabase } from "./utils";

export async function getAppConfig(chave: string): Promise<string | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<{ valor: string }[]>(
      "SELECT valor FROM app_config WHERE chave = $1",
      [chave],
    );
    return rows[0]?.valor ?? null;
  });
}

export async function setAppConfig(chave: string, valor: string): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO app_config (chave, valor) VALUES ($1, $2)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
      [chave, valor],
    );
  });
}

export async function getLembretesConfig(): Promise<{ ativos: boolean; dias: number }> {
  const [ativosRaw, diasRaw] = await Promise.all([
    getAppConfig("lembretes_ativos"),
    getAppConfig("lembretes_dias"),
  ]);
  return {
    ativos: ativosRaw !== "false",
    dias: Math.max(1, Math.min(30, parseInt(diasRaw ?? "3", 10) || 3)),
  };
}

export async function setLembretesConfig(ativos: boolean, dias: number): Promise<void> {
  await Promise.all([
    setAppConfig("lembretes_ativos", String(ativos)),
    setAppConfig("lembretes_dias", String(Math.max(1, Math.min(30, dias)))),
  ]);
}

export async function getUltimoLembrete(chave: string): Promise<string | null> {
  return getAppConfig(`lembrete_${chave}`);
}

export async function setUltimoLembrete(chave: string, valor: string): Promise<void> {
  await setAppConfig(`lembrete_${chave}`, valor);
}
