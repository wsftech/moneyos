import { invoke } from "@tauri-apps/api/core";
import { closeDatabase } from "./connection";

export async function backupDatabase(destPath: string): Promise<void> {
  await invoke("backup_database", { destination: destPath });
}

export async function restoreDatabase(sourcePath: string): Promise<void> {
  await closeDatabase();
  await invoke("restore_database", { source: sourcePath });
  window.location.reload();
}

export async function getDatabasePath(): Promise<string> {
  return invoke<string>("get_database_path");
}
