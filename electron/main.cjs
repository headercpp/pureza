const { app, BrowserWindow, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec, spawn } = require("child_process");

const isDev = process.env.NODE_ENV === "development";
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    transparent: false,
    backgroundColor: "#0a0a0b",
    hasShadow: true,
    roundedCorners: false,
    resizable: false,
    maximizable: true,
    show: false,
    paintWhenInitiallyHidden: true,
    opacity: 0,
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.setBackgroundColor("#0a0a0b");

  // Só mostra depois de ready-to-show + did-finish-load; janela sobe com opacity 0 e faz fade-in
  let readyShow = false, loaded = false, shown = false;
  const fadeIn = () => {
    if (!win || win.isDestroyed()) return;
    let o = 0;
    const step = () => {
      if (!win || win.isDestroyed()) return;
      o = Math.min(1, o + 0.08);
      win.setOpacity(o);
      if (o < 1) setTimeout(step, 16);
    };
    step();
  };
  const tryShow = () => {
    if (shown || !readyShow || !loaded) return;
    shown = true;
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.setBackgroundColor("#0a0a0b");
      win.show();
      win.focus();
      setTimeout(fadeIn, 50);
    }, 180);
  };
  win.once("ready-to-show", () => { readyShow = true; tryShow(); });
  win.webContents.once("did-finish-load", () => { loaded = true; tryShow(); });
  setTimeout(() => { readyShow = loaded = true; tryShow(); }, 4000);

  // Se a janela morrer por qualquer motivo (fechar normal, crash, kill externo), mata o app inteiro
  win.on("closed", () => {
    win = null;
    app.exit(0);
  });
  win.webContents.on("render-process-gone", () => app.exit(0));
}

// Qualquer crash do processo principal → mata tudo
process.on("uncaughtException", () => app.exit(1));
process.on("SIGTERM", () => app.exit(0));
process.on("SIGINT", () => app.exit(0));

const PS_EXE =
  process.env.SystemRoot
    ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

function runPS(script) {
  const header = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; `;
  const tmp = path.join(os.tmpdir(), `pureza-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(tmp, "﻿" + header + "\n" + script, { encoding: "utf8" });
  return new Promise((resolve, reject) => {
    exec(
      `"${PS_EXE}" -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`,
      { maxBuffer: 50 * 1024 * 1024, windowsHide: true, encoding: "utf8" },
      (err, stdout, stderr) => {
        fs.unlink(tmp, () => {});
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      }
    );
  });
}

ipcMain.handle("window:minimize", () => win?.minimize());
ipcMain.handle("window:maximize", () => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.handle("window:close", () => win?.close());

ipcMain.handle("apps:list", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $paths = @(
      'Registry::HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'Registry::HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'Registry::HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    )
    $out = foreach ($p in $paths) {
      Get-ChildItem $p | ForEach-Object {
        $i = Get-ItemProperty $_.PSPath
        if ($i.DisplayName -and -not $i.SystemComponent -and -not $i.ParentKeyName) {
          [PSCustomObject]@{
            name=$i.DisplayName
            vendor=$i.Publisher
            version=$i.DisplayVersion
            installDate=$i.InstallDate
            sizeKB=$i.EstimatedSize
            uninstall=$i.UninstallString
            quietUninstall=$i.QuietUninstallString
            location=$i.InstallLocation
            displayIcon=$i.DisplayIcon
            key=$_.PSChildName
            scope=$p
          }
        }
      }
    }
    $out | Sort-Object name -Unique | ConvertTo-Json -Compress -Depth 3
  `;
  try {
    const out = await runPS(script);
    console.log("[apps:list] bytes:", out.length, "preview:", out.slice(0, 200));
    const data = JSON.parse(out || "[]");
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    console.error("[apps:list] erro:", e.message);
    return [];
  }
});

function parseIconPath(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.startsWith('"')) {
    const m = s.match(/^"([^"]+)"(?:,(-?\d+))?$/);
    if (m) return m[1];
  }
  const m = s.match(/^(.+),(-?\d+)$/);
  if (m) return m[1].trim();
  return s;
}

function collectExes(folder, depth = 3, out = []) {
  if (depth < 0) return out;
  try {
    if (!folder || !fs.existsSync(folder)) return out;
    const entries = fs.readdirSync(folder, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(folder, e.name);
      if (e.isFile() && e.name.toLowerCase().endsWith(".exe") && !/unins|setup|install|update|crash|helper/i.test(e.name)) {
        try {
          const size = fs.statSync(full).size;
          out.push({ path: full, name: e.name.toLowerCase(), size });
        } catch {}
      } else if (e.isDirectory() && !/cache|crash|log|temp/i.test(e.name)) {
        collectExes(full, depth - 1, out);
      }
    }
  } catch {}
  return out;
}

const NAME_STOP = new Set([
  "the","a","and","for","of","inc","llc","ltd","corp","corporation","company","software",
  "app","application","client","browser","desktop","windows","win","win32","win64","x64","x86",
  "edition","version","pro","plus","free","premium","standard",
]);

function nameWords(appName) {
  if (!appName) return [];
  return appName
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !NAME_STOP.has(w));
}

function findBestExe(folder, appName) {
  const exes = collectExes(folder);
  if (!exes.length) return null;
  const words = nameWords(appName);
  if (words.length) {
    for (const w of words) {
      const match = exes.find((e) => e.name.toLowerCase().includes(w));
      if (match) return match.path;
    }
  }
  exes.sort((a, b) => b.size - a.size);
  return exes[0].path;
}

async function tryIcon(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    const img = await app.getFileIcon(p, { size: "large" });
    if (img && !img.isEmpty()) return img.toDataURL();
  } catch {}
  try {
    const img = nativeImage.createFromPath(p);
    if (img && !img.isEmpty()) return img.toDataURL();
  } catch {}
  return null;
}

const EMBEDDED_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>
       <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
         <stop offset='0' stop-color='#9aa0a6'/><stop offset='1' stop-color='#5f6368'/>
       </linearGradient></defs>
       <rect width='48' height='48' rx='10' fill='url(#g)'/>
       <path d='M24 14l8 5v10l-8 5-8-5V19z' fill='#fff' fill-opacity='.9'/>
       <path d='M24 14v10l8 5M24 24l-8 5M24 24V14' stroke='#5f6368' stroke-width='1.2' fill='none' opacity='.5'/>
     </svg>`
  );

let fallbackIcon = null;
async function getFallback() {
  if (fallbackIcon) return fallbackIcon;
  const candidates = [
    path.join(process.env.SystemRoot || "C:\\Windows", "System32", "imageres.dll"),
    path.join(process.env.SystemRoot || "C:\\Windows", "System32", "shell32.dll"),
    path.join(process.env.SystemRoot || "C:\\Windows", "explorer.exe"),
  ];
  for (const c of candidates) {
    const d = await tryIcon(c);
    if (d) { fallbackIcon = d; return d; }
  }
  fallbackIcon = EMBEDDED_FALLBACK;
  return fallbackIcon;
}

ipcMain.handle("apps:icons", async (_e, items) => {
  if (!Array.isArray(items) || !items.length) return {};
  const fb = await getFallback();
  const out = {};
  const extraRoots = [
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.ProgramData,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter(Boolean);
  await Promise.all(
    items.map(async (it) => {
      if (!it.key) return;
      const bestInLocation = it.location ? findBestExe(it.location, it.name) : null;
      const candidates = [
        bestInLocation,
        parseIconPath(it.icon),
        parseIconPath(it.uninstall),
      ].filter(Boolean);
      for (const p of candidates) {
        const d = await tryIcon(p);
        if (d) { out[it.key] = d; return; }
      }
      const words = nameWords(it.name);
      if (words.length) {
        for (const root of extraRoots) {
          let kids = [];
          try {
            kids = fs.readdirSync(root, { withFileTypes: true }).filter((c) => c.isDirectory());
          } catch {}
          for (const w of words) {
            const hit = kids.find((c) => c.name.toLowerCase().includes(w));
            if (!hit) continue;
            const target = path.join(root, hit.name);
            const best = findBestExe(target, it.name);
            const d = await tryIcon(best);
            if (d) { out[it.key] = d; return; }
          }
        }
      }
      if (fb) out[it.key] = fb;
    })
  );
  return out;
});

ipcMain.handle("apps:icons_old", async (_e, items) => {
  if (!Array.isArray(items) || !items.length) return {};
  const payloadFile = path.join(os.tmpdir(), `pureza-icons-${Date.now()}.json`);
  fs.writeFileSync(payloadFile, JSON.stringify(items), "utf8");
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    Add-Type -AssemblyName System.Drawing
    $items = Get-Content -Raw -Path '${payloadFile}' | ConvertFrom-Json
    $out = @{}

    Add-Type -MemberDefinition @"
      [System.Runtime.InteropServices.DllImport("shell32.dll", CharSet=System.Runtime.InteropServices.CharSet.Auto)]
      public static extern int ExtractIconEx(string sFile, int iIndex, System.IntPtr[] piLargeVersion, System.IntPtr[] piSmallVersion, int amountIcons);
      [System.Runtime.InteropServices.DllImport("user32.dll")]
      public static extern int DestroyIcon(System.IntPtr hIcon);
"@ -Name "IconX" -Namespace "W32"

    function Get-Bitmap([string]$path, [int]$idx) {
      if (-not $path -or -not (Test-Path -LiteralPath $path)) { return $null }
      try {
        $ext = [System.IO.Path]::GetExtension($path).ToLower()
        if ($ext -in '.exe','.dll','.ocx','.mui','.cpl','.msc') {
          $large = New-Object IntPtr[] 1
          $small = New-Object IntPtr[] 1
          $n = [W32.IconX]::ExtractIconEx($path, $idx, $large, $small, 1)
          if ($n -gt 0 -and $large[0] -ne [IntPtr]::Zero) {
            $icon = [System.Drawing.Icon]::FromHandle($large[0])
            $bmp = $icon.ToBitmap()
            [W32.IconX]::DestroyIcon($large[0]) | Out-Null
            if ($small[0] -ne [IntPtr]::Zero) { [W32.IconX]::DestroyIcon($small[0]) | Out-Null }
            return $bmp
          }
        } elseif ($ext -eq '.ico') {
          $icon = New-Object System.Drawing.Icon($path, 64, 64)
          return $icon.ToBitmap()
        } else {
          $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
          if ($icon) { return $icon.ToBitmap() }
        }
      } catch {}
      return $null
    }

    function Parse-Path([string]$raw) {
      if (-not $raw) { return @($null, 0) }
      $s = $raw.Trim()
      $idx = 0
      if ($s -match '^"([^"]+)",(-?\d+)$') { return @($Matches[1], [int]$Matches[2]) }
      if ($s -match '^"([^"]+)"') { return @($Matches[1], 0) }
      if ($s -match '^(.+),(-?\d+)$') { return @($Matches[1], [int]$Matches[2]) }
      return @($s, 0)
    }

    function Find-Exe([string]$folder) {
      if (-not $folder -or -not (Test-Path -LiteralPath $folder)) { return $null }
      $hits = Get-ChildItem -LiteralPath $folder -Filter *.exe -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'unin(s|st)' } | Sort-Object Length -Descending | Select-Object -First 1
      if ($hits) { return $hits.FullName }
      $deeper = Get-ChildItem -LiteralPath $folder -Filter *.exe -File -Recurse -Depth 2 -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'unin(s|st)' } | Sort-Object Length -Descending | Select-Object -First 1
      if ($deeper) { return $deeper.FullName }
      return $null
    }

    foreach ($it in $items) {
      $key = $it.key
      $bmp = $null
      $candidates = @()
      if ($it.icon)      { $p = Parse-Path $it.icon;      $candidates += ,@($p[0], $p[1]) }
      if ($it.uninstall) { $p = Parse-Path $it.uninstall; $candidates += ,@($p[0], 0) }
      if ($it.location)  {
        $exe = Find-Exe $it.location
        if ($exe) { $candidates += ,@($exe, 0) }
      }
      foreach ($c in $candidates) {
        $bmp = Get-Bitmap $c[0] $c[1]
        if ($bmp) { break }
      }
      if (-not $bmp) {
        $bmp = Get-Bitmap "$env:SystemRoot\\System32\\shell32.dll" 2
      }
      if ($bmp) {
        try {
          $ms = New-Object System.IO.MemoryStream
          $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
          $out[$key] = [Convert]::ToBase64String($ms.ToArray())
          $ms.Dispose()
          $bmp.Dispose()
        } catch {}
      }
    }
    $out | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    return JSON.parse(out || "{}");
  } catch (e) {
    console.error("[apps:icons] erro:", e.message);
    return {};
  } finally {
    fs.unlink(payloadFile, () => {});
  }
});

