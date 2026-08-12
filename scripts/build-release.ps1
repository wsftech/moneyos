#Requires -Version 5.1
<#
.SYNOPSIS
  Gera instalador Windows assinado para distribuicao e atualizacoes.

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

if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  $secure = Read-Host "Senha da chave de assinatura" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Push-Location $Root

if ($Version) {
  Write-Host "Versao: $Version"
  $setVersionJs = Join-Path $Root "scripts\set-version.cjs"
  node $setVersionJs $Version
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    exit $LASTEXITCODE
  }
}

Write-Host "Compilando instalador Windows (NSIS) + artefatos de atualizacao..."
npm run tauri build
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Build falhou (codigo $LASTEXITCODE)." -ForegroundColor Red
  Write-Host "Se o erro mencionar um caminho antigo (ex.: C:\projects\finance), limpe o cache:" -ForegroundColor Yellow
  Write-Host "  Remove-Item -Recurse -Force src-tauri\target" -ForegroundColor Yellow
  Pop-Location
  exit $LASTEXITCODE
}

Pop-Location

$nsisDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem -Path $nsisDir -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$confPath = Join-Path $Root "src-tauri\tauri.conf.json"
$builtVersion = (Get-Content $confPath -Raw | ConvertFrom-Json).version

Write-Host ""
Write-Host "Build concluido!" -ForegroundColor Green
if ($installer) {
  Write-Host "  Instalador: $($installer.FullName)"
} else {
  Write-Host "  Pasta NSIS: $nsisDir"
}
Write-Host ""
Write-Host "Para publicar atualizacao, gere latest.json:"
Write-Host ('  .\scripts\generate-latest-json.ps1 -Version "{0}" -BaseUrl "https://github.com/wsftech/moneyos/releases/download/v{0}"' -f $builtVersion)
