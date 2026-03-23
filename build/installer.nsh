;  LStack  electron-builder NSIS style overrides 
; Only sets MUI defines and hides the branding bar.
; All pages (directory, install progress, finish) use standard MUI2.
; Sidebar and header bitmaps are provided via electron-builder.json.

!macro customHeader
  BrandingText " "
!macroend
