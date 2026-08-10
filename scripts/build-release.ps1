#Requires -Version 5.1
<#
.SYNOPSIS
  Gera instalador Windows assinado para distribuição e atualizações.

.EXAMPLE
  .\scripts\build-release.ps1
  .\scripts\build-release.ps1 -Version "0.2.0"
#>
param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PrivateKey = Join-Path $Root "src-tauri\.signing\moneyos.key"

if (-not (Test-Path $PrivateKey)) {
  Write-Host "Execute primeiro: .\scripts\setup-release.ps1" -ForegroundColor Yellow
  exit 1
}

$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $PrivateKey -Raw).Trim()

Push-Location $Root

if ($Version) {
  Write-Host "Versão: $Version"
  $pkg = Get-Content package.json | ConvertFrom-Json
  $pkg.version = $Version
  $pkg | ConvertTo-Json -Depth 10 | Set-Content package.json -Encoding UTF8

  $confPath = "src-tauri\tauri.conf.json"
  $conf = Get-Content $confPath | ConvertFrom-Json
  $conf.version = $Version
  $conf | ConvertTo-Json -Depth 10 | Set-Content $confPath -Encoding UTF8
}

Write-Host "Compilando instalador Windows (NSIS) + artefatos de atualização..."
npm run tauri build

Pop-Location

$nsisDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
Write-Host ""
Write-Host "Build concluído!" -ForegroundColor Green
Write-Host "  Instalador: $nsisDir"
Write-Host ""
Write-Host "Para publicar atualização, gere latest.json:"
Write-Host "  .\scripts\generate-latest-json.ps1 -Version `"$((Get-Content (Join-Path $Root 'src-tauri\tauri.conf.json') | ConvertFrom-Json).version)`""