ipcMain.handle("system:restorePoint", async (_e, description) => {
  const safe = String(description || "Pureza").replace(/[^a-zA-Z0-9 ._-]/g, "");
  const script = `
    try {
      Enable-ComputerRestore -Drive "$env:SystemDrive" -ErrorAction SilentlyContinue
      Checkpoint-Computer -Description "${safe}" -RestorePointType "APPLICATION_UNINSTALL" -ErrorAction Stop
      'ok'
    } catch { "err: $_" }
  `;
  try {
    const out = (await runPS(script)).trim();
    return { ok: out.startsWith("ok"), message: out };
  } catch (e) {
    return { ok: false, message: String(e.message || e) };
  }
});

ipcMain.handle("apps:uninstall", async (_e, cmd) => {
  if (!cmd) return { ok: false, message: "sem UninstallString" };
  return new Promise((resolve) => {
    exec(`cmd /c ${cmd}`, { windowsHide: true }, (err) => {
      resolve({ ok: !err, message: err ? String(err.message) : "ok" });
    });
  });
});

ipcMain.handle("apps:scan", async (_e, name) => {
  const clean = String(name || "")
    .replace(/[()\[\]{}<>"'`\\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const terms = clean
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 2);
  if (!terms.length) return { registry: [], files: [], services: [], tasks: [] };

  const termList = terms.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $terms = @(${termList})
    $reg = @(); $files = @(); $services = @(); $tasks = @()

    $regRoots = @('HKCU:\\Software','HKLM:\\Software','HKLM:\\Software\\WOW6432Node')
    foreach ($root in $regRoots) {
      try {
        Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
          $n = $_.PSChildName
          foreach ($t in $terms) { if ($n -like "*$t*") { $reg += [PSCustomObject]@{ path=$_.Name } ; break } }
        }
      } catch {}
    }

    $folders = @("$env:APPDATA","$env:LOCALAPPDATA","$env:ProgramData","$env:ProgramFiles","$\{env:ProgramFiles(x86)\}")
    foreach ($folder in $folders) {
      if (-not (Test-Path $folder)) { continue }
      try {
        Get-ChildItem $folder -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $n = $_.Name
          foreach ($t in $terms) {
            if ($n -like "*$t*") {
              $size = 0
              try { $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } catch {}
              $files += [PSCustomObject]@{ path=$_.FullName; sizeKB=[int64](($size)/1024) }
              break
            }
          }
        }
      } catch {}
    }

    try {
      Get-Service -ErrorAction SilentlyContinue | ForEach-Object {
        foreach ($t in $terms) {
          if ($_.DisplayName -like "*$t*" -or $_.Name -like "*$t*") {
            $services += [PSCustomObject]@{ name=$_.Name; display=$_.DisplayName }
            break
          }
        }
      }
    } catch {}

    try {
      Get-ScheduledTask -ErrorAction SilentlyContinue | ForEach-Object {
        foreach ($t in $terms) {
          if ($_.TaskName -like "*$t*") {
            $tasks += [PSCustomObject]@{ name=$_.TaskName; path=$_.TaskPath }
            break
          }
        }
      }
    } catch {}

    @{ registry=$reg; files=$files; services=$services; tasks=$tasks } | ConvertTo-Json -Depth 4 -Compress
  `;
  try {
    const out = await runPS(script);
    return JSON.parse(out || "{}");
  } catch (e) {
    return { registry: [], files: [], services: [], tasks: [], error: String(e.message || e) };
  }
});

ipcMain.handle("apps:apply", async (_e, payload) => {
  const payloadFile = path.join(os.tmpdir(), `pureza-apply-${Date.now()}.json`);
  fs.writeFileSync(payloadFile, JSON.stringify(payload || {}), "utf8");
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $d = Get-Content -Raw -Path '${payloadFile}' | ConvertFrom-Json
    $deleted = @{ registry=0; files=0; services=0; tasks=0 }
    $errors = @()

    foreach ($r in @($d.registry)) {
      try {
        $p = $r.path
        $p = $p -replace '^HKEY_CURRENT_USER','HKCU:' -replace '^HKEY_LOCAL_MACHINE','HKLM:' -replace '^HKEY_USERS','HKU:' -replace '^HKEY_CLASSES_ROOT','HKCR:'
        Remove-Item $p -Recurse -Force -ErrorAction Stop
        $deleted.registry++
      } catch { $errors += "reg $($r.path)" }
    }
    foreach ($f in @($d.files)) {
      try { Remove-Item $f.path -Recurse -Force -ErrorAction Stop; $deleted.files++ }
      catch { $errors += "file $($f.path)" }
    }
    foreach ($s in @($d.services)) {
      try { Stop-Service $s.name -Force -ErrorAction SilentlyContinue; & sc.exe delete $s.name | Out-Null; $deleted.services++ }
      catch { $errors += "svc $($s.name)" }
    }
    foreach ($t in @($d.tasks)) {
      try { Unregister-ScheduledTask -TaskName $t.name -TaskPath $t.path -Confirm:$false -ErrorAction Stop; $deleted.tasks++ }
      catch { $errors += "task $($t.name)" }
    }

    @{ deleted=$deleted; errors=$errors } | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    return JSON.parse(out || "{}");
  } catch (e) {
    return { deleted: {}, errors: [String(e.message || e)] };
  } finally {
    fs.unlink(payloadFile, () => {});
  }
});

ipcMain.handle("cleaner:scan", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    function Size([string]$p) {
      if (-not (Test-Path -LiteralPath $p)) { return 0 }
      try { return [int64]((Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum) } catch { return 0 }
    }
    function RecycleSize() {
      try {
        $s = New-Object -ComObject Shell.Application
        $bin = $s.Namespace(10)
        if ($null -eq $bin) { return 0 }
        $total = 0
        foreach ($i in $bin.Items()) { $total += $i.Size }
        return [int64]$total
      } catch { return 0 }
    }
    $cats = @(
      @{ id='temp-user'; name='Arquivos temporários do usuário'; paths=@("$env:TEMP") },
      @{ id='temp-win'; name='Arquivos temporários do Windows'; paths=@("$env:SystemRoot\\Temp") },
      @{ id='prefetch'; name='Prefetch'; paths=@("$env:SystemRoot\\Prefetch") },
      @{ id='thumb'; name='Cache de miniaturas'; paths=@("$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer") },
      @{ id='logs-win'; name='Logs do Windows'; paths=@("$env:SystemRoot\\Logs","$env:SystemRoot\\Panther") },
      @{ id='delivery'; name='Cache de Entrega otimizada'; paths=@("$env:SystemRoot\\SoftwareDistribution\\DeliveryOptimization") },
      @{ id='chrome'; name='Cache do Chrome'; paths=@("$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cache","$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Code Cache") },
      @{ id='edge'; name='Cache do Edge'; paths=@("$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cache","$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Code Cache") },
      @{ id='brave'; name='Cache do Brave'; paths=@("$env:LOCALAPPDATA\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Cache","$env:LOCALAPPDATA\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Code Cache") },
      @{ id='firefox'; name='Cache do Firefox'; paths=@("$env:LOCALAPPDATA\\Mozilla\\Firefox\\Profiles") },
      @{ id='recycle'; name='Lixeira'; paths=@(); isBin=$true }
    )
    $out = foreach ($c in $cats) {
      $bytes = 0
      if ($c.isBin) { $bytes = RecycleSize }
      else { foreach ($p in $c.paths) { $bytes += Size $p } }
      [PSCustomObject]@{ id=$c.id; name=$c.name; sizeKB=[int64]($bytes/1024); paths=$c.paths; isBin=[bool]$c.isBin }
    }
    $out | ConvertTo-Json -Compress -Depth 4
  `;
  try {
    const out = await runPS(script);
    return JSON.parse(out || "[]");
  } catch (e) {
    console.error("[cleaner:scan]", e.message);
    return [];
  }
});

