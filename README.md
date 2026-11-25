# Pureza

Desinstalador para Windows com cara de app de macOS.

![Pureza](build/icon.png)

## Baixar

Vai em [Releases](../../releases/latest) e pega o `Pureza-0.1.0-setup.exe`.

Instala com um clique, sem wizard, sem senha de admin. Cria atalho na área de trabalho e no Menu Iniciar.

## O que tem dentro

- Lista de programas Win32 e UWP com busca, ordenação e ícones
- Scan de resíduos (registro, pastas, serviços, tarefas) na hora de desinstalar
- Limpeza de temp, cache, logs, lixeira
- Análise de disco em gráfico
- Inicialização do Windows com impacto real
- Pontos de restauração
- Shredder de arquivos
- Doutor com diagnóstico e recomendações
- Agendamento de limpezas
- Catálogo winget pra instalar coisas novas
- Conversor de imagens
- Histórico de tudo que você fez
- Clima e cidade na barra de cima

## Rodar em dev

```powershell
npm install
npm run dev
```

Em outro terminal:

```powershell
npm run electron
```

Build do instalador:

```powershell
npm run build
```

Sai em `release\Pureza-0.1.0-setup.exe`.

## Stack

Electron, React, TypeScript, Vite, Framer Motion. PowerShell nas operações do sistema.

## Licença

MIT
