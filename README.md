# Pureza

Desinstalador para Windows com cara de app de macOS. A ideia é juntar num app só o que normalmente você faria com meia dúzia de ferramentas diferentes (Revo, CCleaner, TreeSize, Autoruns, agendador, winget...) e deixar bonito de usar.

![Pureza](build/icon.png)

## Baixar

Vai em [Releases](../../releases/latest) e pega o `Pureza-0.1.0-setup.exe`.

Instalação em um clique: sem wizard, sem senha de admin, sem perguntar onde instalar. Cria atalho na área de trabalho e no Menu Iniciar, abre o app e pronto. Depois é só pesquisar "Pureza" no Windows.

## O que tem dentro

**Programas**
Lista completa dos apps instalados, tanto os Win32 (que ficam no Painel de Controle) quanto os da Microsoft Store (UWP), tudo junto. Mostra ícone, versão, data de instalação e tamanho. Busca por nome, ordena por qualquer coluna. Na hora de desinstalar, roda o scan: varre registro, pastas de AppData/ProgramData, serviços e tarefas agendadas que o app deixou pra trás, e te deixa escolher o que apagar junto.

**Visão geral**
Dashboard inicial com CPU, RAM, disco, bateria, uptime, nome da máquina e placa de vídeo. Atualiza em tempo real.

**Limpador**
Varre temp do Windows, temp do usuário, cache de navegadores, logs antigos, miniaturas, recentes, lixeira e prefetch. Mostra quanto tem em cada categoria antes de limpar — nada some sem você confirmar.

**Análise de disco**
Gráfico das pastas que mais ocupam espaço na sua máquina, pra achar rápido o que tá comendo os GBs.

**Inicialização**
Lista tudo que abre com o Windows (registro e pasta Startup), mostra o impacto real de cada um (quanto RAM consome, se tá rodando agora) e liga/desliga com um toggle.

**Pontos de restauração**
Cria, lista e apaga pontos de restauração do próprio Windows. Útil antes de uma desinstalação pesada.

**Shredder**
Destrói arquivos de verdade, com múltiplas passagens de sobrescrita, pra não dar pra recuperar depois.

**Doutor**
Diagnóstico geral do PC. Olha uso de CPU, RAM, disco, processos pesados, serviços de mais, inicialização inflada, e devolve recomendações do que fazer.

**Agendador**
Agenda limpezas recorrentes (diário ou semanal) usando o próprio Agendador de Tarefas do Windows.

**Catálogo**
Busca e instala programas pelo winget, sem abrir terminal. Instalação silenciosa.

**Conversor**
Converte imagens rapidamente entre PNG, JPG e WebP.

**Histórico**
Guarda tudo que você fez no app (desinstalações, limpezas, agendamentos) pra consultar depois.

**Topbar**
Mostra cidade, estado e clima atual, detectados pelo seu IP.

## Rodar em desenvolvimento

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

Electron 30, React 18, TypeScript, Vite, Framer Motion no front. As operações do sistema (listar programas, limpar temp, gerenciar startup, criar pontos de restauração) são feitas via PowerShell, chamado do processo principal do Electron por IPC. Instalador NSIS one-click via electron-builder.

## Licença

MIT. Pode usar, modificar e distribuir à vontade.