ipcMain.handle("cleaner:clean", async (_e, categories) => {
  if (!Array.isArray(categories) || !categories.length) return { cleaned: 0, errors: [] };
  const payloadFile = path.join(os.tmpdir(), `pureza-clean-${Date.now()}.json`);
  fs.writeFileSync(payloadFile, JSON.stringify(categories), "utf8");
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $cats = Get-Content -Raw -Path '${payloadFile}' | ConvertFrom-Json
    $cleanedBytes = 0
    $errors = @()
    foreach ($c in $cats) {
      if ($c.isBin) {
        try {
          $s = New-Object -ComObject Shell.Application
          $bin = $s.Namespace(10)
          foreach ($i in @($bin.Items())) { $cleanedBytes += $i.Size }
          Clear-RecycleBin -Force -ErrorAction SilentlyContinue
        } catch { $errors += "lixeira" }
        continue
      }
      foreach ($p in $c.paths) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        try {
          $size = (Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
          Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | ForEach-Object {
            try { Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop } catch {}
          }
          $cleanedBytes += [int64]$size
        } catch { $errors += "$($c.id) $p" }
      }
    }
    @{ cleanedKB=[int64]($cleanedBytes/1024); errors=$errors } | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    return JSON.parse(out || "{}");
  } catch (e) {
    return { cleanedKB: 0, errors: [String(e.message || e)] };
  } finally {
    fs.unlink(payloadFile, () => {});
  }
});

ipcMain.handle("disk:analyze", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $roots = @("$env:ProgramFiles","$\{env:ProgramFiles(x86)\}","$env:LOCALAPPDATA","$env:APPDATA","$env:ProgramData")
    $all = @()
    foreach ($r in $roots) {
      if (-not (Test-Path $r)) { continue }
      Get-ChildItem $r -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $size = 0
        try { $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } catch {}
        if ($size -gt 50MB) {
          $all += [PSCustomObject]@{ path=$_.FullName; name=$_.Name; parent=$r; sizeKB=[int64]($size/1024) }
        }
      }
    }
    $all | Sort-Object sizeKB -Descending | Select-Object -First 25 | ConvertTo-Json -Compress -Depth 3
  `;
  try {
    const out = await runPS(script);
    const data = JSON.parse(out || "[]");
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    console.error("[disk:analyze]", e.message);
    return [];
  }
});

ipcMain.handle("apps:listUwp", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.SignatureKind -ne 'System' } | ForEach-Object {
      $manifest = $null
      try { $manifest = Get-AppxPackageManifest $_ } catch {}
      $display = $null
      $logoPath = $null
      if ($manifest) {
        try {
          $display = $manifest.Package.Properties.DisplayName
          $logo = $manifest.Package.Properties.Logo
          if ($logo) { $logoPath = Join-Path $_.InstallLocation $logo }
        } catch {}
      }
      if (-not $display -or $display -like 'ms-resource*') { $display = $_.Name }
      $size = 0
      try { $size = (Get-ChildItem $_.InstallLocation -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } catch {}
      [PSCustomObject]@{
        name = $display
        vendor = $_.Publisher -replace '^CN=([^,]+).*','$1'
        version = $_.Version
        sizeKB = [int64]($size/1024)
        location = $_.InstallLocation
        key = $_.PackageFullName
        uwp = $true
        logo = $logoPath
      }
    } | ConvertTo-Json -Compress -Depth 3
  `;
  try {
    const out = await runPS(script);
    const data = JSON.parse(out || "[]");
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    console.error("[apps:listUwp]", e.message);
    return [];
  }
});

