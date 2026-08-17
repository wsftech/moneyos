; Hooks do instalador NSIS — update in-app no Windows.
;
; O plugin updater faz ShellExecute do setup e em seguida process::exit.
; Builds antigas passam só /P (sem /R). O .onInstSuccess do Tauri só reabre
; com /R, então o POSTINSTALL precisa relançar sempre no update/passive.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Encerrando WSF Money antes de atualizar..."
  ; Sem /T: o watchdog de reabertura fica fora da árvore e não deve ser morto.
  ExecWait 'taskkill /F /IM ${MAINBINARYNAME}.exe'
  ExecWait 'taskkill /F /IM financas.exe'
  Sleep 2000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode = 1
  ${OrIf} $PassiveMode = 1
  ${OrIf} ${Silent}
    DetailPrint "Reabrindo WSF Money..."
    SetOutPath "$INSTDIR"
    ; ExecShell sobrevive ao SetAutoClose do /P. Não exigir /R.
    IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" 0 wsf_reopen_done
      ExecShell "open" "$INSTDIR\${MAINBINARYNAME}.exe"
      Sleep 1200
    wsf_reopen_done:
  ${EndIf}
!macroend
