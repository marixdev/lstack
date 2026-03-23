import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  Tray,
  nativeImage,
  dialog,
} from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { ServiceManager } from './core/ServiceManager';
import { PackageManager } from './core/PackageManager';
import { VHostManager } from './core/VHostManager';
import { CertManager } from './core/CertManager';
import { registerIpcHandlers } from './ipc';
import { TerminalManager } from './core/TerminalManager';
import type { LStackSettings } from '../src/types';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

const HOME = app.getPath('home');
const DATA_DIR = path.join(HOME, '.lstack');
const ELECTRON_USER_DATA_DIR = path.join(DATA_DIR, 'electron');
const ELECTRON_SESSION_DATA_DIR = path.join(ELECTRON_USER_DATA_DIR, 'session');
const ELECTRON_CACHE_DIR = path.join(ELECTRON_USER_DATA_DIR, 'cache');
const BIN_DIR = path.join(DATA_DIR, 'bin', process.platform);
const WWW_DIR = path.join(DATA_DIR, 'www');
const ETC_DIR = path.join(DATA_DIR, 'etc');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const DB_DIR = path.join(DATA_DIR, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Keep Chromium profile under writable app-owned directory
fs.ensureDirSync(ELECTRON_USER_DATA_DIR);
fs.ensureDirSync(ELECTRON_SESSION_DATA_DIR);
fs.ensureDirSync(ELECTRON_CACHE_DIR);

app.setPath('userData', ELECTRON_USER_DATA_DIR);
app.setPath('sessionData', ELECTRON_SESSION_DATA_DIR);
app.commandLine.appendSwitch('disk-cache-dir', ELECTRON_CACHE_DIR);
app.commandLine.appendSwitch('media-cache-dir', ELECTRON_CACHE_DIR);
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-features', 'GpuShaderDiskCache');
app.disableHardwareAcceleration();

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const defaultSettings: LStackSettings = {
  wwwDir: WWW_DIR,
  dataDir: DATA_DIR,
  logsDir: LOGS_DIR,
  binDir: BIN_DIR,
  domain: 'test',
  webserver: 'nginx',
  phpVersion: '8.3.29',
  mariadbVersion: '11.4.5',
  nginxVersion: '1.28.0',
  apacheVersion: '2.4.66',
  redisVersion: '7.2.4',
  memcachedVersion: '1.6.22',
  mailpitVersion: '1.22.3',
  postgresqlVersion: '17.4',
  httpPort: 80,
  httpsPort: 443,
  mariadbPort: 3306,
  autoVirtualHost: true,
  autoStartServices: false,
  language: 'vi',
  theme: 'dark',
};

const VERSION_NORMALIZERS: Record<string, Record<string, string>> = {
  phpVersion: {
    '5': '5.6.40',
    '5.6': '5.6.40',
    '7': '7.4.33',
    '7.4': '7.4.33',
    '7.3': '7.3.33',
    '8.5': '8.5.4',
    '8.5.1': '8.5.4',
    '8.4': '8.4.19',
    '8.4.16': '8.4.19',
    '8.3': '8.3.29',
    '8.2': '8.2.30',
    '8.1': '8.1.34',
  },
  mariadbVersion: {
    '12': '12.0.1',
    '12.0': '12.0.1',
    '11.4': '11.4.5',
    '11.2': '11.2.6',
    '10.11': '10.11.11',
    '10.6': '10.6.21',
  },
  nginxVersion: {
    '1.28': '1.28.0',
    '1.27': '1.27.4',
    '1.26': '1.26.3',
  },
  apacheVersion: {
    '2.4': '2.4.66',
    '2.4.62': '2.4.62',
    '2.4.66': '2.4.66',
  },
  redisVersion: {
    '7.2': '7.2.4',
  },
  memcachedVersion: {
    '1.6': '1.6.22',
  },
  mailpitVersion: {
    '1.22': '1.22.3',
  },
  postgresqlVersion: {
    '17': '17.4',
    '16': '16.8',
    '15': '15.12',
  },
};

function normalizeSettingsVersions(s: LStackSettings): LStackSettings {
  const next = { ...s } as Record<string, unknown>;
  for (const [key, aliases] of Object.entries(VERSION_NORMALIZERS)) {
    const current = next[key];
    if (typeof current === 'string' && aliases[current]) {
      next[key] = aliases[current];
    }
  }
  return next as unknown as LStackSettings;
}

// ─── Globals ──────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settings: LStackSettings = defaultSettings;
let serviceManager: ServiceManager;
let packageManager: PackageManager;
let vhostManager: VHostManager;
let terminalManager: TerminalManager;
let isQuitting = false;

// ─── Init Data Directories ────────────────────────────────────────────────────
async function initDataDirs() {
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(BIN_DIR);
  await fs.ensureDir(WWW_DIR);
  await fs.ensureDir(ETC_DIR);
  await fs.ensureDir(path.join(ETC_DIR, 'nginx', 'sites-enabled'));
  await fs.ensureDir(path.join(ETC_DIR, 'apache2', 'sites-enabled'));
  await fs.ensureDir(path.join(ETC_DIR, 'ssl'));
  await fs.ensureDir(path.join(ETC_DIR, 'apps', 'phpmyadmin'));
  await fs.ensureDir(LOGS_DIR);
  await fs.ensureDir(DB_DIR);

  // Create default www/index.php — LStack dashboard
  const indexFile = path.join(WWW_DIR, 'index.php');
  if (!await fs.pathExists(indexFile)) {
    await fs.writeFile(indexFile, LOCALHOST_HOMEPAGE);
  }
}

// ─── Load / Save Settings ─────────────────────────────────────────────────────
async function loadSettings(): Promise<LStackSettings> {
  try {
    if (await fs.pathExists(SETTINGS_FILE)) {
      const saved = await fs.readJson(SETTINGS_FILE);
      const merged: LStackSettings = { ...defaultSettings, ...saved };
      // Migrate .devstack → .lstack paths
      if (merged.dataDir && merged.dataDir.includes('.devstack')) {
        merged.dataDir = merged.dataDir.replace('.devstack', '.lstack');
      }
      if (merged.wwwDir && merged.wwwDir.includes('.devstack')) {
        merged.wwwDir = merged.wwwDir.replace('.devstack', '.lstack');
      }
      if (merged.logsDir && merged.logsDir.includes('.devstack')) {
        merged.logsDir = merged.logsDir.replace('.devstack', '.lstack');
      }
      if (merged.binDir && merged.binDir.includes('.devstack')) {
        merged.binDir = merged.binDir.replace('.devstack', '.lstack');
      }
      return normalizeSettingsVersions(merged);
    }
  } catch {
    // ignore, use defaults
  }
  return normalizeSettingsVersions(defaultSettings);
}

async function saveSettings(s: LStackSettings) {
  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(SETTINGS_FILE, s, { spaces: 2 });
}

// ─── Create Window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../icon.png'),
    show: false,
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, '../dist/index.html')
    );
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      app.quit();
    }
  });

  return mainWindow;
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  try {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../icon.png');
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();

    tray = new Tray(icon);
    tray.setToolTip('LStack');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open LStack', click: () => mainWindow?.show() },
      { type: 'separator' },
      {
        label: 'Start All Services',
        click: () => serviceManager?.startAll(),
      },
      {
        label: 'Stop All Services',
        click: () => serviceManager?.stopAll(),
      },
      { type: 'separator' },
      { label: 'Open www folder', click: () => shell.openPath(settings.wwwDir) },
      { type: 'separator' },
      { label: 'Quit LStack', click: () => { app.quit(); } },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow?.show());
  } catch (err) {
    console.log('Failed to create tray (might be unsupported on this Linux DE):', err);
  }
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await initDataDirs();
  settings = await loadSettings();

  // Ensure dirs from saved settings also exist
  await fs.ensureDir(settings.wwwDir);
  await fs.ensureDir(settings.binDir);

  // Resource paths (templates, packages.json)
  const resourcesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(__dirname, '../../resources');

  // Init core managers
  serviceManager = new ServiceManager(settings, (log) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service:log', log);
      mainWindow.webContents.send('service:statusUpdate', serviceManager.getStatuses());
    }
  });

  await serviceManager.cleanupOrphanedProcesses();

  packageManager = new PackageManager(
    settings.binDir,
    resourcesDir,
    settings.dataDir,
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('package:progress', progress);
      }
    },
    (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('package:install:raw', data);
      }
    }
  );

  const certManager = new CertManager(path.join(ETC_DIR, 'ssl'));
  await certManager.ensureCACert();

  vhostManager = new VHostManager(settings, resourcesDir, (log) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service:log', log);
    }
  }, () => {
    // Reload webserver config when a vhost is added/removed
    const svc = settings.webserver === 'apache' ? 'apache' : 'nginx';
    serviceManager?.reloadConfig(svc).catch(() => {});
  }, certManager);

  // Init terminal manager
  terminalManager = new TerminalManager(
    (id, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', id, data);
      }
    },
    (id) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', id);
      }
    },
  );

  // Generate nginx.conf — find any installed phpMyAdmin version for dedicated phpmyadmin.test server block
  let pmaDir = path.join(WWW_DIR); // fallback: www root (no pma alias)
  for (const ver of ['6.0-snapshot', '5.2.3', '5.2.2']) {
    const candidate = packageManager.getInstallPath('phpmyadmin', ver);
    if (await fs.pathExists(candidate)) {
      pmaDir = candidate;
      break;
    }
  }
  await vhostManager.generateNginxMainConf(pmaDir).catch(() => {});

  // Restore per-project PHP-FPM processes from vhosts.json
  await vhostManager.restorePhpFpmProcesses().catch(() => {});

  // Register IPC handlers
  registerIpcHandlers({
    ipcMain,
    settings,
    saveSettings,
    serviceManager,
    packageManager,
    vhostManager,
    certManager,
    terminalManager,
    shell,
    dialog,
    mainWindow: () => mainWindow,
  });

  createWindow();
  createTray();

  // Auto start services
  if (settings.autoStartServices) {
    await serviceManager.startAll();
  }

  // Watch www/ for new project folders → auto VHost
  if (settings.autoVirtualHost) {
    vhostManager.watch();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit — keep running in tray
  }
});

