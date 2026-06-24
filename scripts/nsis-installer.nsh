; Custom NSIS macros for Большая Медведица CRM installer
; runAfterFinish: false is set in electron-builder.yml — app does NOT launch after install

!macro customInstall
  ; The app executable resource icon is not edited in this build. Recreate shortcuts
  ; with the packaged ICO explicitly so Windows desktop/start menu show the CRM icon.
  StrCpy $0 "$INSTDIR\resources\app\assets\app-icon\icon.ico"
  ${if} ${FileExists} "$0"
    ${if} ${FileExists} "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$0" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${endif}
    ${if} ${FileExists} "$newStartMenuLink"
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$0" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${endif}
  ${endif}
  ; App launch after install is disabled via runAfterFinish: false in electron-builder.yml.
!macroend

!macro customUnInstall
  ; Preserve user data in AppData/Roaming — do NOT delete it on uninstall.
  ; userData is managed by the app, not the installer.
!macroend
