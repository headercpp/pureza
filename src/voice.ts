type Command = { phrases: string[]; action: string };

const COMMANDS: Command[] = [
  { phrases: ["visão geral", "visao geral", "hub", "página inicial", "pagina inicial"], action: "view:hub" },
  { phrases: ["programas", "desinstalador"], action: "view:programs" },
  { phrases: ["inicialização", "inicializacao", "startup"], action: "view:startup" },
  { phrases: ["limpeza", "limpar", "limpar tudo"], action: "view:cleaner" },
  { phrases: ["análise de disco", "analise de disco", "disco", "armazenamento"], action: "view:disk" },
  { phrases: ["restauração", "restauracao"], action: "view:restore" },
  { phrases: ["shredder", "triturar", "destruir arquivo"], action: "view:shredder" },
  { phrases: ["histórico", "historico"], action: "view:history" },
  { phrases: ["catálogo", "catalogo", "instalar"], action: "view:winget" },
  { phrases: ["doutor", "doctor", "diagnóstico", "diagnostico", "por que meu pc", "ta lento", "está lento"], action: "view:doctor" },
  { phrases: ["converter", "conversor"], action: "view:convert" },
  { phrases: ["tema escuro", "modo escuro", "dark"], action: "theme:dark" },
  { phrases: ["tema claro", "modo claro", "light"], action: "theme:light" },
];

export function matchCommand(transcript: string): string | null {
  const t = transcript.toLowerCase().trim();
  for (const c of COMMANDS) {
    for (const p of c.phrases) {
      if (t.includes(p)) return c.action;
    }
  }
  return null;
}

export function createRecognizer(onResult: (text: string, action: string | null) => void, onState: (state: "idle" | "listening") => void) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "pt-BR";
  rec.continuous = false;
  rec.interimResults = false;
  rec.onstart = () => onState("listening");
  rec.onend = () => onState("idle");
  rec.onresult = (ev: any) => {
    const t = ev.results[0]?.[0]?.transcript ?? "";
    onResult(t, matchCommand(t));
  };
  rec.onerror = () => onState("idle");
  return rec;
}

export const AVAILABLE_COMMANDS = COMMANDS;