app.on('before-quit', (e) => {
  if (isQuitting) return;
  e.preventDefault();
  isQuitting = true;

  (async () => {
    try {
      await serviceManager?.stopAll();
    } catch { /* ignore */ }
    vhostManager?.unwatch();
    terminalManager?.killAll();
    tray?.destroy();
    app.exit(0);
  })();
});

// ─── Localhost Homepage ───────────────────────────────────────────────────────
const LOCALHOST_HOMEPAGE = `<?php
$phpVersion = PHP_VERSION;
$extensions = get_loaded_extensions();
sort($extensions);
$important = ['mysqli', 'pdo_mysql', 'mbstring', 'gd', 'curl', 'zip', 'openssl', 'intl', 'opcache'];

// Try MariaDB / MySQL connection
$dbOk = false; $dbVersion = 'Offline';
try {
  $pdo = @new PDO('mysql:host=127.0.0.1;port=3306', 'root', '', [PDO::ATTR_TIMEOUT => 2]);
  $dbOk = true;
  $r = $pdo->query('SELECT VERSION()');
  $dbVersion = $r ? (string)$r->fetchColumn() : 'Unknown';
} catch (Exception $e) {}

// List project folders in www/
$projects = [];
foreach (scandir(__DIR__) ?: [] as $d) {
  if ($d !== '.' && $d !== '..' && is_dir(__DIR__ . '/' . $d)) $projects[] = $d;
}

// Detect domain suffix from HTTP_HOST
$host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
$domain = (substr_count($host, '.') >= 1) ? explode('.', $host, 2)[1] : 'test';
$port   = $_SERVER['SERVER_PORT'] ?? '80';
$baseUrl = 'http://localhost.test' . ($port !== '80' ? ':' . $port : '');
$pmaUrl = 'http://phpmyadmin.test' . ($port !== '80' ? ':' . $port : '');
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LStack — Local Development</title>
<style>
:root{--bg:#0f172a;--bg-soft:#111c33;--card:#1e293b;--card-soft:rgba(30,41,59,.72);--border:#334155;--border-strong:#475569;--text:#f1f5f9;--muted:#94a3b8;--blue:#60a5fa;--blue-strong:#2563eb;--green:#22c55e;--red:#ef4444;--shadow:0 20px 45px rgba(2,6,23,.45)}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:radial-gradient(circle at top,#172554 0,#0f172a 28%,#0f172a 100%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;line-height:1.5}
a{color:inherit;text-decoration:none}
body:before{content:'';position:fixed;inset:0;background:linear-gradient(180deg,rgba(96,165,250,.06),transparent 22%,transparent);pointer-events:none}
.page{position:relative;max-width:1180px;margin:0 auto;padding:32px 20px 56px}
.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:28px;padding:24px;border:1px solid rgba(71,85,105,.45);border-radius:24px;background:linear-gradient(180deg,rgba(30,41,59,.92),rgba(15,23,42,.92));box-shadow:var(--shadow);backdrop-filter:blur(10px)}
.hero-main{display:flex;align-items:flex-start;gap:16px;min-width:0}
.logo{width:56px;height:56px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;background:linear-gradient(135deg,rgba(59,130,246,.24),rgba(14,165,233,.14));border:1px solid rgba(96,165,250,.22);box-shadow:0 10px 30px rgba(37,99,235,.2)}
.hero-copy h1{font-size:30px;font-weight:800;letter-spacing:-.03em}
.hero-copy p{color:var(--muted);font-size:14px;max-width:560px;margin-top:6px}
.hero-meta{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end}
.pill{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:rgba(15,23,42,.66);border:1px solid rgba(71,85,105,.55);font-size:12px;color:var(--muted);white-space:nowrap}
.pill strong{color:var(--text);font-size:12px}
.status-dot{width:8px;height:8px;border-radius:999px;display:inline-block;flex-shrink:0}
.status-dot.online{background:var(--green);box-shadow:0 0 12px rgba(34,197,94,.8)}
.status-dot.offline{background:var(--red);box-shadow:0 0 12px rgba(239,68,68,.45)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px}
.stat{position:relative;overflow:hidden;padding:18px;border-radius:22px;background:var(--card-soft);border:1px solid rgba(71,85,105,.45);box-shadow:0 12px 30px rgba(2,6,23,.22);transition:transform .2s ease,border-color .2s ease,background .2s ease}
.stat:hover{transform:translateY(-2px);border-color:rgba(96,165,250,.38);background:rgba(30,41,59,.88)}
.stat:before{content:'';position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,rgba(96,165,250,.28),transparent)}
.stat-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.stat-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;font-weight:700}
.stat-icon{width:36px;height:36px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(59,130,246,.18),rgba(14,165,233,.1));border:1px solid rgba(96,165,250,.14);font-size:16px}
.stat-value{font-size:23px;font-weight:800;letter-spacing:-.03em}
.stat-sub{font-size:12px;color:var(--muted);margin-top:4px;word-break:break-word}
.status-line{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.section{margin-bottom:28px}
.section-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}
.section-title{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}
.section-note{font-size:12px;color:var(--muted)}
.links{display:flex;flex-wrap:wrap;gap:12px}
.link{display:inline-flex;align-items:center;gap:10px;padding:13px 16px;border-radius:18px;background:rgba(30,41,59,.74);border:1px solid rgba(71,85,105,.5);min-width:180px;transition:all .2s ease;box-shadow:0 10px 24px rgba(2,6,23,.16)}
.link:hover{transform:translateY(-2px);border-color:rgba(96,165,250,.45);background:rgba(30,41,59,.92)}
.link-icon{width:38px;height:38px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(14,165,233,.1));border:1px solid rgba(96,165,250,.14);font-size:18px;flex-shrink:0}
.link-copy strong{display:block;font-size:14px;color:var(--text)}
.link-copy span{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.projects{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.project{display:block;padding:18px;border-radius:22px;background:rgba(30,41,59,.62);border:1px solid rgba(71,85,105,.45);transition:all .2s ease;box-shadow:0 10px 26px rgba(2,6,23,.18)}
.project:hover{transform:translateY(-2px);border-color:rgba(96,165,250,.42);background:rgba(30,41,59,.86)}
.project-top{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
.project-icon{width:42px;height:42px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(14,165,233,.1));border:1px solid rgba(96,165,250,.14);color:var(--blue);font-size:18px;flex-shrink:0}
.project-name{font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.project-url{font-size:12px;color:var(--blue);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.project-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;border-top:1px solid rgba(71,85,105,.35)}
.project-foot span{font-size:12px;color:var(--muted)}
.project-foot strong{font-size:12px;color:#bfdbfe}
.empty{padding:42px 24px;border-radius:24px;background:rgba(30,41,59,.62);border:1px dashed rgba(71,85,105,.65);text-align:center;color:var(--muted)}
.empty-icon{width:64px;height:64px;border-radius:999px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:28px;background:rgba(15,23,42,.8);border:1px solid rgba(71,85,105,.5)}
.empty h3{font-size:18px;color:var(--text);margin-bottom:6px}
.empty p{font-size:14px;max-width:420px;margin:0 auto}
.exts{display:flex;flex-wrap:wrap;gap:8px}
.ext{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;background:rgba(15,23,42,.72);border:1px solid rgba(71,85,105,.45);font-size:12px;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.ext.on{color:#bfdbfe;border-color:rgba(59,130,246,.42);background:rgba(37,99,235,.16)}
.ext-mark{font-size:11px;font-weight:700}
@media (max-width: 900px){.hero{flex-direction:column}.hero-meta{justify-content:flex-start}}
@media (max-width: 640px){.page{padding:20px 14px 40px}.hero{padding:18px;border-radius:20px}.hero-copy h1{font-size:24px}.logo{width:48px;height:48px;border-radius:16px;font-size:22px}.link{width:100%}.project-foot{flex-direction:column;align-items:flex-start}}
</style>
</head>
<body>
<div class="page">
  <div class="hero">
    <div class="hero-main">
      <div class="logo">⚡</div>
      <div class="hero-copy">
        <h1>LStack</h1>
        <p>Trang tổng quan local development cho PHP, database và tất cả project đang có trong thư mục www.</p>
      </div>
    </div>
    <div class="hero-meta">
      <div class="pill"><span class="status-dot <?= $dbOk ? 'online' : 'offline' ?>"></span><strong><?= $dbOk ? 'Database online' : 'Database offline' ?></strong></div>
      <div class="pill"><strong><?= count($projects) ?></strong> project khả dụng</div>
      <div class="pill"><strong>PHP <?= htmlspecialchars($phpVersion) ?></strong></div>
    </div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-head">
        <div class="stat-label">PHP Version</div>
        <div class="stat-icon">🐘</div>
      </div>
      <div class="stat-value"><?= htmlspecialchars($phpVersion) ?></div>
      <div class="stat-sub"><?= PHP_INT_SIZE === 8 ? '64-bit' : '32-bit' ?> · NTS runtime</div>
    </div>
    <div class="stat">
      <div class="stat-head">
        <div class="stat-label">Database</div>
        <div class="stat-icon">🗄️</div>
      </div>
      <div class="status-line"><span class="status-dot <?= $dbOk ? 'online' : 'offline' ?>"></span><?= $dbOk ? 'Connected' : 'Offline' ?></div>
      <div class="stat-sub"><?= htmlspecialchars($dbVersion) ?></div>
    </div>
    <div class="stat">
      <div class="stat-head">
        <div class="stat-label">Web Server</div>
        <div class="stat-icon">🌐</div>
      </div>
      <div class="status-line"><span class="status-dot online"></span>Running</div>
      <div class="stat-sub"><?= htmlspecialchars($_SERVER['SERVER_SOFTWARE'] ?? 'nginx/php-fpm') ?></div>
    </div>
    <div class="stat">
      <div class="stat-head">
        <div class="stat-label">Projects</div>
        <div class="stat-icon">📁</div>
      </div>
      <div class="stat-value"><?= count($projects) ?></div>
      <div class="stat-sub">Detected in the www directory</div>
    </div>
  </div>

  <div class="section">
    <div class="section-bar">
      <div class="section-title">Quick Links</div>
    </div>
    <div class="links">
      <a class="link" href="<?= $pmaUrl ?>">
        <div class="link-icon">🗄️</div>
        <div class="link-copy"><strong>phpMyAdmin</strong><span>Mở công cụ quản trị database</span></div>
      </a>
      <a class="link" href="?phpinfo=1">
        <div class="link-icon">📋</div>
        <div class="link-copy"><strong>PHP Info</strong><span>Xem cấu hình runtime hiện tại</span></div>
      </a>
    </div>
  </div>

  <div class="section">
    <div class="section-bar">
      <div class="section-title">Projects</div>
      <div class="section-note"><?= count($projects) ?> mục</div>
    </div>
    <?php if (empty($projects)): ?>
    <div class="empty">
      <div class="empty-icon">📁</div>
      <h3>Chưa có project nào</h3>
      <p>Tạo project từ ứng dụng LStack hoặc thêm thư mục mới vào www để hệ thống tự nhận diện.</p>
    </div>
    <?php else: ?>
    <div class="projects">
      <?php foreach ($projects as $proj): ?>
      <a class="project" href="http://<?= htmlspecialchars($proj) ?>.<?= $domain ?>/">
        <div class="project-top">
          <div class="project-icon">📂</div>
          <div style="min-width:0;flex:1">
            <div class="project-name"><?= htmlspecialchars($proj) ?></div>
            <div class="project-url"><?= htmlspecialchars($proj) ?>.<?= $domain ?></div>
          </div>
        </div>
        <div class="project-foot">
          <span>Open project in browser</span>
          <strong>Visit →</strong>
        </div>
      </a>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>

  <div class="section">
    <div class="section-bar">
      <div class="section-title">PHP Extensions</div>
      <div class="section-note"><?= count($extensions) ?> loaded</div>
    </div>
    <div class="exts">
      <?php foreach ($important as $e): ?>
      <span class="ext <?= in_array($e, $extensions) ? 'on' : '' ?>"><span class="ext-mark"><?= in_array($e, $extensions) ? '✓' : '✗' ?></span><?= $e ?></span>
      <?php endforeach; ?>
      <?php foreach (array_diff($extensions, $important) as $e): ?>
      <span class="ext"><?= htmlspecialchars($e) ?></span>
      <?php endforeach; ?>
    </div>
  </div>
</div>
<?php if (isset($_GET['phpinfo'])): phpinfo(); endif; ?>
</body></html>
`;
