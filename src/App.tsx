import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate as motionAnimate, motion, useMotionValue, useTransform } from "framer-motion";
import type { InstalledApp, ScanResult, ApplyResult, StartupItem, CleanerCategory, DiskFolder, RestorePoint, HistoryEntry, ScheduledTask, SystemStats, WingetItem, HealthScore, Recommendation, DoctorResult } from "./types";
import { playListenChime, playSoftTick } from "./sound";
import { CATALOG, CatalogEntry } from "./catalog";
import Intro from "./Intro";

const GENERIC_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#9aa0a6'/><stop offset='1' stop-color='#5f6368'/></linearGradient></defs><rect width='48' height='48' rx='10' fill='url(#g)'/><path d='M24 14l8 5v10l-8 5-8-5V19z' fill='#fff' fill-opacity='.92'/><path d='M24 14v10l8 5M24 24l-8 5M24 24V14' stroke='#5f6368' stroke-width='1.2' fill='none' opacity='.5'/></svg>`
  );

const PALETTE = [
  "#4285F4,#1a73e8", "#1db954,#0f7a37", "#5865F2,#3a44b8",
  "#2d7fd4,#1b5fa8", "#1b2838,#3a5169", "#a259ff,#f24e1e",
  "#2f2f2f,#111111", "#31a8ff,#001e36", "#25d366,#128c7e",
  "#ff6b5b,#c0392b", "#f59e0b,#d97706", "#64748b,#334155",
];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "??";
}
function gradientFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function formatSize(kb?: number) {
  if (!kb) return { v: "—", u: "" };
  if (kb >= 1024 * 1024) return { v: (kb / 1024 / 1024).toFixed(1).replace(".", ","), u: "GB" };
  if (kb >= 1024) return { v: Math.round(kb / 1024).toString(), u: "MB" };
  return { v: kb.toString(), u: "KB" };
}
function formatDate(d?: string) {
  if (!d || d.length !== 8) return "—";
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${parseInt(d.slice(6, 8), 10)} ${months[parseInt(d.slice(4, 6), 10) - 1]} ${d.slice(0, 4)}`;
}

type Phase =
  | "idle"
  | "restore"
  | "uninstalling"
  | "scanning"
  | "reviewing"
  | "applying"
  | "done";

const PHASE_LABEL: Record<Exclude<Phase, "idle" | "reviewing" | "done">, string> = {
  restore: "Criando ponto de restauração…",
  uninstalling: "Executando desinstalador…",
  scanning: "Varrendo rastros profundos…",
  applying: "Apagando selecionados…",
};

export default function App() {
  const theme = "dark" as const;
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [view, setView] = useState<"hub" | "programs" | "startup" | "cleaner" | "disk" | "restore" | "shredder" | "history" | "winget" | "doctor" | "convert" | "internet">("hub");
  const [presentation, setPresentation] = useState(false);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [wingetQuery, setWingetQuery] = useState("");
  const [wingetResults, setWingetResults] = useState<WingetItem[]>([]);
  const [wingetBusy, setWingetBusy] = useState<string | null>(null);
  const [wingetSearching, setWingetSearching] = useState(false);
  const [wingetOk, setWingetOk] = useState<boolean | null>(null);
  const [catalogCat, setCatalogCat] = useState<string>("Todos");
  const [showIntro, setShowIntro] = useState<boolean>(true);
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [temps, setTemps] = useState<{ cpu: number | null; gpu: number | null } | null>(null);
  const [doctor, setDoctor] = useState<DoctorResult | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [netTest, setNetTest] = useState<{
    down: number | null;
    up: number | null;
    ping: number | null;
    busy: boolean;
    phase: "idle" | "ping" | "download" | "upload" | "done";
    history: number[];
  }>({ down: null, up: null, ping: null, busy: false, phase: "idle", history: [] });
  const [convertFiles, setConvertFiles] = useState<string[]>([]);
  const [convertTarget, setConvertTarget] = useState("jpg");
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertResult, setConvertResult] = useState<{ done: number; errors: string[] } | null>(null);
  const [publicIp, setPublicIp] = useState<{ city?: string; region?: string; region_code?: string; country_code?: string; country_name?: string; latitude?: number; longitude?: number } | null>(null);
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("pureza-rec-dismissed") || "[]")); } catch { return new Set(); }
  });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "heavy" | "dated">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [startup, setStartup] = useState<StartupItem[]>([]);
  const [startupBusy, setStartupBusy] = useState<string | null>(null);
  const [cleaner, setCleaner] = useState<CleanerCategory[] | null>(null);
  const [cleanerChecked, setCleanerChecked] = useState<Record<string, boolean>>({});
  const [cleanerBusy, setCleanerBusy] = useState(false);
  const [cleanerResult, setCleanerResult] = useState<{ cleanedKB: number; errors: string[] } | null>(null);
  const [disk, setDisk] = useState<DiskFolder[] | null>(null);
  const [restorePoints, setRestorePoints] = useState<RestorePoint[] | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [showStore, setShowStore] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleFreq, setScheduleFreq] = useState<"daily" | "weekly">("weekly");
  const [scheduleTime, setScheduleTime] = useState("03:00");
  const [shredFiles, setShredFiles] = useState<string[]>([]);
  const [shredPasses, setShredPasses] = useState(3);
  const [shredding, setShredding] = useState(false);
  const [shredResult, setShredResult] = useState<{ files: number; bytes: number; errors: string[] } | null>(null);
  const [impact, setImpact] = useState<Record<string, { impact: string; sizeKB: number; ramMB: number; running: boolean }>>({});
  const [cleanerTotal, setCleanerTotal] = useState<number | null>(null);
  const [residuals, setResiduals] = useState<Record<string, number>>({});
  const [opts, setOpts] = useState({ restore: true, registry: true, files: true, services: false });

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<string[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const loadApps = async () => {
    setLoadingList(true);
    try {
      const [classic, uwp] = await Promise.all([
        window.pureza?.apps?.list?.(),
        showStore ? window.pureza?.apps?.listUwp?.() : Promise.resolve([]),
      ]);
      const merged: InstalledApp[] = [
        ...(Array.isArray(classic) ? classic : []),
        ...(Array.isArray(uwp) ? uwp : []),
      ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setApps(merged);
      if (merged.length && !selected) setSelected(merged[0].name);
      const items = merged
        .filter((a) => !!a.key)
        .map((a) => ({
          key: a.key!,
          name: a.name,
          icon: a.displayIcon || a.logo || "",
          uninstall: a.uninstall || "",
          location: a.location || "",
        }));
      if (items.length) {
        window.pureza.apps.icons(items).then((res) => {
          console.log("[Pureza] ícones:", Object.keys(res).length, "/", items.length);
          setIcons((prev) => ({ ...prev, ...res }));
        });
      }
    } catch (e) {
      console.error("[Pureza] erro ao listar:", e);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, [showStore]);

  useEffect(() => {
    window.pureza.cleaner.scan().then((cats) => {
      setCleanerTotal(cats.reduce((s, c) => s + (c.sizeKB || 0), 0));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (residuals[selected] !== undefined) return;
    const t = window.setTimeout(async () => {
      const s = await window.pureza.apps.scan(selected);
      const total = s.files.reduce((sum, f) => sum + (f.sizeKB || 0), 0);
      setResiduals((prev) => ({ ...prev, [selected]: total }));
    }, 700);
    return () => window.clearTimeout(t);
  }, [selected]);

  useEffect(() => {
    let cachedIp: typeof publicIp = null;
    try {
      const cached = sessionStorage.getItem("pureza-ip-v3");
      if (cached) { cachedIp = JSON.parse(cached); setPublicIp(cachedIp); }
    } catch {}
    let intervalId: number | undefined;
    (async () => {
      let info = cachedIp;
      if (!info) {
        const d = await window.pureza.geo.info();
        if (d) {
          info = d;
          setPublicIp(info);
          try { sessionStorage.setItem("pureza-ip-v3", JSON.stringify(info)); } catch {}
        }
      }
      if (info && info.latitude && info.longitude) {
        const loadWeather = async () => {
          const w = await window.pureza.geo.weather(info!.latitude!, info!.longitude!);
          if (w) setWeather(w);
        };
        loadWeather();
        intervalId = window.setInterval(loadWeather, 5 * 60 * 1000);
      }
    })();
    return () => { if (intervalId) window.clearInterval(intervalId); };
  }, []);

  const loadStartup = async () => {
    try {
      const [items, imp] = await Promise.all([
        window.pureza.startup.list(),
        window.pureza.startup.impact(),
      ]);
      setStartup(items);
      setImpact(imp);
    } catch (e) {
      console.error("[Pureza] startup erro:", e);
    }
  };
  const loadHistory = async () => setHistory(await window.pureza.history.list());
  const loadSchedules = async () => setSchedules(await window.pureza.schedule.list());
  async function logHistory(entry: Omit<HistoryEntry, "id" | "ts">) {
    await window.pureza.history.add(entry);
  }

  function navTo(v: typeof view) {
    if (v === view) return;
    playSoftTick();
    setView(v);
  }

  async function runInternetTest() {
    setNetTest({ down: null, up: null, ping: null, busy: true, phase: "ping", history: [] });
    try {
      // PING: 5 amostras
      const pings: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        try { await fetch("https://speed.cloudflare.com/__down?bytes=0&cachebust=" + Date.now(), { cache: "no-store" }); } catch {}
        pings.push(performance.now() - t);
        const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
        setNetTest((p) => ({ ...p, ping: avg }));
      }

      // DOWNLOAD: 3 streams paralelos de 100MB, lê até 10s, atualiza a cada 100ms
      setNetTest((p) => ({ ...p, phase: "download", down: 0, history: [] }));
      const abort = new AbortController();
      const DOWN_SECS = 10;
      const totalRef = { n: 0 };
      const start = performance.now();
      setTimeout(() => abort.abort(), DOWN_SECS * 1000);
      const streams = Array.from({ length: 3 }, (_, k) =>
        (async () => {
          try {
            const url = `https://speed.cloudflare.com/__down?bytes=100000000&cachebust=${Date.now()}_${k}`;
            const r = await fetch(url, { cache: "no-store", signal: abort.signal });
            if (!r.body) return;
            const reader = r.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done || abort.signal.aborted) break;
              totalRef.n += value.byteLength;
            }
          } catch {}
        })()
      );
      const tick = window.setInterval(() => {
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed <= 0) return;
        const mbps = Math.round((totalRef.n * 8) / 1e6 / elapsed);
        setNetTest((p) => ({ ...p, down: mbps, history: [...p.history.slice(-80), mbps] }));
      }, 100);
      await Promise.all(streams);
      window.clearInterval(tick);
      const elapsed = (performance.now() - start) / 1000;
      const finalDown = Math.round((totalRef.n * 8) / 1e6 / elapsed);
      setNetTest((p) => ({ ...p, down: finalDown }));

      // UPLOAD: envia chunks de 2MB continuamente até 10s
      setNetTest((p) => ({ ...p, phase: "upload", up: 0, history: [] }));
      const upAbort = new AbortController();
      const upRef = { n: 0 };
      const upStart = performance.now();
      setTimeout(() => upAbort.abort(), DOWN_SECS * 1000);
      const chunk = new Uint8Array(2 * 1024 * 1024);
      const seed = new Uint8Array(65536);
      crypto.getRandomValues(seed);
      for (let i = 0; i < chunk.length; i += seed.length) chunk.set(seed.subarray(0, Math.min(seed.length, chunk.length - i)), i);
      const upTick = window.setInterval(() => {
        const elapsed = (performance.now() - upStart) / 1000;
        if (elapsed <= 0) return;
        const mbps = Math.round((upRef.n * 8) / 1e6 / elapsed);
        setNetTest((p) => ({ ...p, up: mbps, history: [...p.history.slice(-80), mbps] }));
      }, 100);
      try {
        while (!upAbort.signal.aborted) {
          const uStart = performance.now();
          await fetch("https://speed.cloudflare.com/__up", { method: "POST", body: chunk, cache: "no-store", signal: upAbort.signal });
          upRef.n += chunk.length;
          if ((performance.now() - uStart) < 50) continue;
        }
      } catch {}
      window.clearInterval(upTick);
      const upElapsed = (performance.now() - upStart) / 1000;
      const finalUp = Math.round((upRef.n * 8) / 1e6 / upElapsed);
      setNetTest((p) => ({ ...p, up: finalUp, busy: false, phase: "done" }));
    } catch {
      setNetTest((p) => ({ ...p, busy: false, phase: "idle" }));
    }
  }

  // Valor animado do número principal (interpola suavemente entre atualizações)
  const dispSpeed = useMotionValue(0);
  const dispSpeedRounded = useTransform(dispSpeed, (v) => Math.round(v));
  useEffect(() => {
    const target = netTest.phase === "upload" ? netTest.up : netTest.down;
    if (target === null || target === undefined) { dispSpeed.set(0); return; }
    const ctrl = motionAnimate(dispSpeed, target, { duration: 0.45, ease: [0.22, 0.61, 0.36, 1] });
    return () => ctrl.stop();
  }, [netTest.down, netTest.up, netTest.phase]);

  const dispArc = useMotionValue(553);
  useEffect(() => {
    const target = netTest.phase === "upload" ? netTest.up : netTest.down;
    const v = target || 0;
    const off = 553 * (1 - Math.min(v / 500, 1));
    const ctrl = motionAnimate(dispArc, off, { duration: 0.5, ease: [0.22, 0.61, 0.36, 1] });
    return () => ctrl.stop();
  }, [netTest.down, netTest.up, netTest.phase]);

