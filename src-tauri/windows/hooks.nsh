; Eigene Schritte im NSIS-Installer (tauri.conf.json → bundle.windows.nsis.installerHooks).
;
; Vor dem Installieren ein noch laufendes WEP beenden. Sonst meldet der Installer bei einem Update gelegentlich
; „failed to kill“ (das Programm hängt noch im Hintergrund, z. B. Mini-Server der Anmeldung oder WebView2).
; Ungesicherte Eingaben gehen dabei nicht verloren: Die App speichert jede Änderung sofort in IndexedDB.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM "WEP.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "wep-app.exe"'
  Pop $0
  Sleep 500
!macroend
