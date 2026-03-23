# ─── LStack Windows Installer Build Script ──────────────────────────────
# Uses Advanced Installer CLI (AdvancedInstaller.com) to build a
# professional EXE installer with Surface Dark theme.
#
# Full CLI reference:
#   https://www.advancedinstaller.com/user-guide/command-line.html
#   https://www.advancedinstaller.com/user-guide/command-line-editing.html
#
# Usage:
#   .\build-installer.ps1 [-UnpackedDir path] [-OutputDir path] [-Version x.y.z]
# ────────────────────────────────────────────────────────────────────────

param(
    [string]$UnpackedDir = "$PSScriptRoot\..\release\win-unpacked",
    [string]$OutputDir   = "$PSScriptRoot\..\release",
    [string]$Version     = "1.0.0"
)

$ErrorActionPreference = "Stop"

# ── Paths ──────────────────────────────────────────────────────────────
# MUST use AdvancedInstaller.com (NOT advinst.exe) for CLI operations.
# Starting AI v22.0, ADVINST_COM env var is available; fall back to known path.
$aicom = if ($env:ADVINST_COM -and (Test-Path $env:ADVINST_COM)) {
    $env:ADVINST_COM
} else {
    "C:\Program Files (x86)\Caphyon\Advanced Installer 23.5.1\bin\x86\AdvancedInstaller.com"
}

$template  = "$PSScriptRoot\lstack-template.aip"
$project   = "$PSScriptRoot\lstack.aip"
$iconIco   = "$PSScriptRoot\..\icon.ico"
$iconPng   = "$PSScriptRoot\..\icon.png"

# Resolve to absolute paths
$UnpackedDir = (Resolve-Path $UnpackedDir).Path
$OutputDir   = (Resolve-Path $OutputDir).Path
$template    = (Resolve-Path $template).Path

# ── Validate prerequisites ─────────────────────────────────────────────
if (-not (Test-Path $aicom)) {
    Write-Error "AdvancedInstaller.com not found at: $aicom"
    exit 1
}
if (-not (Test-Path $UnpackedDir)) {
    Write-Error "Unpacked directory not found: $UnpackedDir"
    exit 1
}

# Resolve icon: prefer .ico at project root, then electron-builder cache, then .png
if (Test-Path $iconIco) {
    $iconPath = (Resolve-Path $iconIco).Path
} else {
    # electron-builder generates icon.ico in .icon-ico folder next to win-unpacked
    $parentDir = Split-Path $UnpackedDir -Parent
    $ebIcon = Join-Path $parentDir ".icon-ico\icon.ico"
    if (Test-Path $ebIcon) {
        $iconPath = (Resolve-Path $ebIcon).Path
    } elseif (Test-Path $iconPng) {
        Write-Warning "No .ico found; using icon.png (may have limited icon quality)"
        $iconPath = (Resolve-Path $iconPng).Path
    } else {
        Write-Warning "No project icon found. Installer will use default icon."
        $iconPath = $null
    }
}

Write-Host ""
Write-Host "=== LStack Installer Build (Advanced Installer) ===" -ForegroundColor Cyan
Write-Host "  Version:    $Version"
Write-Host "  Unpacked:   $UnpackedDir"
Write-Host "  Output:     $OutputDir"
Write-Host "  Icon:       $iconPath"
Write-Host "  AI CLI:     $aicom"
Write-Host ""

# ── Step 1: Copy template project ─────────────────────────────────────
Write-Host "[1/4] Copying template project..." -ForegroundColor Yellow
Copy-Item $template $project -Force

# ── Step 2: Build AIC command file ─────────────────────────────────────
# AIC format rules:
#   - First line MUST be ";aic"
#   - Encoding: UTF-8 with BOM
#   - "Save" persists changes; "Rebuild" triggers a clean build
#
# Commands reference:
#   SetProperty    - https://www.advancedinstaller.com/user-guide/set-property.html
#   SetVersion     - https://www.advancedinstaller.com/user-guide/set-version.html
#   SetPackageName - https://www.advancedinstaller.com/user-guide/set-package-name.html
#   SetOutputLocation - https://www.advancedinstaller.com/user-guide/set-output-build-location.html
#   SetIcon        - https://www.advancedinstaller.com/user-guide/set-control-panel-icon.html
#   AddLanguage    - https://www.advancedinstaller.com/user-guide/add-language.html
#   AddFolder      - https://www.advancedinstaller.com/user-guide/add-folder.html
#   NewShortcut    - https://www.advancedinstaller.com/user-guide/create-shortcut.html

Write-Host "[2/4] Creating command file..." -ForegroundColor Yellow

$cmdFile = "$PSScriptRoot\lstack-commands.aic"

$aicLines = [System.Collections.Generic.List[string]]::new()
$aicLines.Add(";aic")
$aicLines.Add("")

