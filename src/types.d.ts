export interface InstalledApp {
  name: string;
  vendor?: string;
  version?: string;
  installDate?: string;
  sizeKB?: number;
  uninstall?: string;
  quietUninstall?: string;
  location?: string;
  displayIcon?: string;
  key?: string;
  scope?: string;
  uwp?: boolean;
  logo?: string;
}

export interface CleanerCategory {
  id: string;
  name: string;
  sizeKB: number;
  paths: string[];
  isBin: boolean;
}

export interface DiskFolder {
  path: string;
  name: string;
  parent: string;
  sizeKB: number;
}

export interface RestorePoint {
  sequence: number;
  description: string;
  time: string;
  type: string;
}

export interface RegItem { path: string }
export interface FileItem { path: string; sizeKB: number }
export interface ServiceItem { name: string; display: string }
export interface TaskItem { name: string; path: string }

export interface ScanResult {
  registry: RegItem[];
  files: FileItem[];
  services: ServiceItem[];
  tasks: TaskItem[];
  error?: string;
}

export interface ApplyResult {
  deleted: { registry?: number; files?: number; services?: number; tasks?: number };
  errors: string[];
}

declare global {
  interface Window {
    pureza: {
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
      };
      apps: {
        list: () => Promise<InstalledApp[]>;
        listUwp: () => Promise<InstalledApp[]>;
        removeUwp: (pkg: string) => Promise<{ ok: boolean; message?: string }>;
        icons: (items: { key: string; name?: string; icon: string; uninstall?: string; location?: string }[]) => Promise<Record<string, string>>;
        uninstall: (cmd: string) => Promise<{ ok: boolean; message: string }>;
        scan: (name: string) => Promise<ScanResult>;
        apply: (payload: ScanResult) => Promise<ApplyResult>;
      };
      cleaner: {
        scan: () => Promise<CleanerCategory[]>;
        clean: (cats: CleanerCategory[]) => Promise<{ cleanedKB: number; errors: string[] }>;
      };
      disk: {
        analyze: () => Promise<DiskFolder[]>;
      };
      restore: {
        list: () => Promise<RestorePoint[]>;
        create: (desc: string) => Promise<{ ok: boolean; message?: string }>;
        delete: (seq: number) => Promise<{ ok: boolean; message?: string }>;
      };
      system: {
        restorePoint: (desc: string) => Promise<{ ok: boolean; message: string }>;
        stats: (full?: boolean) => Promise<SystemStats>;
      };
      winget: {
        available: () => Promise<boolean>;
        search: (q: string) => Promise<WingetItem[]>;
        install: (id: string) => Promise<{ ok: boolean; output?: string; error?: string }>;
      };
      geo: {
        info: () => Promise<{ city?: string; region?: string; region_code?: string; country_code?: string; country_name?: string; latitude?: number; longitude?: number } | null>;
        weather: (lat: number, lon: number) => Promise<{ temp: number; code: number } | null>;
      };
      shell: {
        openFolder: (p: string) => Promise<{ ok: boolean; message?: string }>;
        openUrl: (url: string) => Promise<{ ok: boolean; message?: string }>;
      };
      startup: {
        list: () => Promise<StartupItem[]>;
        toggle: (id: string, enable: boolean) => Promise<{ ok: boolean; message: string }>;
        impact: () => Promise<Record<string, { sizeKB: number; ramMB: number; running: boolean; impact: "alto" | "médio" | "baixo" }>>;
      };
      shredder: {
        shred: (paths: string[], passes?: number) => Promise<{ files: number; bytes: number; errors: string[] }>;
      };
      schedule: {
        list: () => Promise<ScheduledTask[]>;
        create: (opts: { name: string; categoryIds: string[]; frequency: "daily" | "weekly"; time: string }) => Promise<{ ok: boolean; name: string; message?: string }>;
        delete: (name: string) => Promise<{ ok: boolean; message?: string }>;
      };
      health: {
        compute: () => Promise<HealthScore>;
      };
      doctor: {
        run: () => Promise<DoctorResult>;
        temps: () => Promise<{ cpu: number | null; gpu: number | null; disks: Array<{ name: string; ok: boolean }> }>;
      };
      convert: {
        files: (items: { src: string; target: string }[]) => Promise<{ done: number; errors: string[] }>;
      };
      recommendations: {
        list: () => Promise<Recommendation[]>;
      };
      history: {
        list: () => Promise<HistoryEntry[]>;
        add: (entry: Omit<HistoryEntry, "id" | "ts">) => Promise<boolean>;
        clear: () => Promise<boolean>;
        delete: (id: string) => Promise<boolean>;
      };
    };
  }
}

export interface ScheduledTask {
  name: string;
  state: string;
  lastRun: string | null;
  nextRun: string | null;
  description: string;
  schedule: string;
}

export interface SystemStats {
  diskUsedGB?: number;
  diskFreeGB?: number;
  diskTotalGB?: number;
  disks?: Array<{ letter: string; usedGB: number; freeGB: number; totalGB: number }>;
  ramTotalGB: number;
  ramFreeGB: number;
  ramUsedPct: number;
  cpuName?: string;
  cpuCores?: number;
  cpuThreads?: number;
  osName?: string;
  osBuild?: number;
  osArch?: string;
  hostName?: string;
  userName?: string;
  gpuName?: string;
  gpuRamMB?: number;
  screenRes?: string;
  diskModel?: string;
  netName?: string;
  netSpeed?: number;
  batteryPct?: number;
  bootDays?: number;
  bootHours?: number;
  bootMinutes?: number;
}

export interface WingetItem {
  name: string;
  id: string;
  version?: string;
  match?: string;
  source?: string;
}

export interface HealthComponent {
  key: string;
  label: string;
  points: number;
  max: number;
  note: string;
}

export interface HealthScore {
  score: number;
  components: HealthComponent[];
  trend: Array<{ date: string; score: number }>;
  raw: Record<string, number>;
}

export interface DoctorFinding {
  severity: "high" | "med" | "low" | "good";
  title: string;
  body: string;
  detail: string | null;
}

export interface DoctorResult {
  findings: DoctorFinding[];
  raw: {
    cpuPct?: number;
    ramPct?: number;
    diskQ?: number;
    pagesSec?: number;
    uptimeDays?: number;
    servicesCount?: number;
    startupCount?: number;
    topCpu?: Array<{ ProcessName: string; CPU: number; RAM_MB: number }>;
    topRam?: Array<{ ProcessName: string; RAM_MB: number }>;
  };
}

export interface Recommendation {
  id: string;
  severity: "high" | "med" | "low" | "good";
  title: string;
  body: string;
  action: { label: string; view: string } | null;
}

export interface HistoryEntry {
  id: string;
  ts: number;
  type: "uninstall" | "clean" | "shred" | "startup-toggle" | "restore-create" | "restore-delete" | "schedule-create" | "schedule-delete" | "apply-leftovers";
  title: string;
  detail?: string;
  count?: number;
  sizeKB?: number;
}

export interface StartupItem {
  id: string;
  kind: "registro" | "atalho";
  scope: "Usuário" | "Sistema";
  name: string;
  command: string;
  enabled: boolean;
}
