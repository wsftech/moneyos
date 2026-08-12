; Hooks do instalador NSIS — tornam o update in-app mais confiável no Windows.
;
; O plugin updater faz ShellExecute do setup e em seguida process::exit.
; Sem espera, o NSIS pode tentar sobrescrever financas.exe ainda bloqueado
; (processo pai / WebView2), abortar a instalação e nunca chegar no /R.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Encerrando WSF Money antes de atualizar..."
  ; /T mata a árvore (WebView2 filhos). Código de saída ≠ 0 é ok se já não houver processo.
  ExecWait 'taskkill /F /T /IM financas.exe'
  Sleep 2500
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Relaunch robusto para caminhos com espaço (ex.: %LOCALAPPDATA%\WSF Money).
  ; Usado quando o update roda em modo passivo (/P) ou /UPDATE.
  ; O updater NÃO deve passar /R junto (evita abrir duas instâncias).
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    DetailPrint "Reabrindo WSF Money..."
    Exec 'cmd.exe /C ping -n 3 127.0.0.1 >nul & start "" "$INSTDIR\${MAINBINARYNAME}.exe"'
  ${EndIf}
!macroend
