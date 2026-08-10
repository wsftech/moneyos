#Requires -Version 5.1
<#
.SYNOPSIS
  Configura chaves de assinatura para builds e atualizações do Money OS.

.DESCRIPTION
  1. Gera par de chaves minisign (se ainda não existir)
  2. Copia tauri.release.conf.json.example → tauri.release.conf.json
  3. Insere a chave pública no arquivo de release

  IMPORTANTE: Guarde src-tauri\.signing\moneyos.key em local seguro.
  Sem a chave privada você NÃO poderá publicar atualizações para usuários instalados.
#>
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$SigningDir = Join-Path $Root "src-tauri\.signing"
$PrivateKey = Join-Path $SigningDir "moneyos.key"
$PublicKey = "$PrivateKey.pub"
$ReleaseExample = Join-Path $Root "src-tauri\tauri.release.conf.json.example"
$ReleaseConfig = Join-Path $Root "src-tauri\tauri.release.conf.json"

New-Item -ItemType Directory -Force -Path $SigningDir | Out-Null

if (-not (Test-Path $PrivateKey)) {
  Write-Host "Gerando chaves de assinatura..."
  Push-Location $Root
  npx tauri signer generate -w "src-tauri\.signing\moneyos.key"
  Pop-Location
} else {
  Write-Host "Chaves já existem em $SigningDir"
}

if (-not (Test-Path $PublicKey)) {
  throw "Chave pública não encontrada: $PublicKey"
}

$pubContent = (Get-Content $PublicKey -Raw).Trim()
$releaseJson = Get-Content $ReleaseExample -Raw

if (-not (Test-Path $ReleaseConfig)) {
  $releaseJson | Set-Content $ReleaseConfig -Encoding UTF8
  Write-Host "Criado $ReleaseConfig — edite a URL do GitHub Releases."
} else {
  Write-Host "Mantendo $ReleaseConfig existente."
}

# Atualiza pubkey no tauri.conf.json principal
$tauriConfPath = Join-Path $Root "src-tauri\tauri.conf.json"
$conf = Get-Content $tauriConfPath | ConvertFrom-Json
$conf.plugins.updater.pubkey = $pubContent
$conf | ConvertTo-Json -Depth 10 | Set-Content $tauriConfPath -Encoding UTF8

if (Test-Path $ReleaseConfig) {
  $rel = Get-Content $ReleaseConfig | ConvertFrom-Json
  $rel.plugins.updater.pubkey = $pubContent
  $rel | ConvertTo-Json -Depth 10 | Set-Content $ReleaseConfig -Encoding UTF8
}

Write-Host ""
Write-Host "Setup concluído!" -ForegroundColor Green
Write-Host "  Chave privada: $PrivateKey"
Write-Host "  Chave pública:  $PublicKey"
Write-Host ""
Write-Host "Próximos passos:"
Write-Host "  1. Edite src-tauri\tauri.conf.json → endpoints com sua URL de releases"
Write-Host "  2. Build: npm run tauri:build:release"
Write-Host "  3. Publique latest.json + instalador no GitHub Releases"