# ── Product Information ──
$aicLines.Add("; --- Product Information ---")
$aicLines.Add("SetProperty ProductName=LStack")
$aicLines.Add("SetProperty Manufacturer=Marix")
$aicLines.Add("SetProperty ARPURLINFOABOUT=https://github.com/marixdev/lstack")
$aicLines.Add("SetProperty ARPHELPLINK=https://github.com/marixdev/lstack/issues")
$aicLines.Add("SetProperty ARPCONTACT=marixdev")
$aicLines.Add("SetVersion $Version")
$aicLines.Add("")

# ── Package Settings ──
$aicLines.Add("; --- Package Settings ---")
$aicLines.Add("SetPackageName `"LStack Setup ${Version}.exe`" -buildname DefaultBuild")
$aicLines.Add("SetOutputLocation -buildname DefaultBuild -path `"$OutputDir`"")
$aicLines.Add("")

# ── Icon: Control Panel (Add/Remove Programs) & Installer EXE ──
if ($iconPath) {
    $aicLines.Add("; --- Icon (Control Panel & Installer EXE) ---")
    $aicLines.Add("SetIcon -icon `"$iconPath`"")
    $aicLines.Add("")
}

# ── Language: Vietnamese (LCID 1066) ──
# The template already has English (1033). Add Vietnamese.
$aicLines.Add("; --- Languages ---")
$aicLines.Add("AddLanguage 1066 -buildname DefaultBuild")
$aicLines.Add("")

# ── Files: Add all application files ──
$aicLines.Add("; --- Application Files ---")
$aicLines.Add("AddFolder APPDIR `"$UnpackedDir`"")
$aicLines.Add("")

# ── Shortcuts: Desktop & Start Menu with project icon ──
$aicLines.Add("; --- Shortcuts ---")
if ($iconPath) {
    $aicLines.Add("NewShortcut -name `"LStack`" -dir DesktopFolder -target APPDIR\LStack.exe -wkdir APPDIR -desc `"LStack - Local Development Stack`" -icon `"$iconPath`"")
    $aicLines.Add("NewShortcut -name `"LStack`" -dir ProgramMenuFolder -target APPDIR\LStack.exe -wkdir APPDIR -desc `"LStack - Local Development Stack`" -icon `"$iconPath`"")
} else {
    $aicLines.Add("NewShortcut -name `"LStack`" -dir DesktopFolder -target APPDIR\LStack.exe -wkdir APPDIR -desc `"LStack - Local Development Stack`"")
    $aicLines.Add("NewShortcut -name `"LStack`" -dir ProgramMenuFolder -target APPDIR\LStack.exe -wkdir APPDIR -desc `"LStack - Local Development Stack`"")
}
$aicLines.Add("")

# ── Save & Build ──
$aicLines.Add("; --- Save & Build ---")
$aicLines.Add("Save")
$aicLines.Add("Rebuild")

$aicContent = $aicLines -join "`r`n"

# Write with UTF-8 BOM encoding (required by Advanced Installer for UTF-8)
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($cmdFile, $aicContent, $utf8Bom)

Write-Host "  Command file: $cmdFile"

# ── Step 3: Execute build ─────────────────────────────────────────────
Write-Host "[3/4] Building installer..." -ForegroundColor Yellow
Write-Host ""

& $aicom /execute $project $cmdFile -nofail 2>&1 | ForEach-Object { Write-Host "  $_" }
$buildRC = $LASTEXITCODE

# Clean up temporary files
Remove-Item $cmdFile -ErrorAction SilentlyContinue

if ($buildRC -ne 0) {
    Write-Warning "Advanced Installer returned exit code: $buildRC"
}

# ── Step 4: Verify output ─────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Verifying output..." -ForegroundColor Yellow

$outputExe = Join-Path $OutputDir "LStack Setup ${Version}.exe"

if (-not (Test-Path $outputExe)) {
    # Search for any recently created LStack exe
    $found = Get-ChildItem "$OutputDir\*.exe" -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -match "LStack|lstack" -and $_.LastWriteTime -gt (Get-Date).AddMinutes(-5) } |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 1
    if ($found) { $outputExe = $found.FullName }
}

if (Test-Path $outputExe) {
    $size = [math]::Round((Get-Item $outputExe).Length / 1MB, 1)
    Write-Host ""
    Write-Host "=== BUILD SUCCESS ===" -ForegroundColor Green
    Write-Host "  Output: $outputExe"
    Write-Host "  Size:   $size MB"
} else {
    Write-Host ""
    Write-Error "Output installer not found in $OutputDir!"
    Write-Host "Contents of output dir:"
    Get-ChildItem $OutputDir -ErrorAction SilentlyContinue | Format-Table Name, Length -AutoSize
    exit 1
}

Write-Host ""
