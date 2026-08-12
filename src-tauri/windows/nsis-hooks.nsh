; Hooks do instalador NSIS — update in-app no Windows.
;
; O plugin updater faz ShellExecute do setup e em seguida process::exit.
; Sem espera, o NSIS pode tentar sobrescrever financas.exe ainda bloqueado.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Encerrando WSF Money antes de atualizar..."
  ; /T mata a árvore (WebView2). Código ≠ 0 é ok se o processo já saiu.
  ExecWait 'taskkill /F /T /IM financas.exe'
  Sleep 2500
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; NÃO usar "cmd /C ping ... & start" — o instalador fecha em modo /P e
  ; mata o cmd filho antes do delay, então o app nunca reabre.
  ; RunAsUser lança processo independente (mesmo mecanismo do /R do Tauri).
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    DetailPrint "Reabrindo WSF Money..."
    nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
  ${EndIf}
!macroend
