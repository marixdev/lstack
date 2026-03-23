<#
.SYNOPSIS
    Builds the LStack WPF installer as a single self-contained EXE.
    The app payload (win-unpacked) is zipped and embedded directly into
    the installer binary — no NSIS, no extra files needed.
.USAGE
    .\build-wpf-installer.ps1 [-AppVersion 1.0.0] [-WinUnpacked <path>] [-OutDir <path>]
#>
param(
    [string]$AppVersion  = "1.0.0",
    [string]$WinUnpacked = "",
    [string]$OutDir      = ""
)

$ErrorActionPreference = "Stop"

# Derive root from script location (build/ → parent = repo root)
$RootDir = (Resolve-Path "$PSScriptRoot\..").Path

if (-not $WinUnpacked) { $WinUnpacked = "$RootDir\release_test\win-unpacked" }
if (-not $OutDir)      { $OutDir      = "$RootDir\release_test\wpf-test" }

$InstallerProj = "$RootDir\installer\LStackInstaller.csproj"
$InstallerDir  = "$RootDir\installer"
$PayloadZip    = "$InstallerDir\payload.zip"
$FinalExe      = "$OutDir\LStack Setup.exe"

$dotnet = $null
# Prefer PATH dotnet (GitHub Actions, system installs)
if (Get-Command "dotnet" -ErrorAction SilentlyContinue) { $dotnet = "dotnet" }
# Fallback to known local paths
if (-not $dotnet) {
    $dotnet = @("C:\dotnet\dotnet.exe","C:\Program Files\dotnet\dotnet.exe") |
               Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $dotnet) { throw "dotnet.exe not found." }

Write-Host ""
Write-Host "=== LStack Installer Builder (Embedded) ===" -ForegroundColor Cyan
Write-Host "  Version  : $AppVersion"
Write-Host "  Payload  : $WinUnpacked"
Write-Host "  Output   : $FinalExe"
Write-Host ""

# 1. Zip the payload
Write-Host "[1/3] Zipping app payload..." -ForegroundColor Yellow
if (-not (Test-Path $WinUnpacked)) {
    throw "win-unpacked not found at: $WinUnpacked`nRun 'npx electron-builder --win' first."
}

Remove-Item $PayloadZip -Force -ErrorAction SilentlyContinue

Add-Type -Assembly "System.IO.Compression.FileSystem"
[IO.Compression.ZipFile]::CreateFromDirectory($WinUnpacked, $PayloadZip, [IO.Compression.CompressionLevel]::Optimal, $false)

$zipMB = [math]::Round((Get-Item $PayloadZip).Length / 1MB, 1)
$fc    = (Get-ChildItem $WinUnpacked -Recurse -File).Count
Write-Host "  Zipped $fc files -> $zipMB MB`n"

# 2. Build + publish (payload.zip is auto-embedded as EmbeddedResource)
Write-Host "[2/3] Building installer (embedding payload)..." -ForegroundColor Yellow
New-Item -ItemType Directory $OutDir -Force | Out-Null

& $dotnet publish $InstallerProj `
    -c Release -r win-x64 --self-contained `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -p:Version=$AppVersion `
    -o $OutDir 2>&1 | ForEach-Object { "  $_" } | Write-Host

if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed." }
if (-not (Test-Path $FinalExe)) { throw "EXE not found after publish: $FinalExe" }

$exeMB = [math]::Round((Get-Item $FinalExe).Length / 1MB, 1)
Write-Host "  Built: $exeMB MB`n"

# 3. Cleanup temp zip from source tree
Write-Host "[3/3] Cleaning up..." -ForegroundColor Yellow
Remove-Item $PayloadZip -Force -ErrorAction SilentlyContinue
Write-Host "  Removed payload.zip from installer/`n"

# Done
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host ""
Write-Host "  FINAL: $FinalExe  ($exeMB MB)" -ForegroundColor White
Write-Host "  Single file -- no NSIS, no external payload needed." -ForegroundColor DarkGray
Write-Host ""
