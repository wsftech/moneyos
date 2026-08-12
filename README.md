# WSF Money

Aplicativo desktop de controle financeiro (pessoal e empresarial), feito com **Tauri 2 + React + TypeScript**.

## Desenvolvimento

Pré-requisitos: [Node.js](https://nodejs.org/), [Rust](https://rustup.rs/) e as dependências do [Tauri no Windows](https://v2.tauri.app/start/prerequisites/).

```powershell
npm install
npm run tauri:dev
```

IDE recomendada: [VS Code](https://code.visualstudio.com/) + extensões [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) e [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Publicação de versões (GitHub Releases)

O updater do app consulta:

`https://github.com/wsftech/moneyos/releases/latest/download/latest.json`

**Requisito:** o repositório (ou pelo menos os assets da release) precisa ser **público**. Com repo privado o GitHub responde 404 sem autenticação e o app instalado **não encontra atualizações**.

Cada release precisa publicar pelo menos:

| Arquivo | Função |
| --- | --- |
| `*-setup.exe` | Instalador NSIS Windows |
| `*.sig` (do instalador) | Assinatura do updater |
| `latest.json` | Manifesto que o app baixa para atualizar |

Repositório de referência: [wsftech/moneyos](https://github.com/wsftech/moneyos).

### 1. Setup único (assinatura)

Na primeira vez (ou em uma máquina nova):

```powershell
.\scripts\setup-release.ps1
```

Isso gera o par de chaves em `src-tauri\.signing\` e injeta a chave pública no `tauri.conf.json`.

**Importante**

- Guarde `src-tauri\.signing\moneyos.key` em local seguro (não versionar).
- Sem a chave privada você **não** consegue assinar atualizações para quem já instalou o app.
- No GitHub, configure os secrets (para o workflow de CI):
  - `TAURI_SIGNING_PRIVATE_KEY` — conteúdo de `moneyos.key`
  - `TAURI_UPDATER_PUBKEY` — conteúdo de `moneyos.key.pub`

### 2. Opção A — Publicar via tag (CI)

O workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) roda ao enviar uma tag `v*`:

1. Atualize o código e faça commit.
2. Crie e envie a tag:

```powershell
# Exemplo: versão 0.1.3
node scripts/set-version.cjs 0.1.3

# (opcional) alinhar Cargo.toml
(Get-Content src-tauri\Cargo.toml) -replace '^version = ".*"','version = "0.1.3"' |
  Set-Content src-tauri\Cargo.toml -Encoding utf8

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "chore: bump version to 0.1.3"
git push

git tag v0.1.3
git push origin v0.1.3
```

3. Acompanhe o Actions: o job gera o instalador assinado, o `latest.json` e sobe os artefatos na release da tag.
4. Confira em **Releases** se existem o `.exe`, o `.sig` e o `latest.json` na release mais recente.

### 3. Opção B — Um comando (local)

Com a working tree limpa em `main`:

```powershell
# patch 0.1.8 -> 0.1.9 (padrão)
.\scripts\publish-release.ps1

# ou:
.\scripts\publish-release.ps1 -Bump minor
.\scripts\publish-release.ps1 -Version "0.2.0" -Notes "Nova tela de relatorios."
```

O script: atualiza a versão → pede a senha da chave → gera o instalador → commit/tag/push → publica no GitHub (`setup.exe`, `.sig`, `latest.json`).

Requer [GitHub CLI](https://cli.github.com/) autenticado (`gh auth login`). A senha da chave **não** fica no repositório; use o prompt ou a variável `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Só build (sem publicar):

```powershell
.\scripts\build-release.ps1 -Version "0.1.9"
```

### 4. Checklist pós-publicação

- [ ] Tag `vX.Y.Z` existe no remoto
- [ ] Release **Latest** contém `latest.json`, instalador e assinatura
- [ ] URL do instalador no `latest.json` bate com o arquivo publicado
- [ ] Em um app instalado, a checagem de atualização encontra a nova versão

### 5. Scripts relacionados

| Script | Uso |
| --- | --- |
| `scripts/setup-release.ps1` | Gera chaves e configura pubkey |
| `scripts/set-version.cjs` | Atualiza versão em `package.json`, `tauri.conf.json` e `Cargo.toml` |
| `scripts/build-release.ps1` | Build NSIS assinado (+ updater artifacts) |
| `scripts/generate-latest-json.ps1` | Monta `latest.json` a partir do build |
| `scripts/publish-release.ps1` | Bump + build + tag + GitHub Release |

Exemplo só de bump de versão (sem build):

```powershell
node scripts/set-version.cjs 0.1.3
```