export interface CatalogEntry {
  id: string;
  name: string;
  vendor: string;
  category: "Navegadores" | "Dev" | "Mídia" | "Comunicação" | "Produtividade" | "Utilitários" | "Jogos";
  tagline: string;
  color: string;
}

export const CATALOG: CatalogEntry[] = [
  { id: "Google.Chrome", name: "Google Chrome", vendor: "Google", category: "Navegadores", tagline: "Navegador rápido", color: "#4285F4" },
  { id: "Mozilla.Firefox", name: "Firefox", vendor: "Mozilla", category: "Navegadores", tagline: "Código aberto, privacidade", color: "#ff7139" },
  { id: "Brave.Brave", name: "Brave", vendor: "Brave", category: "Navegadores", tagline: "Bloqueia anúncios por padrão", color: "#fb542b" },
  { id: "Microsoft.Edge", name: "Microsoft Edge", vendor: "Microsoft", category: "Navegadores", tagline: "Baseado em Chromium", color: "#0078d4" },
  { id: "Opera.Opera", name: "Opera", vendor: "Opera", category: "Navegadores", tagline: "VPN integrado", color: "#ff1b2d" },

  { id: "Microsoft.VisualStudioCode", name: "Visual Studio Code", vendor: "Microsoft", category: "Dev", tagline: "Editor de código", color: "#2d7fd4" },
  { id: "Git.Git", name: "Git", vendor: "Git", category: "Dev", tagline: "Controle de versão", color: "#f05032" },
  { id: "GitHub.GitHubDesktop", name: "GitHub Desktop", vendor: "GitHub", category: "Dev", tagline: "Cliente git visual", color: "#24292e" },
  { id: "OpenJS.NodeJS.LTS", name: "Node.js LTS", vendor: "OpenJS", category: "Dev", tagline: "Runtime JavaScript", color: "#3c873a" },
  { id: "Python.Python.3.12", name: "Python 3.12", vendor: "Python", category: "Dev", tagline: "Linguagem de programação", color: "#3776ab" },
  { id: "Docker.DockerDesktop", name: "Docker Desktop", vendor: "Docker", category: "Dev", tagline: "Containers e desenvolvimento", color: "#2496ed" },
  { id: "Postman.Postman", name: "Postman", vendor: "Postman", category: "Dev", tagline: "Teste de APIs", color: "#ff6c37" },

  { id: "VideoLAN.VLC", name: "VLC Media Player", vendor: "VideoLAN", category: "Mídia", tagline: "Toca qualquer vídeo", color: "#ff8800" },
  { id: "Spotify.Spotify", name: "Spotify", vendor: "Spotify", category: "Mídia", tagline: "Música sob demanda", color: "#1db954" },
  { id: "OBSProject.OBSStudio", name: "OBS Studio", vendor: "OBS", category: "Mídia", tagline: "Gravação e streaming", color: "#302e31" },
  { id: "Audacity.Audacity", name: "Audacity", vendor: "Audacity", category: "Mídia", tagline: "Editor de áudio", color: "#0e73c7" },
  { id: "HandBrake.HandBrake", name: "HandBrake", vendor: "HandBrake", category: "Mídia", tagline: "Transcoder de vídeo", color: "#424242" },

  { id: "Discord.Discord", name: "Discord", vendor: "Discord", category: "Comunicação", tagline: "Chat de voz e texto", color: "#5865F2" },
  { id: "WhatsApp.WhatsApp", name: "WhatsApp", vendor: "Meta", category: "Comunicação", tagline: "Mensagens", color: "#25d366" },
  { id: "Telegram.TelegramDesktop", name: "Telegram", vendor: "Telegram", category: "Comunicação", tagline: "Mensagens na nuvem", color: "#0088cc" },
  { id: "SlackTechnologies.Slack", name: "Slack", vendor: "Slack", category: "Comunicação", tagline: "Comunicação de time", color: "#4a154b" },
  { id: "Zoom.Zoom", name: "Zoom", vendor: "Zoom", category: "Comunicação", tagline: "Videochamadas", color: "#2d8cff" },

  { id: "Notion.Notion", name: "Notion", vendor: "Notion", category: "Produtividade", tagline: "Notas e workspaces", color: "#2f2f2f" },
  { id: "Obsidian.Obsidian", name: "Obsidian", vendor: "Obsidian", category: "Produtividade", tagline: "Notas com links", color: "#7b3ff2" },
  { id: "Figma.Figma", name: "Figma", vendor: "Figma", category: "Produtividade", tagline: "Design colaborativo", color: "#a259ff" },
  { id: "Adobe.Acrobat.Reader.64-bit", name: "Adobe Acrobat Reader", vendor: "Adobe", category: "Produtividade", tagline: "Leitor de PDF", color: "#ec1c24" },

  { id: "7zip.7zip", name: "7-Zip", vendor: "Igor Pavlov", category: "Utilitários", tagline: "Compactador", color: "#555" },
  { id: "WinDirStat.WinDirStat", name: "WinDirStat", vendor: "WinDirStat", category: "Utilitários", tagline: "Mapa de uso do disco", color: "#1b9e3e" },
  { id: "voidtools.Everything", name: "Everything", vendor: "voidtools", category: "Utilitários", tagline: "Busca instantânea de arquivos", color: "#2d7fd4" },
  { id: "Microsoft.PowerToys", name: "PowerToys", vendor: "Microsoft", category: "Utilitários", tagline: "Ferramentas pra power users", color: "#0078d4" },
  { id: "Rufus.Rufus", name: "Rufus", vendor: "Rufus", category: "Utilitários", tagline: "Criar USB bootável", color: "#282a36" },
  { id: "Greenshot.Greenshot", name: "Greenshot", vendor: "Greenshot", category: "Utilitários", tagline: "Capturas de tela", color: "#179c00" },

  { id: "Valve.Steam", name: "Steam", vendor: "Valve", category: "Jogos", tagline: "Loja e plataforma de jogos", color: "#1b2838" },
  { id: "EpicGames.EpicGamesLauncher", name: "Epic Games Launcher", vendor: "Epic", category: "Jogos", tagline: "Jogos grátis semanais", color: "#2f2d2e" },
  { id: "ElectronicArts.EADesktop", name: "EA Desktop", vendor: "EA", category: "Jogos", tagline: "Launcher da EA", color: "#000000" },
];