ipcMain.handle("apps:removeUwp", async (_e, packageFullName) => {
  if (!packageFullName) return { ok: false };
  const safe = packageFullName.replace(/'/g, "''");
  const script = `try { Remove-AppxPackage -Package '${safe}' -ErrorAction Stop; 'ok' } catch { "err: $_" }`;
  try {
    const out = (await runPS(script)).trim();
    return { ok: out === "ok", message: out };
  } catch (e) { return { ok: false, message: String(e.message || e) }; }
});

ipcMain.handle("restore:list", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    Get-ComputerRestorePoint | ForEach-Object {
      [PSCustomObject]@{
        sequence = $_.SequenceNumber
        description = $_.Description
        time = $_.ConvertToDateTime($_.CreationTime).ToString('o')
        type = switch ($_.RestorePointType) { 0 {'Aplicação'} 1 {'Instalador'} 10 {'Checkpoint'} 12 {'Modificar configurações'} 13 {'Cancelar operação'} default {"Tipo $_"} }
      }
    } | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    const data = JSON.parse(out || "[]");
    return Array.isArray(data) ? data : [data];
  } catch (e) { return []; }
});

ipcMain.handle("restore:create", async (_e, desc) => {
  const safe = String(desc || "Pureza").replace(/[^a-zA-Z0-9 ._-]/g, "");
  const script = `
    try {
      Enable-ComputerRestore -Drive "$env:SystemDrive" -ErrorAction SilentlyContinue
      Checkpoint-Computer -Description "${safe}" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
      'ok'
    } catch { "err: $_" }
  `;
  try {
    const out = (await runPS(script)).trim();
    return { ok: out === "ok", message: out };
  } catch (e) { return { ok: false, message: String(e.message || e) }; }
});

ipcMain.handle("restore:delete", async (_e, sequence) => {
  const seq = parseInt(sequence, 10);
  if (!seq) return { ok: false };
  const script = `
    try {
      $p = Get-ComputerRestorePoint | Where-Object SequenceNumber -eq ${seq}
      if (-not $p) { 'not-found' }
      else {
        $p.PSBase.Delete() | Out-Null
        'ok'
      }
    } catch { "err: $_" }
  `;
  try {
    const out = (await runPS(script)).trim();
    return { ok: out === "ok", message: out };
  } catch (e) { return { ok: false, message: String(e.message || e) }; }
});

ipcMain.handle("shell:openFolder", async (_e, p) => {
  if (!p) return { ok: false };
  const target = fs.existsSync(p) ? p : path.dirname(p);
  try { await shell.openPath(target); return { ok: true }; }
  catch (e) { return { ok: false, message: String(e.message || e) }; }
});

ipcMain.handle("shell:openUrl", async (_e, url) => {
  try { await shell.openExternal(url); return { ok: true }; }
  catch (e) { return { ok: false, message: String(e.message || e) }; }
});

ipcMain.handle("startup:list", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $out = @()
    $runKeys = @(
      @{ scope='Usuário'; path='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; enabled=$true },
      @{ scope='Sistema'; path='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; enabled=$true },
      @{ scope='Sistema'; path='HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; enabled=$true },
      @{ scope='Usuário'; path='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Disabled'; enabled=$false },
      @{ scope='Sistema'; path='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Disabled'; enabled=$false }
    )
    foreach ($k in $runKeys) {
      if (-not (Test-Path $k.path)) { continue }
      $item = Get-Item $k.path
      foreach ($name in $item.Property) {
        $cmd = (Get-ItemProperty $k.path).$name
        $out += [PSCustomObject]@{
          id = "reg::$($k.path)::$name"
          kind = 'registro'
          scope = $k.scope
          name = $name
          command = $cmd
          enabled = $k.enabled
        }
      }
    }
    $folders = @(
      @{ scope='Usuário'; path="$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup" },
      @{ scope='Sistema'; path="$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup" }
    )
    foreach ($f in $folders) {
      if (-not (Test-Path $f.path)) { continue }
      Get-ChildItem $f.path -File -ErrorAction SilentlyContinue | ForEach-Object {
        $out += [PSCustomObject]@{
          id = "file::$($_.FullName)"
          kind = 'atalho'
          scope = $f.scope
          name = $_.BaseName
          command = $_.FullName
          enabled = $true
        }
      }
    }
    $out | ConvertTo-Json -Compress -Depth 3
  `;
  try {
    const out = await runPS(script);
    const data = JSON.parse(out || "[]");
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    console.error("[startup:list] erro:", e.message);
    return [];
  }
});

ipcMain.handle("startup:toggle", async (_e, { id, enable }) => {
  if (!id) return { ok: false };
  const script = `
    $ErrorActionPreference='Stop'
    $id = '${id.replace(/'/g, "''")}'
    try {
      if ($id -like 'reg::*') {
        $rest = $id.Substring(5)
        $i = $rest.LastIndexOf('::')
        $keyPath = $rest.Substring(0, $i)
        $valueName = $rest.Substring($i + 2)
        $isDisabled = $keyPath -like '*\\Disabled'
        $parent = if ($isDisabled) { $keyPath -replace '\\\\Disabled$','' } else { $keyPath }
        $destParent = if (${enable ? "$true" : "$false"}) { $parent } else { Join-Path $parent 'Disabled' }
        if (-not (Test-Path $destParent)) { New-Item -Path $destParent -Force | Out-Null }
        $cmd = (Get-ItemProperty -Path $keyPath -Name $valueName).$valueName
        New-ItemProperty -Path $destParent -Name $valueName -Value $cmd -PropertyType String -Force | Out-Null
        if ($destParent -ne $keyPath) { Remove-ItemProperty -Path $keyPath -Name $valueName -Force }
        'ok'
      } elseif ($id -like 'file::*') {
        $file = $id.Substring(6)
        $folder = [System.IO.Path]::GetDirectoryName($file)
        $disabled = Join-Path $folder '.pureza-disabled'
        if (-not (Test-Path $disabled)) { New-Item -ItemType Directory $disabled -Force | Out-Null }
        if (${enable ? "$true" : "$false"}) {
          $leaf = [System.IO.Path]::GetFileName($file)
          $src = Join-Path $disabled $leaf
          if (Test-Path $src) { Move-Item $src $file -Force }
        } else {
          Move-Item $file $disabled -Force
        }
        'ok'
      } else { 'bad-id' }
    } catch { "err: $_" }
  `;
  try {
    const out = (await runPS(script)).trim();
    return { ok: out === "ok", message: out };
  } catch (e) {
    return { ok: false, message: String(e.message || e) };
  }
});

// === Doctor: bateria de testes de performance ===
ipcMain.handle("doctor:run", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $cpu = (Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 2 -ErrorAction SilentlyContinue).CounterSamples | Select-Object -Last 1
    $cpuPct = if ($cpu) { [int]$cpu.CookedValue } else { 0 }
    $os = Get-CimInstance Win32_OperatingSystem
    $ramPct = [int]((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100)
    $diskQueue = (Get-Counter '\\PhysicalDisk(_Total)\\Current Disk Queue Length' -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue).CounterSamples | Select-Object -First 1
    $diskQ = if ($diskQueue) { [math]::Round($diskQueue.CookedValue, 1) } else { 0 }
    $pages = (Get-Counter '\\Memory\\Pages/sec' -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue).CounterSamples | Select-Object -First 1
    $pagesSec = if ($pages) { [int]$pages.CookedValue } else { 0 }
    $uptimeDays = [int]((Get-Date) - $os.LastBootUpTime).TotalDays
    $top = Get-Process | Where-Object { $_.CPU -ne $null } | Sort-Object CPU -Descending | Select-Object -First 5 ProcessName, @{N='CPU';E={[int]$_.CPU}}, @{N='RAM_MB';E={[int]($_.WorkingSet64/1MB)}}
    $topRam = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 ProcessName, @{N='RAM_MB';E={[int]($_.WorkingSet64/1MB)}}
    $services = Get-Service | Where-Object { $_.Status -eq 'Running' -and $_.StartType -eq 'Automatic' } | Measure-Object | Select-Object -ExpandProperty Count
    $startup = 0
    foreach ($k in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run')) {
      if (Test-Path $k) { $startup += (Get-Item $k).Property.Count }
    }
    @{
      cpuPct=$cpuPct; ramPct=$ramPct; diskQ=$diskQ; pagesSec=$pagesSec; uptimeDays=$uptimeDays;
      servicesCount=$services; startupCount=$startup;
      topCpu=$top; topRam=$topRam
    } | ConvertTo-Json -Compress -Depth 4
  `;
  try {
    const out = await runPS(script);
    const d = JSON.parse(out || "{}");
    const findings = [];

    if (d.cpuPct > 70) findings.push({ severity: "high", title: `CPU em ${d.cpuPct}% em repouso`, body: "Algum processo pode estar travado ou minerando em background.", detail: "cpu" });
    else if (d.cpuPct > 30) findings.push({ severity: "med", title: `CPU em ${d.cpuPct}%`, body: "Uso elevado considerando que o sistema deveria estar ocioso.", detail: "cpu" });

    if (d.ramPct > 85) findings.push({ severity: "high", title: `Memória em ${d.ramPct}%`, body: "Pressão alta de RAM causa paginação em disco e lentidão geral.", detail: "ram" });
    else if (d.ramPct > 70) findings.push({ severity: "med", title: `Memória em ${d.ramPct}%`, body: "Uso elevado, feche programas que não está usando.", detail: "ram" });

    if (d.diskQ > 2) findings.push({ severity: "high", title: `Fila de disco: ${d.diskQ}`, body: "Disco está saturado, algo está lendo/escrevendo muito.", detail: "disk" });

    if (d.pagesSec > 1000) findings.push({ severity: "med", title: `${d.pagesSec} páginas/seg`, body: "Muita paginação indica falta de RAM.", detail: "pages" });

    if (d.uptimeDays > 7) findings.push({ severity: "med", title: `${d.uptimeDays} dias sem reiniciar`, body: "Reiniciar libera memória e aplica atualizações pendentes.", detail: "uptime" });

    if (d.servicesCount > 180) findings.push({ severity: "low", title: `${d.servicesCount} serviços ativos`, body: "Número alto de serviços automáticos pode pesar no boot.", detail: "services" });

    if (d.startupCount > 15) findings.push({ severity: "med", title: `${d.startupCount} programas na inicialização`, body: "Cada programa de startup atrasa o boot.", detail: "startup" });

    if (findings.length === 0) findings.push({ severity: "good", title: "Nada preocupante", body: "Sistema parece saudável no momento.", detail: null });

    return { findings, raw: d };
  } catch (e) {
    return { findings: [{ severity: "high", title: "Erro ao rodar diagnóstico", body: e.message }], raw: {} };
  }
});

