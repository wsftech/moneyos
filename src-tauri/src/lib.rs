mod migrations;

use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const MAX_ANEXO_BYTES: u64 = 10 * 1024 * 1024;

fn anexos_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|dir| dir.join("anexos"))
}

fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        "anexo".into()
    } else {
        sanitized
    }
}

fn database_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|dir| dir.join("financas.db"))
}

#[tauri::command]
fn get_database_path(app: tauri::AppHandle) -> Result<String, String> {
    let path = database_path(&app)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn backup_database(app: tauri::AppHandle, destination: String) -> Result<(), String> {
    let src = database_path(&app)?;
    if !src.exists() {
        return Err("Banco de dados não encontrado.".into());
    }
    fs::copy(&src, &destination)
        .map_err(|e| format!("Falha ao copiar backup: {e}"))
        .map(|_| ())
}

#[tauri::command]
fn restore_database(app: tauri::AppHandle, source: String) -> Result<(), String> {
    let dest = database_path(&app)?;
    if !Path::new(&source).exists() {
        return Err("Arquivo de backup não encontrado.".into());
    }
    fs::copy(&source, &dest)
        .map_err(|e| format!("Falha ao restaurar backup: {e}"))
        .map(|_| ())
}

#[tauri::command]
fn salvar_anexo_transacao(
    app: tauri::AppHandle,
    transacao_id: u64,
    source_path: String,
) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err("Arquivo de origem não encontrado.".into());
    }
    let meta = fs::metadata(source).map_err(|e| e.to_string())?;
    if meta.len() > MAX_ANEXO_BYTES {
        return Err("Arquivo muito grande (máximo 10 MB).".into());
    }

    let dir = anexos_directory(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let orig_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("anexo");
    let safe = sanitize_filename(orig_name);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let dest = dir.join(format!("{}_{}_{}", transacao_id, ts, safe));
    fs::copy(source, &dest).map_err(|e| format!("Falha ao copiar anexo: {e}"))?;

    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
fn remover_anexo_arquivo(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        fs::remove_file(p).map_err(|e| format!("Falha ao remover anexo: {e}"))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:financas.db", migrations::get_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_database_path,
            backup_database,
            restore_database,
            salvar_anexo_transacao,
            remover_anexo_arquivo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
