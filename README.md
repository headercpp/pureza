# Pureza

Desinstalador profundo para Windows, com estética minimalista inspirada no macOS.

Remove programas, caça rastros no registro, limpa resíduos, monitora inicialização, mede disco, cria pontos de restauração, tritura arquivos — tudo em um app único, com animações suaves e tema escuro.

![Pureza](build/icon.png)

## Download

Baixe o instalador mais recente em [Releases](../../releases/latest).

Instalação em um clique: ao executar o `.exe`, Pureza se instala automaticamente no perfil do usuário, cria atalhos na área de trabalho e no Menu Iniciar e abre o app. Sem senha de administrador, sem telas de wizard.

## O que ele faz

- **Desinstalador profundo** com lista unificada de programas Win32 e UWP, scan de resíduos (registro, pastas, serviços, tarefas), ícones nativos
- **Visão geral** com stats em tempo real (CPU, RAM, disco, bateria, uptime, rede)
- **Limpeza inteligente** — cache, temp, logs, recentes, lixeira com medição real
- **Análise de disco** — gráfico das pastas mais pesadas
- **Inicialização** com medida de impacto real (RAM + status em execução)
- **Pontos de restauração** — criar, listar e excluir
- **Shredder** — destruir arquivos com múltiplas passagens
- **Doutor** — diagnóstico do PC com recomendações
- **Agendar limpeza** via Agendador de Tarefas do Windows
- **Catálogo winget** embutido para instalar apps
- **Conversor rápido** de imagens
- **Histórico** de todas as ações
- **Clima + geolocalização** por IP na topbar

## Desenvolvimento

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

O artefato sai em `release\Pureza-0.1.0-setup.exe`.

## Stack

Electron 30 · React 18 · TypeScript · Vite · Framer Motion · PowerShell para as operações nativas · electron-builder NSIS one-click.

## Licença

MIT © EduX