// === Temperaturas ===
ipcMain.handle("system:temps", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $cpu = $null
    try {
      $t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1
      if ($t) { $cpu = [math]::Round(($t.CurrentTemperature / 10) - 273.15, 1) }
    } catch {}
    $gpu = $null
    try {
      $nv = & nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>$null
      if ($nv) { $gpu = [int]($nv | Select-Object -First 1) }
    } catch {}
    $disks = @()
    try {
      Get-CimInstance -Namespace root/wmi -ClassName MSStorageDriver_FailurePredictStatus -ErrorAction SilentlyContinue | ForEach-Object {
        $disks += @{ name=$_.InstanceName; ok=(-not $_.PredictFailure) }
      }
    } catch {}
    @{ cpu=$cpu; gpu=$gpu; disks=$disks } | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    return JSON.parse(out || "{}");
  } catch { return {}; }
});

// === Converter arquivo (imagens via System.Drawing) ===
ipcMain.handle("convert:files", async (_e, items) => {
  if (!Array.isArray(items) || !items.length) return { done: 0, errors: [] };
  const payloadFile = path.join(os.tmpdir(), `pureza-convert-${Date.now()}.json`);
  fs.writeFileSync(payloadFile, JSON.stringify(items), "utf8");
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    Add-Type -AssemblyName System.Drawing
    $items = Get-Content -Raw -Path '${payloadFile}' | ConvertFrom-Json
    $done = 0; $errors = @()
    foreach ($it in $items) {
      try {
        $src = $it.src
        $target = $it.target
        $srcExt = [System.IO.Path]::GetExtension($src).ToLower()
        $base = [System.IO.Path]::GetFileNameWithoutExtension($src)
        $dir = [System.IO.Path]::GetDirectoryName($src)
        $dst = Join-Path $dir "$base.$target"
        if ($target -in 'jpg','jpeg','png','bmp','gif') {
          $img = [System.Drawing.Image]::FromFile($src)
          $fmt = switch ($target) {
            'jpg'  { [System.Drawing.Imaging.ImageFormat]::Jpeg }
            'jpeg' { [System.Drawing.Imaging.ImageFormat]::Jpeg }
            'png'  { [System.Drawing.Imaging.ImageFormat]::Png }
            'bmp'  { [System.Drawing.Imaging.ImageFormat]::Bmp }
            'gif'  { [System.Drawing.Imaging.ImageFormat]::Gif }
          }
          if ($target -in 'jpg','jpeg') {
            $bmp = New-Object System.Drawing.Bitmap $img.Width, $img.Height
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.Clear([System.Drawing.Color]::White)
            $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
            $bmp.Save($dst, $fmt)
            $bmp.Dispose()
            $g.Dispose()
          } else {
            $img.Save($dst, $fmt)
          }
          $img.Dispose()
          $done++
        } else {
          $errors += "$src : formato nao suportado"
        }
      } catch { $errors += "$($it.src): $_" }
    }
    @{ done=$done; errors=$errors } | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    return JSON.parse(out || "{}");
  } catch (e) {
    return { done: 0, errors: [String(e.message || e)] };
  } finally {
    fs.unlink(payloadFile, () => {});
  }
});

// === Score de saúde + recomendações ===
const HEALTH_PATH = path.join(app.getPath("userData"), "health.json");

function readHealth() {
  try { return JSON.parse(fs.readFileSync(HEALTH_PATH, "utf8")); }
  catch { return []; }
}
function writeHealth(points) {
  try {
    fs.mkdirSync(path.dirname(HEALTH_PATH), { recursive: true });
    fs.writeFileSync(HEALTH_PATH, JSON.stringify(points.slice(-30)), "utf8");
  } catch {}
}

