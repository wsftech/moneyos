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

### 3. Opção B — Publicar manualmente

Útil quando o build local já está pronto ou para validar antes do CI.

```powershell
# 1) Build assinado (opcionalmente já bumpa a versão)
.\scripts\build-release.ps1 -Version "0.1.3"

# 2) Gerar latest.json apontando para a URL da release
.\scripts\generate-latest-json.ps1 `
  -Version "0.1.3" `
  -BaseUrl "https://github.com/wsftech/moneyos/releases/download/v0.1.3" `
  -Notes "Correções e melhorias."
```

Artefatos gerados:

- Instalador: `src-tauri\target\release\bundle\nsis\*-setup.exe` (+ `.sig`)
- Manifesto: `latest.json` na raiz do projeto

> **Atenção:** o `gh` sobe o instalador como `WSF.Money_...` (ponto no lugar do espaço). O script `generate-latest-json.ps1` já gera a URL com esse nome. Se o download der **404**, abra o `latest.json` e confira se a URL usa `WSF.Money_` e não `WSF%20Money_`.

Publique no GitHub:

```powershell
# Criar release + upload (requer GitHub CLI: https://cli.github.com/)
gh release create v0.1.3 `
  --title "v0.1.3" `
  --notes "Correções e melhorias." `
  "src-tauri\target\release\bundle\nsis\*-setup.exe" `
  "src-tauri\target\release\bundle\nsis\*-setup.exe.sig" `
  latest.json
```

Se preferir pela UI: **Releases → Draft a new release** → tag `v0.1.3` → anexe o instalador, o `.sig` e o `latest.json`.

### 4. Checklist pós-publicação

- [ ] Tag `vX.Y.Z` existe no remoto
- [ ] Release **Latest** contém `latest.json`, instalador e assinatura
- [ ] URL do instalador no `latest.json` bate com o arquivo publicado
- [ ] Em um app instalado, a checagem de atualização encontra a nova versão

### 5. Scripts relacionados

| Script | Uso |
| --- | --- |
| `scripts/setup-release.ps1` | Gera chaves e configura pubkey |
| `scripts/set-version.cjs` | Atualiza versão em `package.json` e `tauri.conf.json` |
| `scripts/build-release.ps1` | Build NSIS assinado (+ updater artifacts) |
| `scripts/generate-latest-json.ps1` | Monta `latest.json` a partir do build |

Exemplo só de bump de versão (sem build):

```powershell
node scripts/set-version.cjs 0.1.3
```