const loadCleaner = async () => {
    setCleaner(null);
    const r = await window.pureza.cleaner.scan();
    setCleaner(r);
    const defaults: Record<string, boolean> = {};
    r.forEach((c) => { if (!c.id.startsWith("prefetch") && !c.id.startsWith("logs")) defaults[c.id] = true; });
    setCleanerChecked(defaults);
  };
  const loadDisk = async () => {
    setDisk(null);
    const r = await window.pureza.disk.analyze();
    setDisk(r);
  };
  const loadRestore = async () => {
    setRestorePoints(null);
    const r = await window.pureza.restore.list();
    setRestorePoints(r);
  };

  const loadStatsFull = async () => {
    console.log("[Pureza] loadStatsFull chamado");
    const s = await window.pureza.system.stats(true);
    console.log("[Pureza] stats recebidos:", s);
    setStats(s);
  };
  const loadStatsLive = async () => {
    const live = await window.pureza.system.stats(false);
    setStats((prev) => (prev ? { ...prev, ...live } : live));
  };

  useEffect(() => {
    if (view === "startup") loadStartup();
    if (view === "cleaner") { loadCleaner(); loadSchedules(); }
    if (view === "disk") loadDisk();
    if (view === "restore") loadRestore();
    if (view === "history") loadHistory();
    if (view === "hub") {
      loadStatsFull();
      loadHistory();
      loadStartup();
      window.pureza.health.compute().then(setHealth);
      window.pureza.recommendations.list().then(setRecs);
      window.pureza.doctor.temps().then((t) => setTemps({ cpu: t.cpu, gpu: t.gpu }));
    }
    if (view === "doctor") {
      setDoctor(null);
      setDoctorBusy(true);
      window.pureza.doctor.run().then((r) => { setDoctor(r); setDoctorBusy(false); });
    }
    if (view === "winget") {
      window.pureza.winget.available().then(setWingetOk);
    }
  }, [view]);

  useEffect(() => {
    if (view !== "hub") return;
    const id = window.setInterval(loadStatsLive, 2000);
    return () => window.clearInterval(id);
  }, [view]);

  async function toggleStartup(it: StartupItem) {
    setStartupBusy(it.id);
    await window.pureza.startup.toggle(it.id, !it.enabled);
    await loadStartup();
    setStartupBusy(null);
  }

  const filtered = useMemo(() => {
    let out = apps;
    if (filter === "heavy") out = out.filter((a) => (a.sizeKB ?? 0) > 500 * 1024);
    else if (filter === "dated") out = out.filter((a) => !!a.installDate);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((a) => a.name.toLowerCase().includes(q) || a.vendor?.toLowerCase().includes(q));
    return out;
  }, [apps, query, filter]);

  const current = apps.find((a) => a.name === selected);
  const recoverable = formatSize(cleanerTotal ?? 0);
  const w = window.pureza?.window;

  function pushLog(line: string) {
    setLog((l) => [...l, line]);
  }

  async function animateProgress(from: number, to: number, duration: number) {
    const start = performance.now();
    return new Promise<void>((resolve) => {
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        setProgress(from + (to - from) * p);
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  async function startUninstall() {
    if (!current) return;
    setLog([]);
    setScan(null);
    setApplyResult(null);
    setChecked({});
    setProgress(0);

    if (opts.restore) {
      setPhase("restore");
      pushLog(`› criando ponto de restauração "${current.name}"`);
      animateProgress(0, 0.15, 800);
      const r = await window.pureza.system.restorePoint(`Pureza — ${current.name}`);
      pushLog(r.ok ? "✓ ponto de restauração criado" : "⚠ não foi possível criar ponto");
    }

    setPhase("uninstalling");
    setProgress(0.2);
    pushLog("› executando desinstalador oficial");
    animateProgress(0.2, 0.45, 1000);
    if (current.uwp && current.key) {
      const r = await window.pureza.apps.removeUwp(current.key);
      pushLog(r.ok ? "✓ app UWP removido" : "⚠ falha ao remover UWP");
    } else {
      const cmd = current.quietUninstall || current.uninstall;
      if (cmd) {
        const r = await window.pureza.apps.uninstall(cmd);
        pushLog(r.ok ? "✓ desinstalador terminou" : "⚠ desinstalador reportou erro");
      } else {
        pushLog("⚠ sem UninstallString, indo direto pra varredura");
      }
    }

    setPhase("scanning");
    setProgress(0.5);
    pushLog(`› varrendo rastros de ${current.name}`);
    animateProgress(0.5, 0.95, 2000);
    const s = await window.pureza.apps.scan(current.name);
    setScan(s);
    setProgress(1);
    pushLog(
      `✓ ${s.registry.length} chaves, ${s.files.length} pastas, ${s.services.length} serviços, ${s.tasks.length} tarefas`
    );

    const initialChecked: Record<string, boolean> = {};
    if (opts.registry) s.registry.forEach((r) => (initialChecked[`reg:${r.path}`] = true));
    if (opts.files) s.files.forEach((f) => (initialChecked[`file:${f.path}`] = true));
    if (opts.services) s.services.forEach((sv) => (initialChecked[`svc:${sv.name}`] = true));
    s.tasks.forEach((t) => (initialChecked[`task:${t.path}${t.name}`] = true));
    setChecked(initialChecked);

    setTimeout(() => setPhase("reviewing"), 400);
  }

  async function applyDeletion() {
    if (!scan) return;
    const payload: ScanResult = {
      registry: scan.registry.filter((r) => checked[`reg:${r.path}`]),
      files: scan.files.filter((f) => checked[`file:${f.path}`]),
      services: scan.services.filter((s) => checked[`svc:${s.name}`]),
      tasks: scan.tasks.filter((t) => checked[`task:${t.path}${t.name}`]),
    };
    setPhase("applying");
    setProgress(0);
    animateProgress(0, 0.9, 1500);
    const r = await window.pureza.apps.apply(payload);
    setApplyResult(r);
    setProgress(1);
    setPhase("done");
    const total = (r.deleted.registry || 0) + (r.deleted.files || 0) + (r.deleted.services || 0) + (r.deleted.tasks || 0);
    await logHistory({
      type: "uninstall",
      title: current?.name || "Desinstalação",
      detail: `${total} rastros removidos` + (r.errors.length ? ` · ${r.errors.length} falhas` : ""),
      count: total,
    });
  }

  function closeModal() {
    setPhase("idle");
    setProgress(0);
    setScan(null);
    setApplyResult(null);
    loadApps();
  }

  const totalResiduals = scan
    ? scan.registry.length + scan.files.length + scan.services.length + scan.tasks.length
    : 0;
  const totalChecked = Object.values(checked).filter(Boolean).length;
  const residualSize = scan ? scan.files.reduce((s, f) => s + (f.sizeKB || 0), 0) : 0;

  if (showIntro) {
    return <Intro onDone={() => setShowIntro(false)} />;
  }

  return (
    <>
      <div className="app">
      <div className="titlebar">
        <div className="app-name">Pureza</div>

        <label className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            placeholder="Procurar programas, extensões, resíduos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => playListenChime()}
          />
        </label>

        {publicIp && (publicIp.city || publicIp.region) && (
          <div className="ip-pill">
            {publicIp.country_code && (
              <span className="ip-cc">{publicIp.country_code.toUpperCase()}</span>
            )}
            <span className="ip-loc">
              {publicIp.city}{publicIp.city && (publicIp.region_code || publicIp.region) ? ", " : ""}{publicIp.region_code || publicIp.region}
            </span>
            {weather && (
              <span className="ip-weather" data-tip={weatherLabel(weather.code)}>
                <span className="ip-weather-icon">{weatherIcon(weather.code)}</span>
                {weather.temp}°
              </span>
            )}
          </div>
        )}
        <div className="traffic">
          <span className="dot" data-tip="Minimizar" onClick={() => w?.minimize()}>
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
              <path d="M2 5h6" />
            </svg>
          </span>
          <span className="dot" data-tip="Maximizar" onClick={() => w?.maximize()}>
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.2}>
              <rect x="2.2" y="2.2" width="5.6" height="5.6" rx="1" />
            </svg>
          </span>
          <span className="dot close" data-tip="Fechar" onClick={() => w?.close()}>
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
              <path d="M3 3l4 4M7 3l-4 4" />
            </svg>
          </span>
        </div>
      </div>

      <div className="body">
        <aside className="sidebar">
          <div className="side-group">
            <h4>Modo</h4>
            <div className="side-items">
              <div className={"side-item " + (view === "hub" ? "active" : "")} onClick={() => navTo("hub")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="8" height="10" rx="1.5" />
                  <rect x="13" y="3" width="8" height="6" rx="1.5" />
                  <rect x="3" y="15" width="8" height="6" rx="1.5" />
                  <rect x="13" y="11" width="8" height="10" rx="1.5" />
                </svg>
                Visão geral
              </div>
              <div className={"side-item " + (view === "programs" ? "active" : "")} onClick={() => navTo("programs")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                Desinstalador<span className="count">{apps.length}</span>
              </div>
              <div className={"side-item " + (view === "startup" ? "active" : "")} onClick={() => navTo("startup")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4l3 2" />
                </svg>
                Inicialização<span className="count">{startup.length || "—"}</span>
              </div>
              <div className={"side-item " + (view === "cleaner" ? "active" : "")} onClick={() => navTo("cleaner")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 6h18M9 6V4h6v2M6 6l1 14h10l1-14" />
                </svg>
                Limpeza
              </div>
              <div className={"side-item " + (view === "disk" ? "active" : "")} onClick={() => navTo("disk")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <ellipse cx="12" cy="6" rx="8" ry="3" />
                  <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
                </svg>
                Análise de disco
              </div>
              <div className={"side-item " + (view === "restore" ? "active" : "")} onClick={() => navTo("restore")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8M3 3v5h5" />
                </svg>
                Restauração
              </div>
              <div className={"side-item " + (view === "doctor" ? "active" : "")} onClick={() => navTo("doctor")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zM12 8v4l3 2" />
                </svg>
                Diagnóstico
              </div>
              <div className={"side-item " + (view === "internet" ? "active" : "")} onClick={() => navTo("internet")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M1 12a11 11 0 0 1 22 0M5 16a7 7 0 0 1 14 0M9 20a3 3 0 0 1 6 0" />
                  <circle cx="12" cy="20" r="0.5" />
                </svg>
                Internet
              </div>
              <div className={"side-item " + (view === "convert" ? "active" : "")} onClick={() => navTo("convert")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 17V7a2 2 0 0 1 2-2h8l6 6v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                  <path d="m8 12 4 4 4-4M12 8v8" />
                </svg>
                Conversor
              </div>
              <div className={"side-item " + (view === "shredder" ? "active" : "")} onClick={() => navTo("shredder")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 7h16l-2 3H6z" />
                  <path d="M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8M9 13v4M12 13v4M15 13v4" />
                </svg>
                Shredder
              </div>
              <div className={"side-item " + (view === "winget" ? "active" : "")} onClick={() => navTo("winget")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
                </svg>
                Catálogo
              </div>
              <div className={"side-item " + (view === "history" ? "active" : "")} onClick={() => navTo("history")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 3v6h6M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
                  <path d="M12 7v5l3 2" />
                </svg>
                Histórico<span className="count">{history.length || ""}</span>
              </div>
            </div>
          </div>

          {view === "programs" && (
          <div className="side-group">
            <h4>Biblioteca</h4>
            <div className="side-items">
              <div className={"side-item " + (filter === "all" ? "active" : "")} onClick={() => setFilter("all")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
                Todos<span className="count">{apps.length}</span>
              </div>
              <div className={"side-item " + (filter === "heavy" ? "active" : "")} onClick={() => setFilter("heavy")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12l3-3h11a2 2 0 0 0 2-2z" />
                </svg>
                Pesados<span className="count">{apps.filter((a) => (a.sizeKB ?? 0) > 500 * 1024).length}</span>
              </div>
              <div className={"side-item " + (filter === "dated" ? "active" : "")} onClick={() => setFilter("dated")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                Com data<span className="count">{apps.filter((a) => a.installDate).length}</span>
              </div>
            </div>
            <div className={"opt side-opt " + (showStore ? "on" : "")} style={{ marginTop: 10 }} onClick={() => setShowStore((v) => !v)}>
              <div className="txt">
                <div className="t1">Microsoft Store</div>
                <div className="t2">Incluir apps UWP</div>
              </div>
              <div className="sw" />
            </div>
          </div>
          )}

          {view === "programs" && (
          <div className="side-group">
            <h4>Estado</h4>
            <div className="stat-card">
              <div className="label">Lixo acumulado</div>
              <div className="value">
                {cleanerTotal === null ? "…" : recoverable.v}
                <span className="unit">{cleanerTotal === null ? "" : recoverable.u}</span>
              </div>
              <div className="sub">medido em cache, temp e lixeira</div>
            </div>
          </div>
          )}

          {view === "startup" && (
          <div className="side-group">
            <h4>Estado</h4>
            <div className="stat-card">
              <div className="label">Ativos</div>
              <div className="value">
                {startup.filter((s) => s.enabled).length}
                <span className="unit">de {startup.length}</span>
              </div>
              <div className="sub">iniciam com o Windows</div>
            </div>
          </div>
          )}
        </aside>

        {view === "hub" && (
        <section className={"list-wrap full hub " + (presentation ? "presentation" : "")}>
          <div className="list-header">
            <h2>Visão geral</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="action"
                style={{ padding: "8px 14px", fontSize: 12 }}
                onClick={() => setShowIntro(true)}
              >
                Ver apresentação
              </button>
              <button
                className="action"
                style={{ padding: "8px 14px", fontSize: 12 }}
                onClick={() => {
                  const next = !presentation;
                  setPresentation(next);
                  if (next) document.documentElement.requestFullscreen?.();
                  else document.exitFullscreen?.();
                }}
              >
                {presentation ? "Sair da apresentação" : "Modo apresentação"}
              </button>
            </div>
          </div>
          <div className="hub-scroll">
          <div className="hub-grid">
            <div className="hub-card hub-score">
              <div className="hub-label">Saúde do sistema</div>
              {health ? (
                <>
                  <div className={"score-ring score-" + (health.score >= 80 ? "ok" : health.score >= 50 ? "mid" : "bad")}>
                    <svg viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line-strong)" strokeWidth="8" />
                      <motion.circle
                        cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8"
                        strokeLinecap="round" strokeDasharray="326.7"
                        initial={{ strokeDashoffset: 326.7 }}
                        animate={{ strokeDashoffset: 326.7 * (1 - health.score / 100) }}
                        transition={{ duration: 1.3, ease: [0.22, 0.61, 0.36, 1] }}
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <div className="score-val">
                      <div className="score-num">{health.score}</div>
                      <div className="score-max">/ 100</div>
                    </div>
                  </div>
                  <div className="score-components">
                    {health.components.map((c) => (
                      <div key={c.key} className="score-comp" data-tip={c.note} data-tip-pos="top">
                        <div className="score-comp-label">{c.label}</div>
                        <div className="score-comp-bar">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(c.points / c.max) * 100}%` }}
                            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
                            style={{ background: c.points / c.max >= 0.75 ? "var(--good)" : c.points / c.max >= 0.4 ? "#f59e0b" : "var(--danger)" }}
                          />
                        </div>
                        <div className="score-comp-val">{c.points}<span>/{c.max}</span></div>
                      </div>
                    ))}
                  </div>
                  {health.trend.length > 1 && (
                    <div className="score-trend">
                      <svg viewBox={`0 0 ${(health.trend.length - 1) * 30 + 10} 40`} preserveAspectRatio="none">
                        <motion.polyline
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={health.trend.map((t, i) => `${i * 30 + 5},${35 - (t.score / 100) * 30}`).join(" ")}
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
                        />
                        {health.trend.map((t, i) => (
                          <circle key={i} cx={i * 30 + 5} cy={35 - (t.score / 100) * 30} r="2.5" fill="currentColor" />
                        ))}
                      </svg>
                      <div className="score-trend-label">Últimos {health.trend.length} dias</div>
                    </div>
                  )}
                </>
              ) : <div className="hub-skeleton" />}
            </div>

            {recs.filter((r) => !dismissed.has(r.id)).length > 0 && (
              <div className="hub-card hub-wide hub-recs">
                <div className="hub-label">Recomendações</div>
                <div className="rec-list">
                  <AnimatePresence initial={false}>
                    {recs.filter((r) => !dismissed.has(r.id)).map((r) => (
                      <motion.div
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 20, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                        className={"rec rec-" + r.severity}
                      >
                        <div className={"rec-dot rec-dot-" + r.severity} />
                        <div className="rec-content">
                          <div className="rec-title">{r.title}</div>
                          <div className="rec-body">{r.body}</div>
                        </div>
                        {r.action && (
                          <button
                            className="action rec-action"
                            onClick={() => navTo(r.action!.view as any)}
                          >
                            {r.action.label}
                          </button>
                        )}
                        {r.severity !== "good" && (
                          <button
                            className="rec-dismiss"
                            onClick={() => {
                              const nd = new Set(dismissed);
                              nd.add(r.id);
                              setDismissed(nd);
                              try { localStorage.setItem("pureza-rec-dismissed", JSON.stringify([...nd])); } catch {}
                            }}
                            data-tip="Dispensar" data-tip-pos="top"
                          >×</button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            <div className="hub-card hub-primary">
              <div className="hub-label">Armazenamento</div>
              {stats && stats.diskTotalGB ? (
                <>
                  <div className="hub-ring">
                    <svg viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line-strong)" strokeWidth="6" />
                      <motion.circle
                        cx="60" cy="60" r="52" fill="none" stroke="var(--fg)" strokeWidth="6"
                        strokeLinecap="round" strokeDasharray="326.7"
                        initial={{ strokeDashoffset: 326.7 }}
                        animate={{ strokeDashoffset: 326.7 * (stats.diskFreeGB! / stats.diskTotalGB) }}
                        transition={{ duration: 1.2, ease: [0.22, 0.61, 0.36, 1] }}
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <div className="hub-ring-val">
                      <div className="big">{Math.round(stats.diskUsedGB!)}<span className="unit-small">GB</span></div>
                      <div className="unit">de {Math.round(stats.diskTotalGB)}</div>
                    </div>
                  </div>
                  <div className="hub-sub">{Math.round(stats.diskFreeGB!)} GB livres · {stats.disks?.length || 1} volume{(stats.disks?.length || 1) === 1 ? "" : "s"}</div>
                </>
              ) : <div className="hub-skeleton" />}
            </div>

            <div className="hub-card">
              <div className="hub-label">Memória <span className="live-dot" data-tip="em tempo real" /></div>
              {stats ? (
                <>
                  <div className="hub-big">{stats.ramUsedPct}<span className="hub-pct">%</span></div>
                  <div className="hub-bar"><motion.div animate={{ width: `${stats.ramUsedPct}%` }} transition={{ duration: 0.6, ease: [0.22,0.61,0.36,1] }} /></div>
                  <div className="hub-sub">{(stats.ramTotalGB - stats.ramFreeGB).toFixed(1)} / {stats.ramTotalGB} GB</div>
                </>
              ) : <div className="hub-skeleton" />}
            </div>

            <div className="hub-card">
              <div className="hub-label">Programas</div>
              <div className="hub-big">{apps.length}</div>
              <div className="hub-sub">{apps.filter(a => a.uwp).length} da Store</div>
            </div>

            <div className="hub-card">
              <div className="hub-label">Inicialização</div>
              <div className="hub-big">{startup.length || "—"}</div>
              <div className="hub-sub">{startup.filter(s => s.enabled).length} ativos</div>
            </div>

            <div className="hub-card">
              <div className="hub-label">Tempo ligado</div>
              {stats ? (
                <>
                  <div className="hub-big">{(stats.bootDays ?? 0) > 0 ? stats.bootDays : stats.bootHours}<span className="hub-pct">{(stats.bootDays ?? 0) > 0 ? "d" : "h"}</span></div>
                  <div className="hub-sub">{(stats.bootDays ?? 0) > 0 ? `${stats.bootHours}h ${stats.bootMinutes}m` : `${stats.bootMinutes}m`}</div>
                </>
              ) : <div className="hub-skeleton" />}
            </div>

            {stats && stats.batteryPct !== undefined && stats.batteryPct >= 0 && (
              <div className="hub-card">
                <div className="hub-label">Bateria</div>
                <div className="hub-big">{stats.batteryPct}<span className="hub-pct">%</span></div>
                <div className="hub-bar"><div style={{ width: `${stats.batteryPct}%`, background: stats.batteryPct < 20 ? "var(--danger)" : "var(--good)" }} /></div>
              </div>
            )}

            <div className="hub-card hub-wide">
              <div className="hub-label">Sistema</div>
              {stats ? (
                <div className="hub-specs">
                  <div className="spec"><span className="spec-k">Sistema</span><span className="spec-v">{stats.osName?.replace("Microsoft ", "")}</span></div>
                  <div className="spec"><span className="spec-k">Build</span><span className="spec-v">{stats.osBuild} · {stats.osArch}</span></div>
                  <div className="spec"><span className="spec-k">Máquina</span><span className="spec-v">{stats.hostName} · {stats.userName}</span></div>
                  <div className="spec"><span className="spec-k">Processador</span><span className="spec-v">{stats.cpuName?.replace(/\s*CPU.*/i, "")}</span></div>
                  <div className="spec"><span className="spec-k">Núcleos</span><span className="spec-v">{stats.cpuCores} · {stats.cpuThreads} threads</span></div>
                  {stats.gpuName && <div className="spec"><span className="spec-k">GPU</span><span className="spec-v">{stats.gpuName}</span></div>}
                  {stats.screenRes && <div className="spec"><span className="spec-k">Tela</span><span className="spec-v">{stats.screenRes}</span></div>}
                  {stats.diskModel && <div className="spec"><span className="spec-k">Disco</span><span className="spec-v">{stats.diskModel}</span></div>}
                  {stats.netName && <div className="spec"><span className="spec-k">Rede</span><span className="spec-v">{stats.netName}{stats.netSpeed ? ` · ${stats.netSpeed} Mbps` : ""}</span></div>}
                </div>
              ) : <div className="hub-skeleton" />}
            </div>

            <div className="hub-card hub-wide">
              <div className="hub-label">Atividade recente</div>
              <div className="hub-timeline">
                {history.length === 0 && <div className="hub-sub">Sem atividade registrada ainda</div>}
                {history.slice(0, 6).map((h) => {
                  const d = new Date(h.ts);
                  return (
                    <div key={h.id} className="hub-event">
                      <div className="hub-dot" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{h.title}</div>
                        <div style={{ fontSize: 11, color: "var(--fg-dim)" }}>{h.type} · {d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {stats && stats.disks && stats.disks.length > 1 && (
              <div className="hub-card hub-wide">
                <div className="hub-label">Volumes</div>
                <div className="hub-specs">
                  {stats.disks.map((d) => (
                    <div key={d.letter}>
                      <div className="spec" style={{ padding: 0, border: "none" }}>
                        <span className="spec-k">{d.letter}:</span>
                        <span className="spec-v">{d.usedGB} / {d.totalGB} GB · {d.freeGB} GB livres</span>
                      </div>
                      <div className="hub-bar" style={{ marginTop: 4, marginBottom: 10 }}>
                        <div style={{ width: `${(d.usedGB / d.totalGB) * 100}%`, background: "var(--fg)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
        </section>
        )}

        {view === "winget" && (() => {
          const cats = ["Todos", ...Array.from(new Set(CATALOG.map((c) => c.category)))];
          const filteredCatalog = catalogCat === "Todos" ? CATALOG : CATALOG.filter((c) => c.category === catalogCat);
          const showingSearch = wingetResults.length > 0 || wingetSearching;
          return (
            <section className="list-wrap full">
              <div className="list-header">
                <h2>Catálogo</h2>
                <div className="meta">{wingetOk === false ? "winget offline — catálogo offline" : showingSearch ? `${wingetResults.length} resultados` : `${CATALOG.length} apps curados`}</div>
              </div>
              <div style={{ padding: "6px 22px 10px" }}>
                <label className="search" style={{ maxWidth: "none" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    placeholder="Pesquisar no catálogo completo… (Enter para buscar)"
                    value={wingetQuery}
                    onChange={(e) => setWingetQuery(e.target.value)}
                    onFocus={() => playListenChime()}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        if (!wingetQuery.trim()) { setWingetResults([]); return; }
                        setWingetSearching(true);
                        const r = await window.pureza.winget.search(wingetQuery);
                        setWingetResults(r);
                        setWingetSearching(false);
                      } else if (e.key === "Escape") {
                        setWingetQuery("");
                        setWingetResults([]);
                      }
                    }}
                  />
                </label>
              </div>

              {!showingSearch && (
                <div className="cat-tabs">
                  {cats.map((c) => (
                    <button key={c} className={"pill " + (catalogCat === c ? "on" : "")} onClick={() => setCatalogCat(c)}>{c}</button>
                  ))}
                </div>
              )}

              <div className="list">
                {wingetSearching && <div className="empty">Buscando no winget…</div>}

                {showingSearch && wingetResults.map((w, i) => (
                  <motion.div
                    key={w.id + i}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.2) }}
                    className="prog winget-row"
                  >
                    <div className="icon winget-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="name">{w.name}</div>
                      <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {w.id} {w.version ? `· ${w.version}` : ""}
                      </div>
                    </div>
                    <div className="size"><strong>{w.source || "winget"}</strong>fonte</div>
                    <button
                      className="action"
                      style={{ padding: "8px 14px", fontSize: 12 }}
                      disabled={wingetBusy === w.id}
                      onClick={async () => {
                        setWingetBusy(w.id);
                        const r = await window.pureza.winget.install(w.id);
                        setWingetBusy(null);
                        if (r.ok) logHistory({ type: "uninstall", title: `Instalado: ${w.name}`, detail: w.id });
                        else alert("Falha ao instalar. Pode precisar de admin ou winget.");
                      }}
                    >
                      {wingetBusy === w.id ? "Instalando…" : "Instalar"}
                    </button>
                  </motion.div>
                ))}

                {!showingSearch && (
                  <div className="catalog-grid">
                    {filteredCatalog.map((c, i) => (
                      <motion.div
                        key={c.id}
                        layout
                        initial={{ opacity: 0, y: 10, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
                        className="cat-card"
                      >
                        <div className="cat-icon" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>
                          {c.name.slice(0, 1)}
                        </div>
                        <div className="cat-info">
                          <div className="cat-name">{c.name}</div>
                          <div className="cat-tag">{c.tagline}</div>
                        </div>
                        <button
                          className="action cat-install"
                          disabled={wingetBusy === c.id}
                          onClick={async () => {
                            setWingetBusy(c.id);
                            const r = await window.pureza.winget.install(c.id);
                            setWingetBusy(null);
                            if (r.ok) logHistory({ type: "uninstall", title: `Instalado: ${c.name}`, detail: c.id });
                            else alert("Falha ao instalar. Pode precisar de admin.");
                          }}
                        >
                          {wingetBusy === c.id ? "…" : "Obter"}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })()}

        {view === "programs" && (
        <section className="list-wrap">
          <div className="list-header">
            <h2>Programas instalados</h2>
            <div className="meta">
              {loadingList ? "carregando…" : `${filtered.length} de ${apps.length}`}
            </div>
          </div>
          <div className="list">
            <AnimatePresence initial={false}>
              {filtered.map((p, i) => {
                const g = gradientFor(p.name).split(",");
                const s = formatSize(p.sizeKB);
                const iconB64 = p.key ? icons[p.key] : undefined;
                return (
                  <motion.div
                    key={p.key || p.name}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.35, delay: Math.min(i * 0.02, 0.3), ease: [0.22, 0.61, 0.36, 1] }}
                    className={"prog with-check " + (selected === p.name ? "selected" : "") + (multi.has(p.key || p.name) ? " checked" : "")}
                    onClick={(e) => {
                      if (e.ctrlKey || multi.size > 0) {
                        setMulti((m) => {
                          const nm = new Set(m);
                          const id = p.key || p.name;
                          nm.has(id) ? nm.delete(id) : nm.add(id);
                          return nm;
                        });
                      } else {
                        setSelected(p.name);
                      }
                    }}
                  >
                    <div
                      className="check-pill"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMulti((m) => {
                          const nm = new Set(m);
                          const id = p.key || p.name;
                          nm.has(id) ? nm.delete(id) : nm.add(id);
                          return nm;
                        });
                      }}
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8l3.5 3.5L13 5" />
                      </svg>
                    </div>
                    <div className="icon has-img">
                      <img
                        src={iconB64 || GENERIC_ICON}
                        alt=""
                        onError={(e) => { e.currentTarget.src = GENERIC_ICON; }}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </div>
                      <div className="sub">
                        {p.vendor || "—"}
                        {p.version ? ` · ${p.version}` : ""}
                      </div>
                    </div>
                    <div className="size">
                      <strong>
                        {s.v}
                        {s.u && ` ${s.u}`}
                      </strong>
                      em disco
                    </div>
                    <div className="chev">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}>
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
        )}

        {view === "startup" && (
        <section className="list-wrap">
          <div className="list-header">
            <h2>Inicialização do Windows</h2>
            <div className="meta">
              {startup.length ? `${startup.filter((s) => s.enabled).length} ativos` : "carregando…"}
            </div>
          </div>
          <div className="list">
            <AnimatePresence initial={false}>
              {startup.map((s, i) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.25) }}
                  className="prog startup-row"
                >
                  <div className={"icon " + (s.enabled ? "startup-on" : "startup-off")}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v4l3 2" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">
                      {s.name}
                      {impact[s.id] && (
                        <span className={"impact-badge impact-" + impact[s.id].impact.replace("é", "e")}>
                          {impact[s.id].impact}
                        </span>
                      )}
                    </div>
                    <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.scope} · {s.kind} · {s.command}
                    </div>
                  </div>
                  <div
                    className={"opt " + (s.enabled ? "on" : "")}
                    onClick={() => { toggleStartup(s); logHistory({ type: "startup-toggle", title: s.name, detail: s.enabled ? "desativado" : "ativado" }); }}
                    style={{ padding: 0, opacity: startupBusy === s.id ? 0.5 : 1, pointerEvents: startupBusy === s.id ? "none" : "auto" }}
                  >
                    <div className="sw" />
                  </div>
                  <div style={{ width: 24 }} />
                </motion.div>
              ))}
              {startup.length === 0 && (
                <div className="empty" style={{ marginTop: 20 }}>Nenhum programa de inicialização encontrado.</div>
              )}
            </AnimatePresence>
          </div>
        </section>
        )}

        {view === "cleaner" && (
        <section className="list-wrap full">
          <div className="list-header">
            <h2>Limpeza</h2>
            <div className="meta">
              {cleaner
                ? `${formatSize(cleaner.reduce((s, c) => s + (c.sizeKB || 0), 0)).v} ${formatSize(cleaner.reduce((s, c) => s + (c.sizeKB || 0), 0)).u} encontrados`
                : "varrendo…"}
            </div>
          </div>
          <div className="list">
            {!cleaner && <div className="empty">Analisando categorias…</div>}
            {cleaner && cleaner.map((c, i) => {
              const s = formatSize(c.sizeKB);
              const on = !!cleanerChecked[c.id];
              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.2) }}
                  className={"prog cleaner-row " + (on ? "checked" : "")}
                  onClick={() => setCleanerChecked((x) => ({ ...x, [c.id]: !on }))}
                >
                  <div className="check-pill always">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8l3.5 3.5L13 5" />
                    </svg>
                  </div>
                  <div className="icon cleaner-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M3 6h18M9 6V4h6v2M6 6l1 14h10l1-14" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{c.name}</div>
                    <div className="sub">{c.isBin ? "Lixeira do sistema" : `${c.paths.length} local${c.paths.length === 1 ? "" : "is"}`}</div>
                  </div>
                  <div className="size">
                    <strong>{s.v}{s.u && ` ${s.u}`}</strong>
                    recuperáveis
                  </div>
                </motion.div>
              );
            })}
          </div>
          {cleaner && (
            <div className="list-foot">
              <div className="foot-info">
                {Object.values(cleanerChecked).filter(Boolean).length} selecionado{Object.values(cleanerChecked).filter(Boolean).length === 1 ? "" : "s"}
                {schedules.length > 0 && ` · ${schedules.length} agendamento${schedules.length === 1 ? "" : "s"}`}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="action"
                  style={{ padding: "10px 16px", fontSize: 13 }}
                  onClick={() => setScheduleModal(true)}
                  disabled={!cleaner.some((c) => cleanerChecked[c.id])}
                >
                  Agendar…
                </button>
                <button
                  className="cta inline"
                  disabled={cleanerBusy || !cleaner.some((c) => cleanerChecked[c.id])}
                  onClick={async () => {
                    setCleanerBusy(true);
                    setCleanerResult(null);
                    const selected = cleaner.filter((c) => cleanerChecked[c.id]);
                    const r = await window.pureza.cleaner.clean(selected);
                    setCleanerResult(r);
                    setCleanerBusy(false);
                    logHistory({ type: "clean", title: "Limpeza manual", detail: selected.map((c) => c.name).join(", "), sizeKB: r.cleanedKB, count: selected.length });
                    loadCleaner();
                  }}
                >
                  {cleanerBusy ? "Limpando…" : "Limpar selecionados"}
                </button>
              </div>
            </div>
          )}
          {schedules.length > 0 && (
            <div style={{ padding: "10px 22px 18px", borderTop: "1px solid var(--line)" }}>
              <div className="foot-info" style={{ marginBottom: 8 }}>Agendamentos ativos</div>
              {schedules.map((s) => (
                <div key={s.name} className="sched-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="name">{s.name.replace(/^Pureza_/, "").replace(/_\w+$/, "")}</div>
                    <div className="sub">{s.schedule} · {s.state}</div>
                  </div>
                  <button
                    className="action"
                    style={{ padding: "6px 12px", fontSize: 11 }}
                    onClick={async () => {
                      await window.pureza.schedule.delete(s.name);
                      logHistory({ type: "schedule-delete", title: s.name });
                      loadSchedules();
                    }}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
          {cleanerResult && (
            <div className="toast">
              Liberados {formatSize(cleanerResult.cleanedKB).v} {formatSize(cleanerResult.cleanedKB).u}
              {cleanerResult.errors.length ? ` · ${cleanerResult.errors.length} em uso` : ""}
            </div>
          )}
        </section>
        )}

        {view === "disk" && (
        <section className="list-wrap full">
          <div className="list-header">
            <h2>Análise de disco</h2>
            <div className="meta">{disk ? `${disk.length} pastas pesadas` : "analisando…"}</div>
          </div>
          <div className="list">
            {!disk && <div className="empty">Varrendo Program Files, AppData, ProgramData…</div>}
            {disk && (() => {
              const max = Math.max(...disk.map((d) => d.sizeKB), 1);
              const colors = ["#5e8bff","#8a7cff","#ff7eb6","#ff9d6c","#f6c652","#7ed88f","#56c8db","#b79bff"];
              return disk.map((d, i) => {
                const s = formatSize(d.sizeKB);
                const pct = (d.sizeKB / max) * 100;
                return (
                  <motion.div
                    key={d.path}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i * 0.025, 0.4) }}
                    className="disk-row"
                    onClick={() => window.pureza.shell.openFolder(d.path)}
                    data-tip={d.path} data-tip-pos="top"
                  >
                    <div className="disk-head">
                      <div className="disk-name">{d.name}</div>
                      <div className="disk-size">{s.v}<span className="disk-unit">{s.u}</span></div>
                    </div>
                    <div className="disk-track">
                      <motion.div
                        className="disk-bar"
                        style={{ background: colors[i % colors.length] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: Math.min(i * 0.03, 0.5), ease: [0.22, 0.61, 0.36, 1] }}
                      />
                    </div>
                    <div className="disk-path">{d.parent}</div>
                  </motion.div>
                );
              });
            })()}
          </div>
        </section>
        )}

        {view === "restore" && (
        <section className="list-wrap full">
          <div className="list-header">
            <h2>Pontos de restauração</h2>
            <div className="meta">{restorePoints ? `${restorePoints.length} pontos` : "carregando…"}</div>
          </div>
          <div className="list">
            {!restorePoints && <div className="empty">Buscando pontos no sistema…</div>}
            {restorePoints && restorePoints.length === 0 && (
              <div className="empty">Nenhum ponto de restauração. Clique em "Criar ponto" abaixo.</div>
            )}
            {restorePoints && restorePoints.map((rp, i) => {
              const d = new Date(rp.time);
              return (
                <motion.div
                  key={rp.sequence}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.2) }}
                  className="prog restore-row"
                >
                  <div className="icon restore-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8M3 3v5h5" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{rp.description || "Sem descrição"}</div>
                    <div className="sub">#{rp.sequence} · {rp.type}</div>
                  </div>
                  <div className="size">
                    <strong>{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</strong>
                    {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <button
                    className="action"
                    style={{ padding: "6px 10px", fontSize: 11 }}
                    onClick={async () => {
                      if (!confirm(`Apagar ponto "${rp.description}"?`)) return;
                      await window.pureza.restore.delete(rp.sequence);
                      loadRestore();
                    }}
                  >
                    Apagar
                  </button>
                </motion.div>
              );
            })}
          </div>
          <div className="list-foot">
            <div className="foot-info">Requer privilégios de administrador</div>
            <button
              className="cta inline"
              disabled={restoreBusy}
              onClick={async () => {
                setRestoreBusy(true);
                const desc = `Pureza — ${new Date().toLocaleString("pt-BR")}`;
                await window.pureza.restore.create(desc);
                await loadRestore();
                setRestoreBusy(false);
              }}
            >
              {restoreBusy ? "Criando…" : "Criar ponto agora"}
            </button>
          </div>
        </section>
        )}

        {view === "internet" && (() => {
          const phaseLabel = netTest.phase === "ping" ? "Medindo latência" : netTest.phase === "download" ? "Baixando" : netTest.phase === "upload" ? "Enviando" : netTest.phase === "done" ? "Concluído" : "Pronto";
          const primaryVal = netTest.phase === "upload" ? netTest.up : netTest.down;
          const primaryUnit = netTest.phase === "upload" ? "Mbps ↑" : "Mbps ↓";
          const hist = netTest.history;
          return (
            <section className="list-wrap full">
              <div className="list-header">
                <h2>Teste de internet</h2>
                <div className="meta">Via Cloudflare · ao vivo</div>
              </div>
              <div className="list" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: "30px 20px" }}>
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
                  style={{ textAlign: "center", width: "100%", maxWidth: 520 }}
                >
                  <div className="net-phase">{phaseLabel}{netTest.busy && <span className="live-dot" />}</div>
                  <div className="net-ring">
                    <svg viewBox="0 0 200 200">
                      <circle cx="100" cy="100" r="88" fill="none" stroke="var(--line-strong)" strokeWidth="6" />
                      <motion.circle
                        cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="6"
                        strokeLinecap="round" strokeDasharray="553"
                        style={{
                          strokeDashoffset: dispArc,
                          color: (primaryVal || 0) > 100 ? "var(--good)" : (primaryVal || 0) > 25 ? "#f59e0b" : "var(--danger)",
                        }}
                        transform="rotate(-90 100 100)"
                      />
                    </svg>
                    <div className="net-val">
                      {primaryVal === null ? (
                        <div className="net-num">—</div>
                      ) : (
                        <motion.div className="net-num">{dispSpeedRounded}</motion.div>
                      )}
                      <div className="net-unit">{primaryUnit}</div>
                    </div>
                  </div>

                  {hist.length > 1 && (() => {
                    const max = Math.max(...hist, 10);
                    const pts = hist.map((v, i) => `${i * 6},${38 - (v / max) * 34}`).join(" ");
                    const area = `0,40 ${pts} ${(hist.length - 1) * 6},40`;
                    return (
                      <div className="net-spark">
                        <svg viewBox={`0 0 ${hist.length * 6} 40`} preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="spark-g" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <polygon points={area} fill="url(#spark-g)" />
                          <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={pts}
                          />
                        </svg>
                      </div>
                    );
                  })()}
                  {netTest.busy && (netTest.phase === "download" || netTest.phase === "upload") && (
                    <div className="net-progress">
                      <motion.div
                        key={netTest.phase}
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 10, ease: "linear" }}
                      />
                    </div>
                  )}

                  <div className="net-metrics">
                    <NetMetric label="Ping" value={netTest.ping} unit="ms" active={netTest.phase === "ping"} />
                    <NetMetric label="Download" value={netTest.down} unit="Mbps" active={netTest.phase === "download"} />
                    <NetMetric label="Upload" value={netTest.up} unit="Mbps" active={netTest.phase === "upload"} />
                  </div>

                  <button
                    className="cta inline"
                    style={{ marginTop: 24 }}
                    disabled={netTest.busy}
                    onClick={runInternetTest}
                  >
                    {netTest.busy ? "Testando…" : netTest.phase === "done" ? "Refazer teste" : "Iniciar teste"}
                  </button>
                </motion.div>
              </div>
            </section>
          );
        })()}

        {view === "doctor" && (
        <section className="list-wrap full">
          <div className="list-header">
            <h2>Diagnóstico</h2>
            <button
              className="action"
              style={{ padding: "8px 14px", fontSize: 12 }}
              disabled={doctorBusy}
              onClick={async () => {
                setDoctorBusy(true);
                setDoctor(null);
                const r = await window.pureza.doctor.run();
                setDoctor(r);
                setDoctorBusy(false);
              }}
            >
              {doctorBusy ? "Analisando…" : "Rodar novamente"}
            </button>
          </div>
          <div className="list">
            {doctorBusy && !doctor && <div className="empty">Medindo CPU, RAM, disco, páginas, processos…</div>}
            {doctor && (
              <>
                <div className="doctor-summary">
                  {[
                    { k: "CPU", v: `${doctor.raw.cpuPct}%`, s: (doctor.raw.cpuPct || 0) > 50 ? "warn" : "ok" },
                    { k: "RAM", v: `${doctor.raw.ramPct}%`, s: (doctor.raw.ramPct || 0) > 75 ? "warn" : "ok" },
                    { k: "Disco (fila)", v: String(doctor.raw.diskQ), s: (doctor.raw.diskQ || 0) > 1 ? "warn" : "ok" },
                    { k: "Páginas/s", v: String(doctor.raw.pagesSec), s: (doctor.raw.pagesSec || 0) > 500 ? "warn" : "ok" },
                    { k: "Uptime", v: `${doctor.raw.uptimeDays}d`, s: (doctor.raw.uptimeDays || 0) > 7 ? "warn" : "ok" },
                    { k: "Serviços", v: String(doctor.raw.servicesCount), s: "ok" },
                    { k: "Startup", v: String(doctor.raw.startupCount), s: (doctor.raw.startupCount || 0) > 10 ? "warn" : "ok" },
                  ].map((x) => (
                    <div key={x.k} className={"doctor-metric metric-" + x.s}>
                      <div className="doctor-metric-v">{x.v}</div>
                      <div className="doctor-metric-k">{x.k}</div>
                    </div>
                  ))}
                </div>
                <div className="scan-title" style={{ marginTop: 20, marginBottom: 6 }}>Veredito</div>
                <AnimatePresence>
                  {doctor.findings.map((f, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.03 }}
                      className={"rec rec-" + f.severity}
                      style={{ margin: "0 4px" }}
                    >
                      <div className={"rec-dot rec-dot-" + f.severity} />
                      <div className="rec-content">
                        <div className="rec-title">{f.title}</div>
                        <div className="rec-body">{f.body}</div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {doctor.raw.topCpu && doctor.raw.topCpu.length > 0 && (
                  <>
                    <div className="scan-title" style={{ marginTop: 20, marginBottom: 6 }}>Top processos por CPU</div>
                    {doctor.raw.topCpu.map((p) => (
                      <div key={p.ProcessName + p.CPU} className="rec" style={{ margin: "0 4px" }}>
                        <div className="rec-dot rec-dot-low" />
                        <div className="rec-content">
                          <div className="rec-title">{p.ProcessName}</div>
                          <div className="rec-body">{p.CPU}s de CPU · {p.RAM_MB} MB de RAM</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </section>
        )}

        {view === "convert" && (
        <section className="list-wrap full">
          <div className="list-header">
            <h2>Conversor</h2>
            <div className="meta">{convertFiles.length} arquivos</div>
          </div>
          <div className="list">
            <div
              className={"drop-zone " + (convertFiles.length ? "has-files" : "")}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("over"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("over")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("over");
                const files = Array.from(e.dataTransfer.files).map((f) => (f as any).path).filter(Boolean);
                setConvertFiles((p) => [...new Set([...p, ...files])]);
              }}
            >
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="8" y="10" width="32" height="28" rx="4" />
                <path d="m16 28 6-6 10 10M28 20h0.01" />
              </svg>
              <div className="drop-title">Arraste imagens aqui</div>
              <div className="drop-sub">Suporta PNG, JPG, BMP, GIF · converte pra {convertTarget.toUpperCase()}</div>
            </div>
            {convertFiles.length > 0 && (
              <div style={{ marginTop: 18 }}>
                {convertFiles.map((f) => (
                  <div key={f} className="shred-row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16, color: "var(--fg-dim)" }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 11 }}>{f}</span>
                    <button className="action" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setConvertFiles((p) => p.filter((x) => x !== f))}>×</button>
                  </div>
                ))}
              </div>
            )}
            {convertResult && (
              <div className="toast" style={{ position: "static", margin: "18px auto 0", display: "inline-block" }}>
                {convertResult.done} convertido{convertResult.done === 1 ? "" : "s"}
                {convertResult.errors.length ? ` · ${convertResult.errors.length} erro${convertResult.errors.length === 1 ? "" : "s"}` : ""}
              </div>
            )}
          </div>
          <div className="list-foot">
            <div className="foot-info">
              Alvo:
              {["jpg", "png", "bmp", "gif"].map((t) => (
                <button key={t} className={"action " + (convertTarget === t ? "on-pass" : "")} style={{ padding: "4px 10px", marginLeft: 6, fontSize: 11 }} onClick={() => setConvertTarget(t)}>{t.toUpperCase()}</button>
              ))}
            </div>
            <button
              className="cta inline"
              disabled={convertBusy || convertFiles.length === 0}
              onClick={async () => {
                setConvertBusy(true);
                const items = convertFiles.map((src) => ({ src, target: convertTarget }));
                const r = await window.pureza.convert.files(items);
                setConvertResult(r);
                setConvertBusy(false);
                setConvertFiles([]);
              }}
            >
              {convertBusy ? "Convertendo…" : `Converter pra ${convertTarget.toUpperCase()}`}
            </button>
          </div>
        </section>
        )}

        {view === "shredder" && (
        <section className="list-wrap full">
          <div className="list-header">
            <h2>Shredder</h2>
            <div className="meta">Sobrescreve {shredPasses}× antes de apagar</div>
          </div>
          <div className="list">
            <div
              className={"drop-zone " + (shredFiles.length ? "has-files" : "")}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("over"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("over")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("over");
                const files = Array.from(e.dataTransfer.files).map((f) => (f as any).path).filter(Boolean);
                setShredFiles((p) => [...new Set([...p, ...files])]);
              }}
            >
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M8 14h32l-4 6H12z" />
                <path d="M12 20v18a4 4 0 0 0 4 4h16a4 4 0 0 0 4-4V20M18 26v8M24 26v8M30 26v8" />
              </svg>
              <div className="drop-title">Arraste arquivos ou pastas aqui</div>
              <div className="drop-sub">Serão destruídos com {shredPasses} passes de dados aleatórios, impossível recuperar</div>
            </div>
            {shredFiles.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="scan-title" style={{ marginBottom: 8 }}>Fila ({shredFiles.length})</div>
                {shredFiles.map((f) => (
                  <div key={f} className="shred-row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16, color: "var(--fg-dim)" }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 11 }}>{f}</span>
                    <button className="action" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setShredFiles((p) => p.filter((x) => x !== f))}>×</button>
                  </div>
                ))}
              </div>
            )}
            {shredResult && (
              <div className="toast" style={{ position: "static", margin: "18px auto 0", display: "inline-block" }}>
                {shredResult.files} destruído{shredResult.files === 1 ? "" : "s"} · {formatSize(Math.round(shredResult.bytes / 1024)).v} {formatSize(Math.round(shredResult.bytes / 1024)).u}
              </div>
            )}
          </div>
          <div className="list-foot">
            <div className="foot-info">
              Passes:
              {[1, 3, 7].map((n) => (
                <button key={n} className={"action " + (shredPasses === n ? "on-pass" : "")} style={{ padding: "4px 10px", marginLeft: 6, fontSize: 11 }} onClick={() => setShredPasses(n)}>{n}</button>
              ))}
            </div>
            <button
              className="cta inline"
              disabled={shredding || shredFiles.length === 0}
              onClick={async () => {
                if (!confirm(`Destruir ${shredFiles.length} iten(s)? Isso NÃO pode ser desfeito.`)) return;
                setShredding(true);
                setShredResult(null);
                const r = await window.pureza.shredder.shred(shredFiles, shredPasses);
                setShredResult(r);
                setShredding(false);
                setShredFiles([]);
                logHistory({ type: "shred", title: `${r.files} arquivos destruídos`, sizeKB: Math.round(r.bytes / 1024), count: r.files });
              }}
            >
              {shredding ? "Destruindo…" : "Destruir tudo"}
            </button>
          </div>
        </section>
        )}

        {view === "history" && (
        <section className="list-wrap full">
          <div className="list-header">
            <h2>Histórico</h2>
            <div className="meta">{history.length} eventos</div>
          </div>
          <div className="list">
            {history.length === 0 && <div className="empty">Nenhum evento ainda. Ações do Pureza aparecem aqui.</div>}
            {history.map((h, i) => {
              const d = new Date(h.ts);
              const icons: Record<string, string> = {
                uninstall: "🗑",
                clean: "✨",
                shred: "⚡",
                "startup-toggle": "⏻",
                "restore-create": "⭯",
                "restore-delete": "✕",
                "schedule-create": "⏰",
                "schedule-delete": "⏰",
                "apply-leftovers": "🧹",
              };
              return (
                <motion.div
                  key={h.id}
                  layout
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.2) }}
                  className="prog history-row"
                >
                  <div className="icon history-icon">{icons[h.type] || "•"}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{h.title}</div>
                    <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.type} {h.detail ? `· ${h.detail}` : ""}
                    </div>
                  </div>
                  <div className="size">
                    {h.sizeKB ? <strong>{formatSize(h.sizeKB).v} {formatSize(h.sizeKB).u}</strong> : <strong>{h.count ?? ""}</strong>}
                    {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <button
                    className="action"
                    style={{ padding: "6px 10px", fontSize: 11 }}
                    onClick={async () => { await window.pureza.history.delete(h.id); loadHistory(); }}
                  >
                    ×
                  </button>
                </motion.div>
              );
            })}
          </div>
          {history.length > 0 && (
            <div className="list-foot">
              <div className="foot-info">Mantido em disco (últimos 500 eventos)</div>
              <button
                className="action"
                style={{ padding: "10px 16px", fontSize: 13 }}
                onClick={async () => {
                  if (!confirm("Limpar todo o histórico?")) return;
                  await window.pureza.history.clear();
                  loadHistory();
                }}
              >
                Limpar histórico
              </button>
            </div>
          )}
        </section>
        )}

        {view === "programs" && (
        <aside className="detail">
          {current && (
            <motion.div
              key={current.name}
              className="headline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {(() => {
                const b64 = current.key ? icons[current.key] : undefined;
                return (
                  <div className="icon-lg has-img">
                    <img
                      src={b64 || GENERIC_ICON}
                      alt=""
                      onError={(e) => { e.currentTarget.src = GENERIC_ICON; }}
                    />
                  </div>
                );
              })()}
              <div>
                <h3>{current.name}</h3>
                <div className="vendor">
                  {current.vendor || "—"}
                  {current.version ? ` · versão ${current.version}` : ""}
                </div>
              </div>
            </motion.div>
          )}

          {current && (
            <div className="info-grid">
              <div className="info">
                <div className="k">Tamanho</div>
                <div className="v">
                  {formatSize(current.sizeKB).v} {formatSize(current.sizeKB).u}
                </div>
              </div>
              <div className="info">
                <div className="k">Instalado</div>
                <div className="v">{formatDate(current.installDate)}</div>
              </div>
              <div className="info">
                <div className="k">Versão</div>
                <div className="v">{current.version || "—"}</div>
              </div>
              <div className="info">
                <div className="k">Resíduos em disco</div>
                <div className="v">
                  {residuals[current.name] === undefined
                    ? "…"
                    : `${formatSize(residuals[current.name]).v} ${formatSize(residuals[current.name]).u}`}
                </div>
              </div>
            </div>
          )}

          <div className="scan-title">Varredura profunda</div>
          <div className="opts">
            {([
              ["restore", "Ponto de restauração", "Backup antes de apagar"],
              ["registry", "Registro do Windows", "Chaves órfãs em HKCU/HKLM"],
              ["files", "Arquivos residuais", "AppData, ProgramData, Temp"],
              ["services", "Serviços e tarefas", "Services e Scheduled Tasks"],
            ] as const).map(([k, t1, t2]) => (
              <div
                key={k}
                className={"opt " + (opts[k] ? "on" : "")}
                onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}
              >
                <div className="txt">
                  <div className="t1">{t1}</div>
                  <div className="t2">{t2}</div>
                </div>
                <div className="sw" />
              </div>
            ))}
          </div>

          <div className="action-row">
            <button
              className="action"
              disabled={!current?.location}
              onClick={() => current?.location && window.pureza.shell.openFolder(current.location)}
              data-tip="Abrir pasta de instalação" data-tip-pos="top"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              </svg>
              Abrir pasta
            </button>
            <button
              className="action"
              disabled={!current}
              onClick={() =>
                current && window.pureza.shell.openUrl(`https://www.google.com/search?q=${encodeURIComponent(current.name + " " + (current.vendor || ""))}`)
              }
              data-tip="Pesquisar sobre este programa" data-tip-pos="top"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              Pesquisar
            </button>
          </div>

          <button className="cta" onClick={startUninstall} disabled={!current}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            Desinstalar com varredura
          </button>
        </aside>
        )}
      </div>

      <AnimatePresence>
        {scheduleModal && (
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setScheduleModal(false)}>
            <motion.div
              className="modal"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{ textAlign: "left" }}
            >
              <h3>Agendar limpeza</h3>
              <p>Executa as categorias marcadas automaticamente em segundo plano.</p>
              <div className="field">
                <div className="field-label">Frequência</div>
                <div className="pills">
                  {(["daily", "weekly"] as const).map((f) => (
                    <button key={f} className={"pill " + (scheduleFreq === f ? "on" : "")} onClick={() => setScheduleFreq(f)}>
                      {f === "daily" ? "Todo dia" : "Semanal (segunda)"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <div className="field-label">Horário</div>
                <input className="text-input" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
              </div>
              <div className="actions" style={{ marginTop: 18 }}>
                <button className="btn ghost" onClick={() => setScheduleModal(false)}>Cancelar</button>
                <button
                  className="btn primary"
                  onClick={async () => {
                    if (!cleaner) return;
                    const cats = cleaner.filter((c) => cleanerChecked[c.id]).map((c) => c.id);
                    const r = await window.pureza.schedule.create({
                      name: `Limpeza_${scheduleFreq}`,
                      categoryIds: cats,
                      frequency: scheduleFreq,
                      time: scheduleTime,
                    });
                    if (r.ok) {
                      logHistory({ type: "schedule-create", title: `Limpeza ${scheduleFreq === "daily" ? "diária" : "semanal"}`, detail: `${cats.length} categorias às ${scheduleTime}` });
                      loadSchedules();
                      setScheduleModal(false);
                    } else {
                      alert("Falha ao criar agendamento. Precisa de privilégios.");
                    }
                  }}
                >
                  Criar agendamento
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {multi.size > 0 && view === "programs" && (
          <motion.div
            className="multi-bar"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            <div className="multi-count">
              <strong>{multi.size}</strong> selecionado{multi.size === 1 ? "" : "s"}
            </div>
            <button className="btn ghost" onClick={() => setMulti(new Set())}>Limpar</button>
            <button
              className="btn primary"
              onClick={async () => {
                const toUninstall = apps.filter((a) => multi.has(a.key || a.name));
                for (const a of toUninstall) {
                  if (a.uwp && a.key) await window.pureza.apps.removeUwp(a.key);
                  else if (a.uninstall) await window.pureza.apps.uninstall(a.uninstall);
                }
                setMulti(new Set());
                loadApps();
              }}
            >
              Desinstalar em lote
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase !== "idle" && (
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              key={phase === "reviewing" || phase === "done" ? "wide" : "narrow"}
              className={"modal " + (phase === "reviewing" || phase === "done" ? "wide" : "")}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {phase !== "reviewing" && phase !== "done" && (
                <>
                  <div className="ring">
                    <svg viewBox="0 0 120 120">
                      <circle className="track" cx="60" cy="60" r="54" />
                      <circle className="bar" cx="60" cy="60" r="54" style={{ strokeDashoffset: 339.3 * (1 - progress) }} />
                    </svg>
                    <div className="pct">{Math.round(progress * 100)}%</div>
                  </div>
                  <h3>{PHASE_LABEL[phase as keyof typeof PHASE_LABEL]}</h3>
                  <p>{current?.name}</p>
                  <div className="log">
                    {log.slice(-6).map((line, i) => (
                      <motion.span
                        key={`${log.length}-${i}`}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25 }}
                        className={line.startsWith("✓") ? "good" : line.startsWith("⚠") ? "warn" : ""}
                      >
                        {line}
                      </motion.span>
                    ))}
                  </div>
                  <div className="actions">
                    <button className="btn ghost" onClick={closeModal}>Cancelar</button>
                  </div>
                </>
              )}

              {phase === "reviewing" && scan && (
                <>
                  <h3 style={{ textAlign: "left" }}>Rastros encontrados</h3>
                  <p style={{ textAlign: "left" }}>
                    {totalResiduals} itens · {formatSize(residualSize).v} {formatSize(residualSize).u} liberáveis
                  </p>
                  <div className="review">
                    {scan.registry.length > 0 && (
                      <Section title="Registro do Windows" count={scan.registry.length}>
                        {scan.registry.map((r) => (
                          <Row
                            key={r.path}
                            id={`reg:${r.path}`}
                            checked={!!checked[`reg:${r.path}`]}
                            onToggle={(v) => setChecked((c) => ({ ...c, [`reg:${r.path}`]: v }))}
                            label={r.path}
                            kind="reg"
                          />
                        ))}
                      </Section>
                    )}
                    {scan.files.length > 0 && (
                      <Section title="Arquivos e pastas" count={scan.files.length}>
                        {scan.files.map((f) => (
                          <Row
                            key={f.path}
                            id={`file:${f.path}`}
                            checked={!!checked[`file:${f.path}`]}
                            onToggle={(v) => setChecked((c) => ({ ...c, [`file:${f.path}`]: v }))}
                            label={f.path}
                            size={`${formatSize(f.sizeKB).v} ${formatSize(f.sizeKB).u}`}
                            kind="file"
                          />
                        ))}
                      </Section>
                    )}
                    {scan.services.length > 0 && (
                      <Section title="Serviços" count={scan.services.length}>
                        {scan.services.map((s) => (
                          <Row
                            key={s.name}
                            id={`svc:${s.name}`}
                            checked={!!checked[`svc:${s.name}`]}
                            onToggle={(v) => setChecked((c) => ({ ...c, [`svc:${s.name}`]: v }))}
                            label={s.display || s.name}
                            kind="svc"
                          />
                        ))}
                      </Section>
                    )}
                    {scan.tasks.length > 0 && (
                      <Section title="Tarefas agendadas" count={scan.tasks.length}>
                        {scan.tasks.map((t) => (
                          <Row
                            key={`${t.path}${t.name}`}
                            id={`task:${t.path}${t.name}`}
                            checked={!!checked[`task:${t.path}${t.name}`]}
                            onToggle={(v) => setChecked((c) => ({ ...c, [`task:${t.path}${t.name}`]: v }))}
                            label={`${t.path}${t.name}`}
                            kind="task"
                          />
                        ))}
                      </Section>
                    )}
                    {totalResiduals === 0 && (
                      <div className="empty">Nenhum rastro encontrado. O programa estava limpo.</div>
                    )}
                  </div>
                  <div className="actions">
                    <button className="btn ghost" onClick={closeModal}>
                      {totalResiduals === 0 ? "Fechar" : "Cancelar"}
                    </button>
                    {totalResiduals > 0 && (
                      <button className="btn primary" onClick={applyDeletion} disabled={totalChecked === 0}>
                        Apagar {totalChecked} iten{totalChecked === 1 ? "" : "s"}
                      </button>
                    )}
                  </div>
                </>
              )}

              {phase === "done" && applyResult && (
                <>
                  <motion.div
                    className="check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                  >
                    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 24l8 8 16-16" />
                    </svg>
                  </motion.div>
                  <h3>Pronto</h3>
                  <p>
                    {(applyResult.deleted.registry || 0) + (applyResult.deleted.files || 0) + (applyResult.deleted.services || 0) + (applyResult.deleted.tasks || 0)} iten
                    {((applyResult.deleted.registry || 0) + (applyResult.deleted.files || 0) + (applyResult.deleted.services || 0) + (applyResult.deleted.tasks || 0)) === 1 ? "" : "s"} apagados
                  </p>
                  <div className="summary">
                    <div><strong>{applyResult.deleted.registry || 0}</strong> chaves do registro</div>
                    <div><strong>{applyResult.deleted.files || 0}</strong> pastas</div>
                    <div><strong>{applyResult.deleted.services || 0}</strong> serviços</div>
                    <div><strong>{applyResult.deleted.tasks || 0}</strong> tarefas</div>
                    {applyResult.errors.length > 0 && (
                      <div className="errs">{applyResult.errors.length} falha{applyResult.errors.length === 1 ? "" : "s"} (permissão)</div>
                    )}
                  </div>
                  <div className="actions">
                    <button className="btn primary" onClick={closeModal}>Concluir</button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}

function weatherIcon(code: number): string {
  if (code === 0) return "☀";
  if (code <= 2) return "⛅";
  if (code === 3) return "☁";
  if (code >= 45 && code <= 48) return "🌫";
  if (code >= 51 && code <= 57) return "🌦";
  if (code >= 61 && code <= 67) return "🌧";
  if (code >= 71 && code <= 77) return "❄";
  if (code >= 80 && code <= 82) return "🌧";
  if (code >= 85 && code <= 86) return "❄";
  if (code >= 95) return "⛈";
  return "☀";
}

function weatherLabel(code: number): string {
  if (code === 0) return "Céu limpo";
  if (code <= 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code >= 45 && code <= 48) return "Névoa";
  if (code >= 51 && code <= 57) return "Chuvisco";
  if (code >= 61 && code <= 67) return "Chuva";
  if (code >= 71 && code <= 77) return "Neve";
  if (code >= 80 && code <= 82) return "Pancadas de chuva";
  if (code >= 85 && code <= 86) return "Pancadas de neve";
  if (code >= 95) return "Tempestade";
  return "";
}

function NetMetric({ label, value, unit, active }: { label: string; value: number | null; unit: string; active: boolean }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    if (value === null || value === undefined) { mv.set(0); return; }
    const ctrl = motionAnimate(mv, value, { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] });
    return () => ctrl.stop();
  }, [value]);
  return (
    <div className={"net-metric " + (active ? "active" : "")}>
      <div className="net-metric-v">
        {value === null ? "—" : <motion.span>{rounded}</motion.span>}
        <span>{unit}</span>
      </div>
      <div className="net-metric-k">{label}{active && <span className="live-dot" style={{ marginLeft: 6 }} />}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rev-sec">
      <div className="rev-head">
        <span>{title}</span>
        <span className="rev-count">{count}</span>
      </div>
      <div className="rev-items">{children}</div>
    </div>
  );
}

function Row({
  id,
  checked,
  onToggle,
  label,
  size,
  kind,
}: {
  id: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  size?: string;
  kind: "reg" | "file" | "svc" | "task";
}) {
  const icons: Record<string, string> = { reg: "⌘", file: "▣", svc: "◆", task: "◷" };
  return (
    <label className={"rev-row " + (checked ? "on" : "")} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="box">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8l3.5 3.5L13 5" />
        </svg>
      </span>
      <span className="kind" aria-hidden>{icons[kind]}</span>
      <span className="label">{label}</span>
      {size && <span className="row-size">{size}</span>}
    </label>
  );
}