ipcMain.handle("health:compute", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $disk = Get-PSDrive C
    $diskFreePct = if (($disk.Used + $disk.Free) -gt 0) { [int](100 * $disk.Free / ($disk.Used + $disk.Free)) } else { 50 }
    $os = Get-CimInstance Win32_OperatingSystem
    $ramUsedPct = [int]((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100)

    $tempSize = 0
    @("$env:TEMP","$env:SystemRoot\\Temp","$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer") | ForEach-Object {
      if (Test-Path $_) {
        try { $tempSize += (Get-ChildItem $_ -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } catch {}
      }
    }
    $tempGB = [math]::Round($tempSize / 1GB, 2)

    $startupCount = 0
    $heavyStart = 0
    foreach ($k in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run')) {
      if (Test-Path $k) {
        $it = Get-Item $k
        $startupCount += $it.Property.Count
        foreach ($name in $it.Property) {
          $cmd = (Get-ItemProperty $k).$name
          if ($cmd -match '"([^"]+)"') { $p = $Matches[1] } elseif ($cmd) { $p = ($cmd -split ' ')[0] } else { $p = $null }
          if ($p -and (Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p).Length -gt 50MB)) { $heavyStart++ }
        }
      }
    }

    $restoreCount = 0
    try { $restoreCount = @(Get-ComputerRestorePoint).Count } catch {}

    $uptimeDays = [int]((Get-Date) - $os.LastBootUpTime).TotalDays

    @{
      diskFreePct = $diskFreePct
      ramUsedPct = $ramUsedPct
      tempGB = $tempGB
      startupCount = $startupCount
      heavyStartup = $heavyStart
      restoreCount = $restoreCount
      uptimeDays = $uptimeDays
    } | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    const d = JSON.parse(out || "{}");

    const comps = [];
    let score = 0;
    const diskPts = Math.min(30, Math.round(d.diskFreePct * 0.6));
    comps.push({ key: "disk", label: "Espaço em disco", points: diskPts, max: 30, note: `${d.diskFreePct}% livre em C:` });
    score += diskPts;

    const tempPts = d.tempGB < 0.5 ? 20 : d.tempGB < 2 ? 14 : d.tempGB < 5 ? 7 : 2;
    comps.push({ key: "temp", label: "Lixo acumulado", points: tempPts, max: 20, note: `${d.tempGB} GB em caches` });
    score += tempPts;

    const ramPts = d.ramUsedPct < 50 ? 15 : d.ramUsedPct < 75 ? 10 : d.ramUsedPct < 90 ? 5 : 1;
    comps.push({ key: "ram", label: "Memória", points: ramPts, max: 15, note: `${d.ramUsedPct}% em uso` });
    score += ramPts;

    const bootPts = d.heavyStartup === 0 ? 15 : d.heavyStartup <= 2 ? 10 : d.heavyStartup <= 4 ? 5 : 1;
    comps.push({ key: "boot", label: "Impacto no boot", points: bootPts, max: 15, note: `${d.heavyStartup} de ${d.startupCount} pesados` });
    score += bootPts;

    const restorePts = d.restoreCount >= 3 ? 10 : d.restoreCount >= 1 ? 6 : 0;
    comps.push({ key: "restore", label: "Pontos de restauração", points: restorePts, max: 10, note: `${d.restoreCount} pontos salvos` });
    score += restorePts;

    const uptimePts = d.uptimeDays <= 3 ? 10 : d.uptimeDays <= 7 ? 6 : 2;
    comps.push({ key: "uptime", label: "Uptime", points: uptimePts, max: 10, note: `${d.uptimeDays} dias sem reiniciar` });
    score += uptimePts;

    const history = readHealth();
    const today = new Date().toISOString().slice(0, 10);
    const existing = history.findIndex((h) => h.date === today);
    if (existing >= 0) history[existing] = { date: today, score };
    else history.push({ date: today, score });
    writeHealth(history);

    return { score, components: comps, trend: history.slice(-7), raw: d };
  } catch (e) {
    console.error("[health:compute]", e.message);
    return { score: 0, components: [], trend: [], raw: {} };
  }
});

