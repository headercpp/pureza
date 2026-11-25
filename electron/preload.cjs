const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pureza", {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  apps: {
    list: () => ipcRenderer.invoke("apps:list"),
    listUwp: () => ipcRenderer.invoke("apps:listUwp"),
    removeUwp: (pkg) => ipcRenderer.invoke("apps:removeUwp", pkg),
    icons: (items) => ipcRenderer.invoke("apps:icons", items),
    uninstall: (cmd) => ipcRenderer.invoke("apps:uninstall", cmd),
    scan: (name) => ipcRenderer.invoke("apps:scan", name),
    apply: (payload) => ipcRenderer.invoke("apps:apply", payload),
  },
  cleaner: {
    scan: () => ipcRenderer.invoke("cleaner:scan"),
    clean: (cats) => ipcRenderer.invoke("cleaner:clean", cats),
  },
  disk: {
    analyze: () => ipcRenderer.invoke("disk:analyze"),
  },
  restore: {
    list: () => ipcRenderer.invoke("restore:list"),
    create: (desc) => ipcRenderer.invoke("restore:create", desc),
    delete: (seq) => ipcRenderer.invoke("restore:delete", seq),
  },
  system: {
    restorePoint: (desc) => ipcRenderer.invoke("system:restorePoint", desc),
    stats: (full) => ipcRenderer.invoke("system:stats", full),
  },
  winget: {
    available: () => ipcRenderer.invoke("winget:available"),
    search: (q) => ipcRenderer.invoke("winget:search", q),
    install: (id) => ipcRenderer.invoke("winget:install", id),
  },
  geo: {
    info: () => ipcRenderer.invoke("geo:info"),
    weather: (lat, lon) => ipcRenderer.invoke("geo:weather", { lat, lon }),
  },
  shell: {
    openFolder: (p) => ipcRenderer.invoke("shell:openFolder", p),
    openUrl: (url) => ipcRenderer.invoke("shell:openUrl", url),
  },
  startup: {
    list: () => ipcRenderer.invoke("startup:list"),
    toggle: (id, enable) => ipcRenderer.invoke("startup:toggle", { id, enable }),
    impact: () => ipcRenderer.invoke("startup:impact"),
  },
  shredder: {
    shred: (paths, passes) => ipcRenderer.invoke("shredder:shred", paths, passes),
  },
  schedule: {
    list: () => ipcRenderer.invoke("schedule:list"),
    create: (opts) => ipcRenderer.invoke("schedule:create", opts),
    delete: (name) => ipcRenderer.invoke("schedule:delete", name),
  },
  health: {
    compute: () => ipcRenderer.invoke("health:compute"),
  },
  doctor: {
    run: () => ipcRenderer.invoke("doctor:run"),
    temps: () => ipcRenderer.invoke("system:temps"),
  },
  convert: {
    files: (items) => ipcRenderer.invoke("convert:files", items),
  },
  recommendations: {
    list: () => ipcRenderer.invoke("recommendations:list"),
  },
  history: {
    list: () => ipcRenderer.invoke("history:list"),
    add: (entry) => ipcRenderer.invoke("history:add", entry),
    clear: () => ipcRenderer.invoke("history:clear"),
    delete: (id) => ipcRenderer.invoke("history:delete", id),
  },
});
