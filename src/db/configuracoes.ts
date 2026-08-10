import { getDatabase } from "./connection";
import { withDatabase } from "./utils";
import type { Configuracao } from "../types";

const LOCAL_STORAGE_PREFIX = "financas_config_";

export async function getConfiguracao(chave: string): Promise<string | null> {
  return withDatabase(async () => {
    try {
      const db = await getDatabase();
      const rows = await db.select<Configuracao[]>(
        "SELECT chave, valor FROM configuracoes WHERE chave = $1",
        [chave],
      );
      return rows[0]?.valor ?? null;
    } catch {
      return localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${chave}`);
    }
  });
}

export async function setConfiguracao(chave: string, valor: string): Promise<void> {
  return withDatabase(async () => {
    try {
      const db = await getDatabase();
      await db.execute(
        `INSERT INTO configuracoes (chave, valor) VALUES ($1, $2)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        [chave, valor],
      );
    } catch {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${chave}`, valor);
    }
  });
}

export async function deleteConfiguracao(chave: string): Promise<void> {
  return withDatabase(async () => {
    try {
      const db = await getDatabase();
      await db.execute("DELETE FROM configuracoes WHERE chave = $1", [chave]);
    } catch {
      localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${chave}`);
    }
  });
}

export async function listConfiguracoes(): Promise<Configuracao[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    return db.select<Configuracao[]>("SELECT chave, valor FROM configuracoes ORDER BY chave ASC");
  });
}
