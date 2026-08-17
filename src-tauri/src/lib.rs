mod migrations;

use std::fs;
use std::path::{Path, PathBuf};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::Manager;

const MAX_ANEXO_BYTES: u64 = 10 * 1024 * 1024;
const MAX_LOGO_BYTES: u64 = 2 * 1024 * 1024;

fn anexos_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|dir| dir.join("anexos"))
}

fn logos_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|dir| dir.join("logos"))
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
        "arquivo".into()
    } else {
        sanitized
    }
}

fn extension_lower(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn is_image_extension(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg")
}

fn mime_for_extension(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        _ => None,
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
fn salvar_logo_conta(
    app: tauri::AppHandle,
    conta_id: u64,
    source_path: String,
) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err("Arquivo de origem não encontrado.".into());
    }
    let ext = extension_lower(source);
    if !is_image_extension(&ext) {
        return Err("Use uma imagem PNG, JPG, WEBP, GIF ou SVG.".into());
    }
    let meta = fs::metadata(source).map_err(|e| e.to_string())?;
    if meta.len() > MAX_LOGO_BYTES {
        return Err("Logo muito grande (máximo 2 MB).".into());
    }

    let dir = logos_directory(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let orig_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("logo");
    let safe = sanitize_filename(orig_name);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let dest = dir.join(format!("conta_{}_{}_{}", conta_id, ts, safe));
    fs::copy(source, &dest).map_err(|e| format!("Falha ao copiar logo: {e}"))?;

    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
fn ler_arquivo_data_url(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Arquivo não encontrado.".into());
    }
    let ext = extension_lower(p);
    let mime = mime_for_extension(&ext).ok_or_else(|| {
        "Formato de imagem não suportado.".to_string()
    })?;
    let bytes = fs::read(p).map_err(|e| format!("Falha ao ler arquivo: {e}"))?;
    if bytes.len() as u64 > MAX_LOGO_BYTES {
        return Err("Arquivo muito grande para pré-visualização.".into());
    }
    Ok(format!(
        "data:{mime};base64,{}",
        STANDARD.encode(&bytes)
    ))
}

#[tauri::command]
fn remover_anexo_arquivo(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        fs::remove_file(p).map_err(|e| format!("Falha ao remover arquivo: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn fechar_splashscreen(app: tauri::AppHandle) -> Result<(), String> {
    revelar_app(&app);
    Ok(())
}

/// Agenda um processo separado que reabre o app se, após o update, ele não voltar sozinho.
/// Cobre: instalador bloqueado, relaunch NSIS falhou, ou ShellExecute do updater falhou
/// (o plugin mesmo assim encerra o processo).
///
/// Não passar o path com espaços direto ao CreateProcess: grave um .cmd no TEMP
/// e solte o helper do job do WebView2 (CREATE_BREAKAWAY_FROM_JOB).
#[tauri::command]
fn agendar_reopen_apos_update() -> Result<(), String> {
    #[cfg(windows)]
    {
        agendar_reopen_apos_update_windows()?;
    }
    Ok(())
}

#[cfg(windows)]
fn agendar_reopen_apos_update_windows() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe.to_string_lossy().replace(['"', '&', '|', '>', '<'], "");
    let cmd_path = std::env::temp_dir().join("wsf-money-reopen-after-update.cmd");
    let script = format!(
        "@echo off\r\n\
         ping -n 16 127.0.0.1 >nul\r\n\
         call :try_open\r\n\
         ping -n 16 127.0.0.1 >nul\r\n\
         call :try_open\r\n\
         ping -n 21 127.0.0.1 >nul\r\n\
         call :try_open\r\n\
         exit /b 0\r\n\
         :try_open\r\n\
         tasklist /FI \"IMAGENAME eq financas.exe\" | find /I \"financas.exe\" >nul\r\n\
         if not errorlevel 1 exit /b 0\r\n\
         if not exist \"{exe_str}\" exit /b 0\r\n\
         start \"\" \"{exe_str}\"\r\n\
         exit /b 0\r\n"
    );
    fs::write(&cmd_path, script).map_err(|e| format!("Falha ao gravar helper de reopen: {e}"))?;

    let cmd_arg = cmd_path
        .to_str()
        .ok_or_else(|| "Caminho temporário inválido".to_string())?;

    // BREAKAWAY: o job do WebView2 mata filhos no process::exit do updater.
    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const FLAGS: u32 =
        CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS | CREATE_NO_WINDOW;

    let spawn = |flags: u32| {
        Command::new("cmd.exe")
            .args(["/C", cmd_arg])
            .creation_flags(flags)
            .spawn()
    };

    if spawn(FLAGS).is_err() {
        spawn(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS | CREATE_NO_WINDOW)
            .map_err(|e| format!("Falha ao agendar reabertura: {e}"))?;
    }
    Ok(())
}

fn revelar_app(app: &tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
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
        .setup(|app| {
            // Segurança: se o frontend não chamar fechar_splashscreen, revela o app mesmo assim.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(6));
                revelar_app(&handle);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_database_path,
            backup_database,
            restore_database,
            salvar_anexo_transacao,
            salvar_logo_conta,
            ler_arquivo_data_url,
            remover_anexo_arquivo,
            fechar_splashscreen,
            agendar_reopen_apos_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
