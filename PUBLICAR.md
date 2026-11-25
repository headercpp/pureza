# Como publicar no GitHub

Projeto pronto. Falta só instalar o Git e empurrar.

## 1. Instalar o Git

Baixe o instalador oficial: https://git-scm.com/download/win

Abra um **novo PowerShell** após instalar (pra pegar o PATH).

## 2. Criar o repositório no GitHub

Vá em https://github.com/new, crie um repo chamado **`pureza`** (ou outro nome), **sem** README/gitignore/license (já temos).

## 3. Rodar daqui

```powershell
cd C:\Users\Administrator\Documents\Desinstalador
git init -b main
git add .
git commit -m "feat: Pureza v0.1.0 — desinstalador profundo Apple-style"
git remote add origin https://github.com/SEU_USUARIO/pureza.git
git push -u origin main
```

Troque `SEU_USUARIO` pelo seu nick do GitHub.

## 4. Publicar release com o instalador

Depois de empurrar:

```powershell
# instale o gh (GitHub CLI) se ainda nao tiver: https://cli.github.com/
gh auth login
gh release create v0.1.0 release\Pureza-0.1.0-setup.exe --title "Pureza 0.1.0" --notes "Primeira release publica. Instalador NSIS para Windows x64."
```

Ou, pela web:
1. Vá no repo em `github.com/SEU_USUARIO/pureza/releases/new`
2. Tag: `v0.1.0`, título: `Pureza 0.1.0`
3. Arraste o arquivo `release\Pureza-0.1.0-setup.exe` pra área de upload
4. Publique

## Pronto

O instalador ficará disponível em:
`https://github.com/SEU_USUARIO/pureza/releases/download/v0.1.0/Pureza-0.1.0-setup.exe`
