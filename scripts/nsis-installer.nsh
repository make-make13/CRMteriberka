; Custom NSIS macros for Большая Медведица CRM installer
; runAfterFinish: false is set in electron-builder.yml — app does NOT launch after install

!macro customInstall
  ; No custom post-install actions needed.
  ; App launch after install is disabled via runAfterFinish: false in electron-builder.yml.
!macroend

!macro customUnInstall
  ; Preserve user data in AppData/Roaming — do NOT delete it on uninstall.
  ; userData is managed by the app, not the installer.
!macroend
