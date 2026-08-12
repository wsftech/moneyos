#Requires -Version 5.1
<#
.SYNOPSIS
  Configura chaves de assinatura para builds e atualizacoes do WSF Money.

.DESCRIPTION
  1. Gera par de chaves minisign (se ainda nao existir)
  2. Copia tauri.release.conf.json.example para tauri.release.conf.json
  3. Insere a chave publica no arquivo de release

  IMPORTANTE: Guarde src-tauri\.signing\moneyos.key em local seguro.
  Sem a chave privada voce NAO podera publicar atualizacoes para usuarios instalados.
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
  npx tauri signer generate -w "src-tauri\.signing\moneyos.key" --ci
  Pop-Location
} else {
  Write-Host "Chaves ja existem em $SigningDir"
}

if (-not (Test-Path $PublicKey)) {
  throw "Chave publica nao encontrada: $PublicKey"
}

$pubContent = (Get-Content $PublicKey -Raw).Trim()

if (-not (Test-Path $ReleaseConfig)) {
  Copy-Item $ReleaseExample $ReleaseConfig
  Write-Host "Criado $ReleaseConfig - edite a URL do GitHub Releases."
} else {
  Write-Host "Mantendo $ReleaseConfig existente."
}

Push-Location $Root
node -e @"
const fs = require('fs');
const pubkey = process.argv[1];
for (const file of ['src-tauri/tauri.conf.json', 'src-tauri/tauri.release.conf.json']) {
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.plugins) data.plugins = {};
  if (!data.plugins.updater) data.plugins.updater = {};
  data.plugins.updater.pubkey = pubkey;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
"@ $pubContent
Pop-Location

Write-Host ""
Write-Host "Setup concluido!" -ForegroundColor Green
Write-Host "  Chave privada: $PrivateKey"
Write-Host "  Chave publica:  $PublicKey"
Write-Host ""
Write-Host "Proximos passos:"
Write-Host "  1. Edite src-tauri\tauri.conf.json - endpoints com sua URL de releases"
Write-Host "  2. Build: npm run tauri:build:release"
Write-Host "  3. Publique latest.json + instalador no GitHub Releases"
