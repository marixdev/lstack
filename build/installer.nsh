; ─── LStack Custom NSIS Installer Script ────────────────────────────────
; This file is included by electron-builder's NSIS template.
; Macros here customise the look and feel of the installer.

!macro customHeader
  ; ── Welcome page ──────────────────────────────────────────────────────
  !define MUI_WELCOMEPAGE_TITLE "Welcome to LStack v${VERSION}"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT \
    "LStack is a modern local development environment for Windows.$\r$\n$\r$\n\
    $\u2022  One-click Nginx, Apache, MariaDB, PHP, Redis management$\r$\n\
    $\u2022  Automatic .test domains with free SSL certificates$\r$\n\
    $\u2022  Per-project PHP profiles & extension control$\r$\n\
    $\u2022  Built-in terminal, log viewer & package manager$\r$\n$\r$\n\
    Click Next to continue."

  ; ── Finish page ───────────────────────────────────────────────────────
  !define MUI_FINISHPAGE_TITLE "LStack is Ready!"
  !define MUI_FINISHPAGE_TITLE_3LINES
  !define MUI_FINISHPAGE_TEXT \
    "LStack has been installed successfully on your computer.$\r$\n$\r$\n\
    Launch the application and start building.$\r$\n\
    All services can be managed from the dashboard."
  !define MUI_FINISHPAGE_RUN_TEXT "Launch LStack now"
  !define MUI_FINISHPAGE_LINK "Visit lstack.dev"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://lstack.dev"
  !define MUI_FINISHPAGE_LINK_COLOR 3B82F6

  ; ── Abort confirmation ────────────────────────────────────────────────
  ; MUI_ABORTWARNING is already defined by electron-builder

  ; ── Branding ──────────────────────────────────────────────────────────
  BrandingText "LStack v${VERSION}  —  lstack.dev"
!macroend
