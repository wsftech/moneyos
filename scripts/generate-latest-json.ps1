#Requires -Version 5.1
<#
.SYNOPSIS
  Gera latest.json para o updater Tauri a partir dos artefatos de build.

.PARAMETER Version
  Versão SemVer da release (ex: 0.2.0)

.PARAMETER Notes
  Notas da release

.PARAMETER BaseUrl
  URL base onde os arquivos estarão hospedados (ex: GitHub Releases)

.EXAMPLE
  .\scripts\generate-latest-json.ps1 -Version "0.2.0" -BaseUrl "https://github.com/user/money-os/releases/download/v0.2.0"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$Notes = "",

  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$NsisDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"

if (-not (Test-Path $NsisDir)) {
  throw "Pasta NSIS não encontrada. Execute npm run tauri build primeiro."
}

$setupExe = Get-ChildItem $NsisDir -Filter "*setup*.exe" | Select-Object -First 1
$sigFile = Get-ChildItem $NsisDir -Filter "*.sig" | Where-Object { $_.Name -like "*setup*" -or $_.Name -like "*.exe.sig" } | Select-Object -First 1

if (-not $setupExe) {
  $setupExe = Get-ChildItem $NsisDir -Filter "*.exe" | Select-Object -First 1
}
if (-not $setupExe) {
  throw "Instalador .exe não encontrado em $NsisDir"
}

if (-not $sigFile) {
  $sigCandidate = "$($setupExe.FullName).sig"
  if (Test-Path $sigCandidate) {
    $sigFile = Get-Item $sigCandidate
  } else {
    throw "Arquivo .sig não encontrado. Verifique createUpdaterArtifacts e TAURI_SIGNING_PRIVATE_KEY."
  }
}

$signature = (Get-Content $sigFile.FullName -Raw).Trim()
$baseUrl = $BaseUrl.TrimEnd("/")
$fileName = $setupExe.Name
$url = "$baseUrl/$fileName"

$manifest = @{
  version = $Version
  notes   = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = @{
    "windows-x86_64" = @{
      signature = $signature
      url       = $url
    }
  }
}

$outPath = Join-Path $Root "latest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content $outPath -Encoding UTF8

Write-Host "Gerado: $outPath" -ForegroundColor Green
Write-Host ""
Get-Content $outPath
