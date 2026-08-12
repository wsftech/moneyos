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
  .\scripts\generate-latest-json.ps1 -Version "0.2.0" -BaseUrl "https://github.com/wsftech/moneyos/releases/download/v0.2.0"
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
  throw "Pasta NSIS nao encontrada. Execute npm run tauri build primeiro."
}

# Prefer installer matching the requested version (avoid picking an older build in the folder).
$candidates = @(Get-ChildItem $NsisDir -Filter "*setup*.exe" -ErrorAction SilentlyContinue)
if ($candidates.Count -eq 0) {
  $candidates = @(Get-ChildItem $NsisDir -Filter "*.exe" -ErrorAction SilentlyContinue)
}
$setupExe = $candidates | Where-Object { $_.Name -like "*$Version*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setupExe) {
  $setupExe = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $setupExe) {
  throw "Instalador .exe nao encontrado em $NsisDir"
}

$sigCandidate = "$($setupExe.FullName).sig"
if (Test-Path $sigCandidate) {
  $sigFile = Get-Item $sigCandidate
} else {
  throw "Arquivo .sig nao encontrado ao lado do instalador: $sigCandidate"
}

$signature = (Get-Content $sigFile.FullName -Raw).Trim()
$baseUrl = $BaseUrl.TrimEnd("/")
# Encode spaces/special chars so the updater can download the asset.
$fileNameEncoded = [Uri]::EscapeDataString($setupExe.Name).Replace("%2E", ".")
$url = "$baseUrl/$fileNameEncoded"

$manifest = [ordered]@{
  version  = $Version
  notes    = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $signature
      url       = $url
    }
  }
}

$outPath = Join-Path $Root "latest.json"
# UTF-8 sem BOM — o updater Tauri falha com BOM do Set-Content -Encoding UTF8 no Windows PowerShell 5.1
$json = $manifest | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($outPath, $json, $utf8NoBom)

Write-Host "Gerado: $outPath" -ForegroundColor Green
Write-Host "Instalador: $($setupExe.Name)"
Write-Host "URL: $url"
Write-Host ""
Get-Content $outPath -Raw