ipcMain.handle("recommendations:list", async () => {
  const health = await (async () => {
    try { return JSON.parse(fs.readFileSync(HEALTH_PATH, "utf8")); } catch { return []; }
  })();
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $disk = Get-PSDrive C
    $diskFreePct = if (($disk.Used + $disk.Free) -gt 0) { [int](100 * $disk.Free / ($disk.Used + $disk.Free)) } else { 50 }
    $tempSize = 0
    @("$env:TEMP","$env:SystemRoot\\Temp") | ForEach-Object {
      if (Test-Path $_) { try { $tempSize += (Get-ChildItem $_ -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } catch {} }
    }
    $chromeSize = 0
    @("$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cache","$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cache","$env:LOCALAPPDATA\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Cache") | ForEach-Object {
      if (Test-Path $_) { try { $chromeSize += (Get-ChildItem $_ -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } catch {} }
    }
    $recycleBytes = 0
    try {
      $s = New-Object -ComObject Shell.Application
      $bin = $s.Namespace(10)
      if ($bin) { foreach ($i in $bin.Items()) { $recycleBytes += $i.Size } }
    } catch {}
    $restoreCount = 0
    try { $restoreCount = @(Get-ComputerRestorePoint).Count } catch {}
    $scheduleCount = 0
    try { $scheduleCount = @(Get-ScheduledTask | Where-Object { $_.TaskName -like 'Pureza_*' }).Count } catch {}
    $unusedCount = 0
    try {
      $cutoff = (Get-Date).AddDays(-90)
      $paths = @('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
      foreach ($p in $paths) {
        if (Test-Path $p) {
          Get-ChildItem $p | ForEach-Object {
            $i = Get-ItemProperty $_.PSPath
            if ($i.DisplayName -and $i.InstallLocation -and (Test-Path -LiteralPath $i.InstallLocation)) {
              $t = (Get-Item -LiteralPath $i.InstallLocation).LastAccessTime
              if ($t -lt $cutoff) { $unusedCount++ }
            }
          }
        }
      }
    } catch {}
    @{
      diskFreePct = $diskFreePct
      tempKB = [int64]($tempSize/1024)
      chromeKB = [int64]($chromeSize/1024)
      recycleKB = [int64]($recycleBytes/1024)
      restoreCount = $restoreCount
      scheduleCount = $scheduleCount
      unusedCount = $unusedCount
    } | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    const d = JSON.parse(out || "{}");
    const recs = [];

    if (d.diskFreePct < 15) {
      recs.push({ id: "disk-low", severity: "high", title: `Disco quase cheio (${d.diskFreePct}% livres)`, body: "Libere espaço com a limpeza ou análise de disco.", action: { label: "Limpar agora", view: "cleaner" } });
    }
    if (d.tempKB > 1024 * 1024) {
      const mb = Math.round(d.tempKB / 1024);
      recs.push({ id: "temp-big", severity: "med", title: `${mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB"} em arquivos temporários`, body: "A limpeza remove sem afetar programas.", action: { label: "Limpar", view: "cleaner" } });
    }
    if (d.chromeKB > 512 * 1024) {
      const mb = Math.round(d.chromeKB / 1024);
      recs.push({ id: "browser-cache", severity: "med", title: `Cache de navegadores: ${mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB"}`, body: "Pode recuperar espaço sem perder histórico.", action: { label: "Revisar", view: "cleaner" } });
    }
    if (d.recycleKB > 512 * 1024) {
      const mb = Math.round(d.recycleKB / 1024);
      recs.push({ id: "recycle", severity: "low", title: `Lixeira com ${mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB"}`, body: "Esvazie para liberar espaço permanentemente.", action: { label: "Limpar", view: "cleaner" } });
    }
    if (d.restoreCount === 0) {
      recs.push({ id: "no-restore", severity: "med", title: "Sem ponto de restauração", body: "Crie um ponto antes de mexer no sistema.", action: { label: "Criar", view: "restore" } });
    }
    if (d.scheduleCount === 0) {
      recs.push({ id: "no-schedule", severity: "low", title: "Nenhuma limpeza agendada", body: "Programe uma rotina semanal pra não acumular lixo.", action: { label: "Agendar", view: "cleaner" } });
    }
    if (d.unusedCount >= 5) {
      recs.push({ id: "unused", severity: "med", title: `${d.unusedCount} programas não usados em 90 dias`, body: "Revise candidatos a desinstalação.", action: { label: "Ver programas", view: "programs" } });
    }
    if (recs.length === 0) {
      recs.push({ id: "clean", severity: "good", title: "Tudo em ordem", body: "Nenhuma ação crítica agora. Continue assim.", action: null });
    }
    return recs;
  } catch (e) {
    console.error("[recommendations:list]", e.message);
    return [];
  }
});

// === Geolocalização por IP + clima (via main, sem CORS) ===
let geoCache = null;
async function fetchJsonWithTimeout(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Pureza/0.1" } });
    if (!r.ok) throw new Error("http " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
ipcMain.handle("geo:info", async () => {
  if (geoCache) return geoCache;
  // Tenta ipapi.co, depois ipwho.is, depois ip-api.com
  try {
    const d = await fetchJsonWithTimeout("https://ipapi.co/json/");
    if (d && !d.error && d.city) {
      geoCache = {
        city: d.city, region: d.region, region_code: d.region_code,
        country_code: d.country_code, country_name: d.country_name,
        latitude: d.latitude, longitude: d.longitude,
      };
      return geoCache;
    }
  } catch (e) { console.error("[geo:info ipapi]", e.message); }
  try {
    const d = await fetchJsonWithTimeout("https://ipwho.is/");
    if (d && d.success !== false && d.city) {
      geoCache = {
        city: d.city, region: d.region, region_code: d.region_code,
        country_code: d.country_code, country_name: d.country,
        latitude: d.latitude, longitude: d.longitude,
      };
      return geoCache;
    }
  } catch (e) { console.error("[geo:info ipwho]", e.message); }
  try {
    const d = await fetchJsonWithTimeout("http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,lat,lon");
    if (d && d.status === "success") {
      geoCache = {
        city: d.city, region: d.regionName, region_code: d.region,
        country_code: d.countryCode, country_name: d.country,
        latitude: d.lat, longitude: d.lon,
      };
      return geoCache;
    }
  } catch (e) { console.error("[geo:info ip-api]", e.message); }
  return null;
});
ipcMain.handle("geo:weather", async (_e, { lat, lon }) => {
  if (lat == null || lon == null) return null;
  try {
    const d = await fetchJsonWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
    return { temp: Math.round(d.current?.temperature_2m), code: d.current?.weather_code ?? 0 };
  } catch (e) {
    console.error("[geo:weather]", e.message);
    return null;
  }
});

// === Shredder: sobrescreve bytes aleatórios N vezes, depois apaga ===
const crypto = require("crypto");
async function shredFile(filePath, passes = 3) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const CHUNK = 64 * 1024;
  for (let p = 0; p < passes; p++) {
    const fh = fs.openSync(filePath, "r+");
    let written = 0;
    while (written < size) {
      const n = Math.min(CHUNK, size - written);
      const buf = crypto.randomBytes(n);
      fs.writeSync(fh, buf, 0, n, written);
      written += n;
    }
    fs.fsyncSync(fh);
    fs.closeSync(fh);
  }
  const dir = path.dirname(filePath);
  const randName = crypto.randomBytes(8).toString("hex");
  const renamed = path.join(dir, randName);
  try { fs.renameSync(filePath, renamed); fs.unlinkSync(renamed); }
  catch { fs.unlinkSync(filePath); }
}

async function shredPath(p, passes = 3, stats = { files: 0, bytes: 0, errors: [] }) {
  try {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      const entries = fs.readdirSync(p);
      for (const e of entries) await shredPath(path.join(p, e), passes, stats);
      try { fs.rmdirSync(p); } catch {}
    } else {
      try { await shredFile(p, passes); stats.files++; stats.bytes += st.size; }
      catch (e) { stats.errors.push(`${p}: ${e.message}`); }
    }
  } catch (e) { stats.errors.push(`${p}: ${e.message}`); }
  return stats;
}

ipcMain.handle("shredder:shred", async (_e, paths, passes = 3) => {
  if (!Array.isArray(paths)) return { files: 0, bytes: 0, errors: ["no paths"] };
  const stats = { files: 0, bytes: 0, errors: [] };
  for (const p of paths) await shredPath(p, passes, stats);
  return stats;
});

// === Agendamento: Task Scheduler com prefixo Pureza_ ===
ipcMain.handle("schedule:list", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    Get-ScheduledTask | Where-Object { $_.TaskName -like 'Pureza_*' } | ForEach-Object {
      $info = Get-ScheduledTaskInfo $_
      $trigger = $_.Triggers | Select-Object -First 1
      [PSCustomObject]@{
        name = $_.TaskName
        state = "$($_.State)"
        lastRun = if ($info.LastRunTime) { $info.LastRunTime.ToString('o') } else { $null }
        nextRun = if ($info.NextRunTime) { $info.NextRunTime.ToString('o') } else { $null }
        description = $_.Description
        schedule = if ($trigger) { "$($trigger.CimClass.CimClassName) · $($trigger.StartBoundary)" } else { "" }
      }
    } | ConvertTo-Json -Compress -Depth 3
  `;
  try {
    const out = await runPS(script);
    const data = JSON.parse(out || "[]");
    return Array.isArray(data) ? data : [data];
  } catch { return []; }
});

ipcMain.handle("schedule:create", async (_e, { name, categoryIds, frequency, time }) => {
  const safeName = `Pureza_${String(name || "Limpeza").replace(/[^a-zA-Z0-9_]/g, "")}_${Date.now().toString(36)}`;
  const catsPath = path.join(app.getPath("userData"), `${safeName}.json`);
  fs.writeFileSync(catsPath, JSON.stringify(categoryIds), "utf8");
  const [hh, mm] = (time || "03:00").split(":");
  const trigger = frequency === "daily" ? "DAILY" : frequency === "weekly" ? "WEEKLY" : "DAILY";
  const workerScript = `
    $cats = Get-Content -Raw -Path '${catsPath}' | ConvertFrom-Json
    # (lógica equivalente ao cleaner:clean, resumida)
    $paths = @{
      'temp-user' = @("$env:TEMP")
      'temp-win' = @("$env:SystemRoot\\Temp")
      'prefetch' = @("$env:SystemRoot\\Prefetch")
      'thumb' = @("$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer")
      'logs-win' = @("$env:SystemRoot\\Logs","$env:SystemRoot\\Panther")
      'delivery' = @("$env:SystemRoot\\SoftwareDistribution\\DeliveryOptimization")
      'chrome' = @("$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cache")
      'edge' = @("$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cache")
      'brave' = @("$env:LOCALAPPDATA\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Cache")
      'firefox' = @("$env:LOCALAPPDATA\\Mozilla\\Firefox\\Profiles")
    }
    foreach ($id in $cats) {
      if ($id -eq 'recycle') { Clear-RecycleBin -Force -ErrorAction SilentlyContinue; continue }
      foreach ($p in $paths[$id]) {
        if (Test-Path $p) {
          Get-ChildItem $p -Force -ErrorAction SilentlyContinue | ForEach-Object { try { Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop } catch {} }
        }
      }
    }
  `;
  const workerPath = path.join(app.getPath("userData"), `${safeName}.ps1`);
  fs.writeFileSync(workerPath, "﻿" + workerScript, "utf8");
  const script = `
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${workerPath}"'
    ${trigger === "WEEKLY"
      ? `$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At ${hh}:${mm}`
      : `$trigger = New-ScheduledTaskTrigger -Daily -At ${hh}:${mm}`}
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries
    Register-ScheduledTask -TaskName '${safeName}' -Action $action -Trigger $trigger -Settings $settings -Description 'Limpeza agendada pelo Pureza' -Force | Out-Null
    'ok'
  `;
  try {
    const out = (await runPS(script)).trim();
    return { ok: out === "ok", name: safeName, message: out };
  } catch (e) {
    return { ok: false, message: String(e.message || e) };
  }
});

ipcMain.handle("schedule:delete", async (_e, name) => {
  if (!name || !name.startsWith("Pureza_")) return { ok: false };
  const script = `try { Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false -ErrorAction Stop; 'ok' } catch { "err: $_" }`;
  try {
    const out = (await runPS(script)).trim();
    return { ok: out === "ok", message: out };
  } catch (e) { return { ok: false, message: String(e.message || e) }; }
});

// === Impacto no boot: checa se o processo tá rodando + RAM atual ===
ipcMain.handle("startup:impact", async () => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    function PathFromCommand([string]$cmd) {
      if (-not $cmd) { return $null }
      $c = $cmd.Trim()
      if ($c -match '^"([^"]+)"') { return $Matches[1] }
      if ($c -match '^(\\S+\\.(exe|com|bat|cmd))') { return $Matches[1] }
      return ($c -split ' ')[0]
    }
    $out = @{}
    $keys = @(
      'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
    )
    foreach ($k in $keys) {
      if (-not (Test-Path $k)) { continue }
      $item = Get-Item $k
      foreach ($name in $item.Property) {
        $cmd = (Get-ItemProperty $k).$name
        $p = PathFromCommand $cmd
        $size = 0
        $ramMB = 0
        $running = $false
        if ($p -and (Test-Path -LiteralPath $p)) {
          try { $size = (Get-Item -LiteralPath $p).Length } catch {}
          try {
            $exeName = [System.IO.Path]::GetFileNameWithoutExtension($p)
            $procs = Get-Process -Name $exeName -ErrorAction SilentlyContinue
            if ($procs) {
              $running = $true
              $ramMB = [int](($procs | Measure-Object -Property WorkingSet64 -Sum).Sum / 1MB)
            }
          } catch {}
        }
        $impact = 'baixo'
        if ($running) {
          if ($ramMB -ge 200) { $impact = 'alto' }
          elseif ($ramMB -ge 50) { $impact = 'médio' }
        } else {
          if ($size -ge 100MB) { $impact = 'alto' }
          elseif ($size -ge 20MB) { $impact = 'médio' }
        }
        $out["reg::$($k)::$name"] = @{ sizeKB=[int64]($size/1024); ramMB=$ramMB; running=$running; impact=$impact }
      }
    }
    $out | ConvertTo-Json -Compress
  `;
  try {
    const out = await runPS(script);
    return JSON.parse(out || "{}");
  } catch { return {}; }
});

// === Histórico Pureza: persistente em userData ===
const HISTORY_PATH = path.join(app.getPath("userData"), "history.json");
function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")); }
  catch { return []; }
}
function writeHistory(items) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(items.slice(0, 500)), "utf8");
  } catch {}
}
ipcMain.handle("history:list", async () => readHistory());
ipcMain.handle("history:add", async (_e, entry) => {
  const h = readHistory();
  h.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), ...entry });
  writeHistory(h);
  return true;
});
ipcMain.handle("history:clear", async () => { writeHistory([]); return true; });
ipcMain.handle("history:delete", async (_e, id) => {
  const h = readHistory().filter((x) => x.id !== id);
  writeHistory(h);
  return true;
});

