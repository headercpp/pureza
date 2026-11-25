!macro customHeader
  BrandingText "Pureza • por EduX"
!macroend

!macro customUnInstall
  RMDir /r "$APPDATA\Pureza"
  RMDir /r "$LOCALAPPDATA\Pureza"
!macroend
