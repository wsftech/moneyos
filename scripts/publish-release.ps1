#Requires -Version 5.1
<#
.SYNOPSIS
  Bump de versao, build assinado, tag e publicacao no GitHub Releases.

.EXAMPLE
  .\scripts\publish-release.ps1 -Bump patch
  .\scripts\publish-release.ps1 -Version "0.2.0" -Notes "Nova tela de relatorios."
#>
param(
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump = "patch",

  [string]$Version = "",

  [string]$Notes = "",

  [switch]$SkipBuild,

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Get-NextVersion([string]$current, [string]$kind) {
  $parts = $current.Split(".")
  if ($parts.Count -lt 3) { throw "Versao atual invalida: $current" }
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  $patch = [int]$parts[2]
  switch ($kind) {
    "major" { return "$($major + 1).0.0" }
    "minor" { return "$major.$($minor + 1).0" }
    default { return "$major.$minor.$($patch + 1)" }
  }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git nao encontrado no PATH."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) nao encontrado. Instale: https://cli.github.com/"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node nao encontrado no PATH."
}

$status = git status --porcelain
if ($status) {
  throw "Working tree suja. Faca commit ou stash antes de publicar."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") {
  throw "Publique a partir de main (branch atual: $branch)."
}

$pkg = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$current = [string]$pkg.version
if (-not $Version) {
  $Version = Get-NextVersion $current $Bump
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Versao invalida: $Version"
}

$tag = "v$Version"
$existingTag = git tag -l $tag
if ($existingTag) {
  throw "Tag $tag ja existe."
}

if (-not $Notes) {
  $lastTag = (git describe --tags --abbrev=0 2>$null)
  if ($lastTag) {
    $log = git log "$lastTag..HEAD" --pretty=format:"- %s"
    if ($log) { $Notes = ($log | Out-String).Trim() }
  }
  if (-not $Notes) {
    $Notes = "WSF Money $Version"
  }
}

function Get-GithubRepoName {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $fromGh = gh repo view --json nameWithOwner --jq ".nameWithOwner" 2>$null
    if ($LASTEXITCODE -eq 0 -and $fromGh) { return [string]$fromGh.Trim() }
  } catch {
    # GraphQL da CLI às vezes cai (503); cai no remote do git.
  } finally {
    $ErrorActionPreference = $prev
  }

  $origin = (git remote get-url origin).Trim()
  if ($origin -match 'github\.com[:/](.+?)(?:\.git)?$') {
    return $Matches[1]
  }
  throw "Nao foi possivel detectar o repositorio GitHub. Rode gh auth login."
}

$repo = Get-GithubRepoName

Write-Host ""
Write-Host "Publicar WSF Money $current -> $Version" -ForegroundColor Cyan
Write-Host "  Tag:     $tag"
Write-Host "  Repo:    $repo"
Write-Host "  Notas:   $Notes"
if ($DryRun) {
  Write-Host "Dry run: nenhuma alteracao feita." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "1/5 Atualizando versao..."
node (Join-Path $Root "scripts\set-version.cjs") $Version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipBuild) {
  Write-Host ""
  Write-Host "2/5 Compilando instalador assinado..."
  & (Join-Path $Root "scripts\build-release.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host ""
  Write-Host "2/5 Build ignorado (-SkipBuild)" -ForegroundColor Yellow
}

$nsisDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$setup = Get-ChildItem $nsisDir -Filter "*$Version*setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $setup) {
  throw "Instalador $Version nao encontrado em $nsisDir"
}
$sig = Get-Item "$($setup.FullName).sig" -ErrorAction SilentlyContinue
if (-not $sig) {
  throw "Assinatura nao encontrada: $($setup.FullName).sig"
}

Write-Host ""
Write-Host "3/5 Gerando latest.json..."
$baseUrl = "https://github.com/$repo/releases/download/$tag"
& (Join-Path $Root "scripts\generate-latest-json.ps1") -Version $Version -BaseUrl $baseUrl -Notes $Notes
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "4/5 Commit, tag e push..."
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
$pending = git diff --cached --name-only
if (-not $pending) {
  throw "Nenhum arquivo de versao para commitar."
}
git commit -m "chore: bump version to $Version"
git tag -a $tag -m "WSF Money $Version"
git push origin HEAD
git push origin $tag

$remoteName = ($setup.Name -replace ' +', '.')
Write-Host ""
Write-Host "5/5 Criando GitHub Release..."
$notesFile = Join-Path $env:TEMP "wsf-money-release-notes.txt"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($notesFile, $Notes, $utf8NoBom)
$releaseExit = 0
try {
  gh release create $tag `
    --title "WSF Money $Version" `
    --notes-file $notesFile `
    --latest `
    "$($setup.FullName)#$remoteName" `
    "$($sig.FullName)#$remoteName.sig" `
    "latest.json#latest.json"
  $releaseExit = $LASTEXITCODE
} catch {
  throw "Falha ao criar a GitHub Release (tag $tag ja foi enviada). Rode: gh release create $tag --title `"WSF Money $Version`" --latest <arquivos>"
}
if ($releaseExit -ne 0) {
  throw "gh release create falhou (codigo $releaseExit). A tag $tag existe, mas o instalador ainda nao foi publicado."
}

Write-Host ""
Write-Host "Release publicada: https://github.com/$repo/releases/tag/$tag" -ForegroundColor Green
Write-Host "Instalador: https://github.com/$repo/releases/download/$tag/$remoteName"