// === Estatísticas do sistema (para o Hub) ===
let statsCache = null;
ipcMain.handle("system:stats", async (_e, full = false) => {
  const script = `
    $ErrorActionPreference='SilentlyContinue'
    $os = Get-CimInstance Win32_OperatingSystem
    $out = @{
      ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
      ramFreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
      ramUsedPct = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100)
    }
    ${full
      ? `
    $disks = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null -and ($_.Used + $_.Free) -gt 1GB } | ForEach-Object {
      [PSCustomObject]@{ letter=$_.Name; usedGB=[math]::Round($_.Used/1GB,1); freeGB=[math]::Round($_.Free/1GB,1); totalGB=[math]::Round(($_.Used+$_.Free)/1GB,1) }
    }
    $disks = @($disks)
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.AdapterRAM -gt 0 } | Select-Object -First 1
    $net = Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | Select-Object -First 1
    $screen = Get-CimInstance Win32_VideoController | Select-Object -First 1
    $battery = Get-CimInstance Win32_Battery
    $diskPhys = Get-CimInstance Win32_DiskDrive | Select-Object -First 1
    $boot = (Get-Date) - $os.LastBootUpTime
    $out.diskUsedGB = [math]::Round(($disks | Measure-Object -Property usedGB -Sum).Sum, 1)
    $out.diskFreeGB = [math]::Round(($disks | Measure-Object -Property freeGB -Sum).Sum, 1)
    $out.diskTotalGB = [math]::Round(($disks | Measure-Object -Property totalGB -Sum).Sum, 1)
    $out.disks = $disks
    $out.cpuName = $cpu.Name
    $out.cpuCores = $cpu.NumberOfCores
    $out.cpuThreads = $cpu.NumberOfLogicalProcessors
    $out.osName = $os.Caption
    $out.osBuild = $os.BuildNumber
    $out.osArch = $os.OSArchitecture
    $out.hostName = $os.CSName
    $out.userName = $env:USERNAME
    $out.gpuName = if ($gpu) { $gpu.Name } else { $null }
    $out.gpuRamMB = if ($gpu) { [int]($gpu.AdapterRAM / 1MB) } else { 0 }
    $out.screenRes = if ($screen -and $screen.CurrentHorizontalResolution) { "$($screen.CurrentHorizontalResolution)×$($screen.CurrentVerticalResolution)" } else { $null }
    $out.diskModel = if ($diskPhys) { $diskPhys.Model } else { $null }
    $out.netName = if ($net) { $net.Name } else { $null }
    $out.netSpeed = if ($net) { [int]($net.LinkSpeed -replace '[^0-9]','') } else { 0 }
    $out.batteryPct = if ($battery) { [int]$battery.EstimatedChargeRemaining } else { -1 }
    $out.bootDays = [int]$boot.TotalDays
    $out.bootHours = [int]$boot.Hours
    $out.bootMinutes = [int]$boot.Minutes
    `
      : ""}
    $out | ConvertTo-Json -Compress -Depth 4
  `;
  try {
    const out = await runPS(script);
    console.log("[system:stats]", full ? "FULL" : "live", "bytes:", out.length, "preview:", out.slice(0, 200));
    const data = JSON.parse(out || "{}");
    if (full) statsCache = data;
    else if (statsCache) return { ...statsCache, ...data };
    return data;
  } catch (e) {
    console.error("[system:stats] erro:", e.message);
    return statsCache || {};
  }
});

// === Winget: disponibilidade, busca, instalação ===
function wingetAvailable() {
  return new Promise((resolve) => {
    exec("where winget.exe", (err, stdout) => resolve(!err && stdout.trim().length > 0));
  });
}

ipcMain.handle("winget:available", async () => wingetAvailable());

ipcMain.handle("winget:search", async (_e, query) => {
  const q = String(query || "").trim();
  if (!q) return [];
  const safe = q.replace(/[^a-zA-Z0-9 _.\-+]/g, "");
  return new Promise((resolve) => {
    exec(
      `winget search --query "${safe}" --accept-source-agreements`,
      { maxBuffer: 10 * 1024 * 1024, windowsHide: true, encoding: "utf8" },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.startsWith("-"));
        const headerIdx = lines.findIndex((l) => /\bName\b/.test(l) && /\bId\b/.test(l));
        if (headerIdx < 0) return resolve([]);
        const header = lines[headerIdx];
        const cols = ["Name", "Id", "Version", "Match", "Source"];
        const positions = cols
          .map((c) => ({ name: c, pos: header.indexOf(c) }))
          .filter((c) => c.pos >= 0)
          .sort((a, b) => a.pos - b.pos);
        const out = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim() || /^(Name|Nome)\s/.test(line)) continue;
          const row = {};
          for (let j = 0; j < positions.length; j++) {
            const start = positions[j].pos;
            const end = j + 1 < positions.length ? positions[j + 1].pos : line.length;
            row[positions[j].name.toLowerCase()] = line.substring(start, end).trim();
          }
          if (row.name && row.id) out.push(row);
          if (out.length >= 40) break;
        }
        resolve(out);
      }
    );
  });
});

ipcMain.handle("winget:install", async (_e, id) => {
  if (!id) return { ok: false };
  const safe = id.replace(/[^a-zA-Z0-9._\-+]/g, "");
  return new Promise((resolve) => {
    exec(
      `winget install --id "${safe}" --exact --silent --accept-source-agreements --accept-package-agreements`,
      { maxBuffer: 20 * 1024 * 1024, windowsHide: true, encoding: "utf8", timeout: 10 * 60 * 1000 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: stdout, error: err ? String(err.message || err) : undefined });
      }
    );
  });
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
