import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import net from 'net';
import type { ServiceInfo, ServiceName, ServiceStatus, LStackSettings, LogEntry } from '../../src/types';

export interface ServiceConfig {
  name: ServiceName;
  label: string;
  getBinary: (binDir: string, version: string) => string;
  getArgs: (settings: LStackSettings, etcDir: string) => string[];
  getEnv?: (settings: LStackSettings) => NodeJS.ProcessEnv;
  cwd?: (settings: LStackSettings) => string;
  port: (settings: LStackSettings) => number;
  version: (settings: LStackSettings) => string;
  stopSignal?: NodeJS.Signals;
}

const ETC_DIR = (s: LStackSettings) => path.join(s.dataDir, 'etc');

// Platform binary extension
const EXE = process.platform === 'win32' ? '.exe' : '';

// ─── Service definitions ──────────────────────────────────────────────────────
const SERVICE_CONFIGS: Record<ServiceName, ServiceConfig> = {
  nginx: {
    name: 'nginx',
    label: 'Nginx',
    getBinary: (binDir, version) => {
      if (process.platform === 'win32') return path.join(binDir, 'nginx', `nginx-${version}`, 'nginx.exe');
      return path.join(binDir, 'nginx', `nginx-${version}`, 'usr', 'sbin', 'nginx');
    },
    getArgs: (settings, etcDir) => [
      '-p', process.platform === 'win32'
        ? path.join(settings.binDir, 'nginx', `nginx-${settings.nginxVersion || '1.28.2'}`)
        : path.join(settings.binDir, 'nginx', `nginx-${settings.nginxVersion || '1.28.2'}`),
      '-c', path.join(etcDir, 'nginx', 'nginx.conf'),
      '-e', 'stderr',
      '-g', 'daemon off;',
    ],
    cwd: (settings) => {
      if (process.platform === 'win32') return path.join(settings.binDir, 'nginx', `nginx-${settings.nginxVersion || '1.28.2'}`);
      return path.join(settings.binDir, 'nginx', `nginx-${settings.nginxVersion || '1.28.2'}`, 'usr', 'sbin');
    },
    port: (s) => s.httpPort,
    version: (s) => s.nginxVersion || '1.28.0',
  },

  apache: {
    name: 'apache',
    label: 'Apache',
    getBinary: (binDir, version) => {
      if (process.platform === 'win32') return path.join(binDir, 'apache', `apache-${version}`, 'bin', 'httpd.exe');
      const base = path.join(binDir, 'apache', `apache-${version}`);
      if (fs.existsSync(path.join(base, 'bin', 'httpd'))) {
        return path.join(base, 'bin', 'httpd');
      }
      if (fs.existsSync(path.join(base, 'apache2', 'bin', 'httpd'))) {
        return path.join(base, 'apache2', 'bin', 'httpd');
      }
      return path.join(base, 'etc', 'apache2', 'bin', 'httpd');
    },
    getArgs: (settings, etcDir) => [
      '-f', path.join(etcDir, 'apache2', 'httpd.conf'),
      '-D', 'FOREGROUND',
    ],
    port: (s) => s.httpPort,
    version: (s) => s.apacheVersion || '2.4.66',
  },

  mariadb: {
    name: 'mariadb',
    label: 'MariaDB',
    getBinary: (binDir, version) =>
      path.join(binDir, 'mariadb', `mariadb-${version}`, 'bin', `mariadbd${EXE}`),
    getArgs: (settings) => [
      `--defaults-extra-file=${path.join(settings.dataDir, 'data', 'mariadb', 'my.ini')}`,
      `--datadir=${path.join(settings.dataDir, 'data', 'mariadb')}`,
      `--port=${settings.mariadbPort}`,
      `--socket=${path.join(settings.dataDir, 'tmp', 'mariadb.sock')}`,
      `--character-set-server=utf8mb4`,
      `--collation-server=utf8mb4_unicode_ci`,
    ],
    port: (s) => s.mariadbPort,
    version: (s) => s.mariadbVersion,
    stopSignal: 'SIGTERM',
  },

  'php-fpm': {
    name: 'php-fpm',
    label: 'PHP-FPM',
    getBinary: (binDir, version) => {
      if (process.platform === 'win32') {
        return path.join(binDir, 'php', `php-${version}`, `php-cgi.exe`);
      }
      return path.join(binDir, 'php', `php-${version}`, 'sbin', 'php-fpm');
    },
    getArgs: (settings, etcDir) => {
      if (process.platform === 'win32') {
        return ['-b', '127.0.0.1:9099'];
      }
      return ['-y', path.join(etcDir, 'php', 'php-fpm.conf'), '--nodaemonize'];
    },
    getEnv: () => ({
      ...process.env,
      PHP_FCGI_CHILDREN: '5',
      PHP_FCGI_MAX_REQUESTS: '1000',
    }),
    port: () => 9099,
    version: (s) => s.phpVersion,
  },

  redis: {
    name: 'redis',
    label: 'Redis',
    getBinary: (binDir, version) =>
      path.join(binDir, 'redis', `redis-${version}`, `redis-server${EXE}`),
    getArgs: () => ['--port', '6379', '--loglevel', 'notice'],
    port: () => 6379,
    version: (s) => s.redisVersion || '7.2.4',
  },

  memcached: {
    name: 'memcached',
    label: 'Memcached',
    getBinary: (binDir, version) =>
      path.join(binDir, 'memcached', `memcached-${version}`, 'bin', `memcached${EXE}`),
    getArgs: () => ['-p', '11211', '-m', '64'],
    port: () => 11211,
    version: (s) => s.memcachedVersion || '1.6.22',
  },

  mailpit: {
    name: 'mailpit',
    label: 'Mailpit',
    getBinary: (binDir, version) =>
      path.join(binDir, 'mailpit', `mailpit-${version}`, `mailpit${EXE}`),
    getArgs: () => ['--smtp', '0.0.0.0:1025', '--listen', '0.0.0.0:8025'],
    port: () => 8025,
    version: (s) => s.mailpitVersion || '1.22.3',
  },

  postgresql: {
    name: 'postgresql',
    label: 'PostgreSQL',
    getBinary: (binDir, version) =>
      path.join(binDir, 'postgresql', `postgresql-${version}`, 'bin', `postgres${EXE}`),
    getArgs: (settings) => [
      '-D', path.join(settings.dataDir, 'data', 'postgresql'),
      '-p', String(settings.postgresPort || 5432),
    ],
    port: (s) => s.postgresPort || 5432,
    version: (s) => s.postgresqlVersion || '17.4',
    stopSignal: 'SIGTERM',
  },

  mongodb: {
    name: 'mongodb',
    label: 'MongoDB',
    getBinary: (binDir, version) =>
      path.join(binDir, 'mongodb', `mongodb-${version}`, 'bin', `mongod${EXE}`),
    getArgs: (settings) => [
      '--dbpath', path.join(settings.dataDir, 'data', 'mongodb'),
      '--port', String(settings.mongodbPort || 27017),
    ],
    port: (s) => s.mongodbPort || 27017,
    version: (s) => s.mongodbVersion || '8.0.5',
    stopSignal: 'SIGTERM',
  },
};

// ─── ServiceManager ───────────────────────────────────────────────────────────
export class ServiceManager {
  private processes: Map<ServiceName, ChildProcess> = new Map();
  private statuses: Map<ServiceName, ServiceInfo> = new Map();
  private settings: LStackSettings;
  private onLog: (entry: LogEntry) => void;

  constructor(
    settings: LStackSettings,
    onLog: (entry: LogEntry) => void,
  ) {
    this.settings = settings;
    this.onLog = onLog;

    // Init statuses
    for (const [name, cfg] of Object.entries(SERVICE_CONFIGS)) {
      this.statuses.set(name as ServiceName, {
        name: name as ServiceName,
        label: cfg.label,
        version: cfg.version(settings),
        status: 'stopped',
        port: cfg.port(settings),
        enabled: [settings.webserver, 'mariadb', 'php-fpm', 'postgresql', 'redis', 'memcached', 'mailpit'].includes(name),
      });
    }
  }

  getStatuses(): ServiceInfo[] {
    return Array.from(this.statuses.values());
  }

  private log(service: string, level: LogEntry['level'], message: string) {
    this.onLog({ service: service as ServiceName, level, message, timestamp: new Date().toISOString() });
  }

  // ─── Port & Process Management ─────────────────────────────────────────────

  async getListeningPids(port: number): Promise<string[]> {
    try {
      const { execSync } = require('child_process');
      const pids = new Set<string>();

      if (process.platform === 'win32') {
        try {
          const output: string = execSync(
            `netstat -ano | findstr :${port} | findstr LISTENING`,
            { encoding: 'utf8' },
          ).trim();
          for (const line of output.split(/\r?\n/)) {
            const match = line.match(/\s+(\d+)$/);
            if (match && match[1] !== '0') pids.add(match[1]);
          }
        } catch { /* no results */ }
        return Array.from(pids);
      }

      // Linux / macOS
      const commands = [
        `lsof -tiTCP:${port} -sTCP:LISTEN`,
        `ss -ltnp '( sport = :${port} )' | tail -n +2`,
        `fuser ${port}/tcp 2>/dev/null`,
      ];
      for (const cmd of commands) {
        try {
          const output: string = execSync(cmd, { encoding: 'utf8' }).trim();
          if (!output) continue;

          if (cmd.startsWith('lsof')) {
            output.split(/\r?\n/).filter(Boolean).forEach((p: string) => pids.add(p.trim()));
          } else if (cmd.startsWith('ss')) {
            for (const line of output.split(/\r?\n/)) {
              const matches = [...line.matchAll(/pid=(\d+)/g)];
              for (const m of matches) pids.add(m[1]);
            }
          } else {
            output.split(/\s+/).filter(Boolean).forEach((p: string) => pids.add(p.trim()));
          }
        } catch { /* try next */ }
      }
      return Array.from(pids);
    } catch {
      return [];
    }
  }

  async isPortInUse(port: number): Promise<boolean> {
    const pids = await this.getListeningPids(port);
    if (pids.length > 0) return true;

    // Extra check on Linux using ss/netstat
    if (process.platform !== 'win32') {
      try {
        const { execSync } = require('child_process');
        const commands = [
          `ss -ltn '( sport = :${port} )' | tail -n +2`,
          `netstat -ltn 2>/dev/null | awk '$4 ~ /:${port}$/ { print $0 }'`,
        ];
        for (const cmd of commands) {
          try {
            if (execSync(cmd, { encoding: 'utf8' }).trim()) return true;
          } catch { /* try next */ }
        }
      } catch { /* ignore */ }
    }

    // Final check: try to bind the port
    return new Promise<boolean>((resolve) => {
      const host = process.platform === 'win32' ? '127.0.0.1' : '0.0.0.0';
      const server = net.createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') { resolve(true); return; }
        if (err.code === 'EACCES' || err.code === 'EPERM') { resolve(false); return; }
        resolve(true);
      });
      server.once('listening', () => {
        server.close(() => resolve(false));
      });
      server.listen(port, host);
    });
  }

  async killProcessOnPort(port: number): Promise<boolean> {
    try {
      const { execSync } = require('child_process');
      const pids = await this.getListeningPids(port);
      if (pids.length === 0) return false;

      let killed = false;

      if (process.platform === 'win32') {
        for (const pid of pids) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            killed = true;
            this.log('system', 'info', `Killed process ${pid} using port ${port}`);
          } catch { /* ignore */ }
        }
      } else {
        // Send SIGTERM first
        for (const pid of pids) {
          try {
            execSync(`kill -TERM ${pid}`, { stdio: 'ignore' });
            killed = true;
            this.log('system', 'info', `Sent SIGTERM to process ${pid} using port ${port}`);
          } catch { /* ignore */ }
        }
        await new Promise((r) => setTimeout(r, 700));

        // Send SIGKILL to any remaining
        const remaining = await this.getListeningPids(port);
        for (const pid of remaining) {
          try {
            execSync(`kill -KILL ${pid}`, { stdio: 'ignore' });
            killed = true;
            this.log('system', 'warn', `Sent SIGKILL to process ${pid} using port ${port}`);
          } catch { /* ignore */ }
        }
      }

      if (killed) await new Promise((r) => setTimeout(r, 700));
      return killed;
    } catch {
      return false;
    }
  }

  async setCapabilities(binary: string): Promise<void> {
    if (process.platform === 'linux') {
      try {
        const { execSync } = require('child_process');
        execSync(`sudo setcap 'cap_net_bind_service=+ep' "${binary}"`, { stdio: 'ignore' });
      } catch { /* ignore */ }
    }
  }

  async getProcessesOnPort(port: number): Promise<Array<{ pid: string; name: string; port: number }>> {
    const results: Array<{ pid: string; name: string; port: number }> = [];
    const { execSync } = require('child_process');

    try {
      if (process.platform === 'win32') {
        const lines = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' }).trim().split('\n');
        const uniquePids = new Set<string>();
        for (const line of lines) {
          const match = line.match(/\s+(\d+)$/);
          if (match) uniquePids.add(match[1]);
        }
        for (const pid of uniquePids) {
          try {
            const info = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' }).trim().match(/"([^"]+)"/);
            const name = info ? info[1] : 'Unknown';
            results.push({ pid, name, port });
          } catch {
            results.push({ pid, name: 'Unknown', port });
          }
        }
      } else {
        const lines = execSync(`lsof -i:${port} -P -n`, { encoding: 'utf8' }).trim().split('\n').slice(1);
        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const name = parts[0];
            const pid = parts[1];
            results.push({ pid, name, port });
          }
        }
      }
    } catch { /* ignore */ }

    return results;
  }

  async killProcess(pid: string): Promise<boolean> {
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
      this.log('system', 'info', `Killed process ${pid}`);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Status helpers ─────────────────────────────────────────────────────────

  private setStatus(name: ServiceName, status: ServiceStatus, pid?: number) {
    const info = this.statuses.get(name);
    if (info) {
      this.statuses.set(name, { ...info, status, pid });
    }
  }

  private setResolvedVersion(name: ServiceName, version: string) {
    const info = this.statuses.get(name);
    if (info) {
      this.statuses.set(name, { ...info, version });
    }
  }

  // ─── Start / Stop / Restart ─────────────────────────────────────────────────

  async start(name: ServiceName): Promise<void> {
    if (this.processes.has(name)) {
      this.log(name, 'warn', `${name} is already running`);
      return;
    }

    const cfg = SERVICE_CONFIGS[name];
    if (!cfg) throw new Error(`Unknown service: ${name}`);

    let resolvedVersion = cfg.version(this.settings);
    let resolvedBinary = cfg.getBinary(this.settings.binDir, resolvedVersion);
    const etcDir = ETC_DIR(this.settings);

    // Apache nested path check
    if (name === 'apache' && !await fs.pathExists(resolvedBinary)) {
      const nested = path.join(this.settings.binDir, 'apache', `apache-${resolvedVersion}`, 'Apache24', 'bin', `httpd${EXE}`);
      if (await fs.pathExists(nested)) resolvedBinary = nested;
    }

    // Fallback: scan for any installed version if configured version missing
    if (!await fs.pathExists(resolvedBinary)) {
      const fallback = await this.findInstalledBinary(name, cfg);
      if (fallback) {
        this.log(name, 'warn', `Version ${resolvedVersion} not found, using fallback: ${fallback.version}`);
        resolvedVersion = fallback.version;
        resolvedBinary = fallback.binary;
        const versionKey = name === 'mariadb' ? 'mariadbVersion'
          : name === 'nginx' ? 'nginxVersion'
          : name === 'php-fpm' ? 'phpVersion'
          : name === 'apache' ? 'apacheVersion'
          : name === 'redis' ? 'redisVersion'
          : name === 'memcached' ? 'memcachedVersion'
          : name === 'mailpit' ? 'mailpitVersion'
          : name === 'postgresql' ? 'postgresqlVersion'
          : null;
        if (versionKey) (this.settings as unknown as Record<string, unknown>)[versionKey] = fallback.version;
      } else {
        this.log(name, 'error', `Binary not found: ${resolvedBinary} — please install ${cfg.label} first`);
        this.setStatus(name, 'error');
        throw new Error(`Binary not found: ${resolvedBinary}`);
      }
    }

    this.setResolvedVersion(name, resolvedVersion);

    // Init data directories
    if (name === 'mariadb') await this.initMariaDB(resolvedVersion);
    if (name === 'postgresql') await this.initPostgreSQL(resolvedVersion);
    if (name === 'mongodb') {
      const dataDir = path.join(this.settings.dataDir, 'data', 'mongodb');
      await fs.ensureDir(dataDir);
    }

    // Ensure config files
    if (name === 'apache') await this.ensureApacheConfig(resolvedVersion);
    if (name === 'php-fpm') await this.ensurePhpFpmConfig();

    // ─── Port cleanup before start ────────────────────────────────────────
    const ports = new Set<number>([cfg.port(this.settings)]);
    if (name === 'nginx' || name === 'apache') ports.add(this.settings.httpsPort);

    for (const port of ports) {
      await this.killProcessOnPort(port);
      if (await this.isPortInUse(port)) {
        this.log(name, 'error', `Port ${port} is still in use after cleanup`);
        this.setStatus(name, 'error');
        throw new Error(`Port ${port} is already in use`);
      }
      this.log(name, 'info', `Checked port ${port} - port is available`);
    }

    // Set capabilities for webservers on Linux (bind to ports < 1024)
    if ((name === 'nginx' || name === 'apache') && process.platform === 'linux') {
      await this.setCapabilities(resolvedBinary);
      this.log(name, 'info', `Set capabilities for ${resolvedBinary}`);
    }

    this.setStatus(name, 'starting');
    this.log(name, 'info', `Starting ${cfg.label} ${resolvedVersion}...`);

    const args = cfg.getArgs(this.settings, etcDir);
    const env = { ...process.env, ...(cfg.getEnv?.(this.settings) || {}) };
    const cwd = cfg.cwd ? cfg.cwd(this.settings) : path.dirname(resolvedBinary);

    let actualCommand = resolvedBinary;
    let actualArgs = args;

    // PostgreSQL specific workaround on Windows
    if (name === 'postgresql' && process.platform === 'win32') {
      const pgData = path.join(this.settings.dataDir, 'data', 'postgresql');
      const psScript = `
$ErrorActionPreference = 'Continue'
& "${path.join(path.dirname(resolvedBinary), 'pg_ctl.exe')}" start -w -D "${pgData}" -o "-p ${args[3] || 5432}" 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$pidFile = "${pgData}\\postmaster.pid"
if (Test-Path $pidFile) {
    try {
        $pidStr = (Get-Content $pidFile)[0]
        $pgPid = [int]$pidStr
        Wait-Process -Id $pgPid -ErrorAction SilentlyContinue
    } catch {}
}
      `.trim();
      actualCommand = 'powershell';
      actualArgs = ['-NoProfile', '-Command', psScript];
    }

    const proc = spawn(actualCommand, actualArgs, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    proc.stdout?.on('data', (d: Buffer) => {
      this.log(name, 'info', d.toString().trim());
    });
    proc.stderr?.on('data', (d: Buffer) => {
      this.log(name, 'warn', d.toString().trim());
    });

    proc.on('error', (err) => {
      this.log(name, 'error', `Failed to start ${cfg.label}: ${err.message}`);
      this.setStatus(name, 'error');
      this.processes.delete(name);
    });

    proc.on('exit', (code, signal) => {
      this.log(name, code === 0 ? 'info' : 'warn',
        `${cfg.label} exited (code=${code}, signal=${signal})`);
      this.setStatus(name, 'stopped');
      this.processes.delete(name);
    });

    this.processes.set(name, proc);

    // Wait briefly and verify process is alive
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    if (this.processes.has(name) && proc.exitCode === null) {
      this.setStatus(name, 'running', proc.pid);
      this.log(name, 'info', `${cfg.label} started (PID ${proc.pid})`);
    }
  }

  getProjectHashPort(domain: string): number {
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = (hash << 5) - hash + domain.charCodeAt(i);
      hash |= 0;
    }
    return 9001 + Math.abs(hash) % 999;
  }

  private async ensurePhpFpmConfig(): Promise<void> {
    const etcDir = ETC_DIR(this.settings);
    const etcPhpDir = path.join(etcDir, 'php');
    await fs.ensureDir(etcPhpDir);

    const logsDir = path.join(this.settings.dataDir, 'logs', 'php');
    await fs.ensureDir(logsDir);

    const tmpDir = path.join(this.settings.dataDir, 'tmp');
    await fs.ensureDir(tmpDir);

    const pidFile = path.join(tmpDir, 'php-fpm.pid');
    const errorLog = path.join(logsDir, 'php-fpm-error.log');

    let conf = `[global]
pid = ${pidFile}
error_log = ${errorLog}
daemonize = no

[www]
listen = 127.0.0.1:9099
pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
clear_env = no
`;

    const confFile = path.join(etcPhpDir, 'php-fpm.conf');
    await fs.writeFile(confFile, conf.trim());
  }

  private async ensureApacheConfig(version: string): Promise<void> {
    const installDir = path.join(this.settings.binDir, 'apache', `apache-${version}`);

    let apacheRoot = installDir;
    let srcConf = path.join(apacheRoot, 'conf', 'httpd.conf');

    if (await fs.pathExists(path.join(installDir, 'Apache24', 'conf', 'httpd.conf'))) {
      apacheRoot = path.join(installDir, 'Apache24');
      srcConf = path.join(apacheRoot, 'conf', 'httpd.conf');
    } else if (await fs.pathExists(path.join(installDir, 'apache2', 'conf', 'httpd.conf'))) {
      apacheRoot = path.join(installDir, 'apache2');
      srcConf = path.join(apacheRoot, 'conf', 'httpd.conf');
    } else if (await fs.pathExists(path.join(installDir, 'etc', 'apache2', 'conf', 'httpd.conf'))) {
      apacheRoot = path.join(installDir, 'etc', 'apache2');
      srcConf = path.join(apacheRoot, 'conf', 'httpd.conf');
    }

    if (!await fs.pathExists(srcConf)) {
      throw new Error(`Apache config template not found: ${srcConf}`);
    }

    const etcApacheDir = path.join(this.settings.dataDir, 'etc', 'apache2');
    const sitesEnabledDir = path.join(etcApacheDir, 'sites-enabled');
    const dstConf = path.join(etcApacheDir, 'httpd.conf');

    await fs.ensureDir(etcApacheDir);
    await fs.ensureDir(sitesEnabledDir);
    await fs.ensureDir(path.join(this.settings.dataDir, 'logs', 'apache'));

    const installDirPosix = apacheRoot.replace(/\\/g, '/');
    const wwwDirPosix = this.settings.wwwDir.replace(/\\/g, '/');
    const sitesEnabledPosix = path.join(sitesEnabledDir, '*.conf').replace(/\\/g, '/');

    let conf = await fs.readFile(srcConf, 'utf-8');

    if (process.platform !== 'win32') {
      conf = conf.replace(/\/etc\/apache2/g, installDirPosix);
    }

    conf = conf.replace(/^Define\s+SRVROOT\s+"[^"]+"/m, `Define SRVROOT "${installDirPosix}"`);
    conf = conf.replace(/^ServerRoot\s+"[^"]+"/m, `ServerRoot "${installDirPosix}"`);
    conf = conf.replace(/^Listen\s+\d+/m, `Listen ${this.settings.httpPort}`);
    conf = conf.replace(/^#?ServerName\s+.+/m, `ServerName localhost:${this.settings.httpPort}`);
    conf = conf.replace(/^DocumentRoot\s+"[^"]+"/m, `DocumentRoot "${wwwDirPosix}"`);
    conf = conf.replace(/<Directory\s+"?(?:\${SRVROOT}|\/etc\/apache2)\/htdocs"?>/g, `<Directory "${wwwDirPosix}">`);

    // Enable necessary modules
    const modulesToEnable = [
      'rewrite_module',
      'proxy_module',
      'proxy_fcgi_module',
      'vhost_alias_module',
      'ssl_module',
      'socache_shmcb_module',
    ];
    modulesToEnable.forEach((mod) => {
      const re = new RegExp(`^#?\\s*(LoadModule\\s+${mod}\\s+.*)$`, 'm');
      conf = conf.replace(re, '$1');
    });

    // Add listen for https port
    if (!conf.includes(`Listen ${this.settings.httpsPort}`)) {
      conf = conf.replace(/^(Listen\s+\d+)$/m, `$1\nListen ${this.settings.httpsPort}`);
    }

    // Add default handler for PHP
    if (!conf.includes('proxy:fcgi')) {
      conf += `\n<FilesMatch "\\.php$">
    SetHandler "proxy:fcgi://127.0.0.1:9099/"
</FilesMatch>
ProxyFCGISetEnvIf "true" SCRIPT_FILENAME "%{DOCUMENT_ROOT}%{reqenv:SCRIPT_NAME}"
<IfModule dir_module>
    DirectoryIndex index.php index.html
</IfModule>
`;
    }

    // phpMyAdmin VirtualHost (phpmyadmin.test)
    let pmaBlock = '';
    const pmaVersions = ['6.0-snapshot', '5.2.3', '5.2.2'];
    for (const pmaVer of pmaVersions) {
      const pmaDir = path.join(this.settings.binDir, 'phpmyadmin', 'phpmyadmin-' + pmaVer);
      if (await fs.pathExists(pmaDir)) {
        const pmaDirPosix = pmaDir.replace(/\\/g, '/');
        pmaBlock = `\n<VirtualHost *:${this.settings.httpPort}>
    ServerName phpmyadmin.test
    DocumentRoot "${pmaDirPosix}"
    <Directory "${pmaDirPosix}">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    DirectoryIndex index.php index.html
</VirtualHost>`;
        break;
      }
    }
    if (pmaBlock && !conf.includes('ServerName phpmyadmin.test')) {
      conf += `\n${pmaBlock}\n`;
    }

    const includeLine = `IncludeOptional "${sitesEnabledPosix}"`;
    if (!conf.includes(includeLine)) {
      conf += `\n${includeLine}\n`;
    }

    await fs.writeFile(dstConf, conf);
  }

  async stop(name: ServiceName): Promise<void> {
    const proc = this.processes.get(name);
    this.setStatus(name, 'stopping');
    this.log(name, 'info', `Stopping ${name}...`);

    if (proc) {
      await this.stopManagedProcess(name, proc).catch((e) => {
        this.log(name, 'warn', `Graceful stop fallback: ${e.message}`);
      });
      this.processes.delete(name);
    } else {
      await this.killOrphanedWindowsProcesses([name]).catch((e) => {
        this.log(name, 'warn', `Could not clean orphaned process: ${e.message}`);
      });
    }

    // Kill remaining processes on the service's ports
    const cfg = SERVICE_CONFIGS[name];
    if (cfg) {
      const ports = new Set<number>([cfg.port(this.settings)]);
      if (name === 'nginx' || name === 'apache') ports.add(this.settings.httpsPort);
      for (const port of ports) {
        await this.killProcessOnPort(port);
        if (await this.isPortInUse(port)) {
          this.log(name, 'warn', `Port ${port} is still busy after stopping ${name}`);
        }
      }
    }

    this.setStatus(name, 'stopped');
    this.log(name, 'info', `${name} stopped`);
  }

  async restart(name: ServiceName): Promise<void> {
    await this.stop(name);
    await new Promise((r) => setTimeout(r, 500));
    await this.start(name);
  }

  async ensurePortsReleased(ports: number[]): Promise<void> {
    for (const port of ports) {
      await this.killProcessOnPort(port);
    }
  }

  async reloadConfig(name: ServiceName): Promise<void> {
    const proc = this.processes.get(name);
    if (!proc || proc.exitCode !== null) return;

    const cfg = SERVICE_CONFIGS[name];
    if (!cfg) return;

    const version = cfg.version(this.settings);
    const binary = cfg.getBinary(this.settings.binDir, version);
    const etcDir = ETC_DIR(this.settings);

    if (name === 'nginx') {
      const prefix = process.platform === 'win32'
        ? path.join(this.settings.binDir, 'nginx', `nginx-${this.settings.nginxVersion || '1.28.2'}`)
        : path.join(this.settings.binDir, 'nginx', `nginx-${this.settings.nginxVersion || '1.28.2'}`);
      const args = [
        '-p', prefix,
        '-c', path.join(etcDir, 'nginx', 'nginx.conf'),
        '-s', 'reload',
      ];
      const cwd = cfg.cwd ? cfg.cwd(this.settings) : path.dirname(binary);
      await new Promise<void>((resolve) => {
        const p = spawn(binary, args, { cwd, stdio: 'ignore' });
        p.on('exit', () => resolve());
        p.on('error', () => resolve());
      });
      this.log(name, 'info', 'nginx config reloaded');
      return;
    }

    if (name === 'apache') {
      const args = ['-k', 'graceful', '-f', path.join(etcDir, 'apache2', 'httpd.conf')];
      await new Promise<void>((resolve) => {
        const p = spawn(binary, args, { stdio: 'ignore' });
        p.on('exit', () => resolve());
        p.on('error', () => resolve());
      });
      this.log(name, 'info', 'apache config reloaded');
      return;
    }

    // Fallback for other services
    await this.restart(name);
  }

  async startAll(): Promise<void> {
    const order: ServiceName[] = [
      'mariadb', 'postgresql', 'redis', 'memcached', 'mailpit', 'php-fpm',
      this.settings.webserver as ServiceName,
    ];
    for (const name of order) {
      const info = this.statuses.get(name);
      if (info?.enabled) {
        await this.start(name).catch((e) =>
          this.log(name, 'error', e.message));
      }
    }
  }

  async stopAll(): Promise<void> {
    const names = Array.from(this.processes.keys());
    await Promise.all(names.map((n) => this.stop(n)));
    await this.killOrphanedWindowsProcesses().catch(() => {});
  }

  async cleanupOrphanedProcesses(): Promise<void> {
    await this.killOrphanedWindowsProcesses().catch(() => {});
  }

  updateSettings(settings: LStackSettings) {
    this.settings = settings;
    for (const [name, cfg] of Object.entries(SERVICE_CONFIGS)) {
      const info = this.statuses.get(name as ServiceName);
      if (info) {
        this.statuses.set(name as ServiceName, {
          ...info,
          version: cfg.version(settings),
          port: cfg.port(settings),
          enabled: [settings.webserver, 'mariadb', 'php-fpm', 'postgresql', 'redis', 'memcached', 'mailpit'].includes(name),
        });
      }
    }
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  private async findInstalledBinary(
    name: ServiceName,
    cfg: ServiceConfig,
  ): Promise<{ version: string; binary: string } | null> {
    const categoryDirMap: Partial<Record<ServiceName, string>> = {
      nginx: 'nginx',
      apache: 'apache',
      mariadb: 'mariadb',
      'php-fpm': 'php',
      redis: 'redis',
      memcached: 'memcached',
      mailpit: 'mailpit',
      postgresql: 'postgresql',
      mongodb: 'mongodb',
    };
    const categoryDir = path.join(this.settings.binDir, categoryDirMap[name] || name);
    if (!await fs.pathExists(categoryDir)) return null;

    const entries = await fs.readdir(categoryDir);
    for (const entry of entries) {
      const versionMatch = entry.match(/[\d]+\.[\d]+\.[\d]+/);
      if (!versionMatch) continue;
      const version = versionMatch[0];
      let binary = cfg.getBinary(this.settings.binDir, version);
      if (name === 'apache' && !await fs.pathExists(binary)) {
        const nested = path.join(this.settings.binDir, 'apache', `apache-${version}`, 'Apache24', 'bin', `httpd${EXE}`);
        if (await fs.pathExists(nested)) binary = nested;
      }
      if (await fs.pathExists(binary)) {
        return { version, binary };
      }
    }
    return null;
  }

  private async stopManagedProcess(name: ServiceName, proc: ChildProcess): Promise<void> {
    const cfg = SERVICE_CONFIGS[name];
    const version = cfg.version(this.settings);
    const etcDir = ETC_DIR(this.settings);
    let binary = cfg.getBinary(this.settings.binDir, version);

    if (name === 'apache' && !await fs.pathExists(binary)) {
      const nested = path.join(this.settings.binDir, 'apache', `apache-${version}`, 'Apache24', 'bin', `httpd${EXE}`);
      if (await fs.pathExists(nested)) binary = nested;
    }

    await this.tryGracefulStop(name, binary, etcDir).catch(() => {});

    if (proc.pid) {
      await this.terminateProcessTree(proc.pid);
    }
  }

  private async tryGracefulStop(name: ServiceName, binary: string, etcDir: string): Promise<void> {
    if (!await fs.pathExists(binary)) return;

    let args: string[] | null = null;
    let actualBinary = binary;

    if (name === 'nginx') {
      const prefix = process.platform === 'win32'
        ? path.join(this.settings.binDir, 'nginx', `nginx-${this.settings.nginxVersion || '1.28.2'}`)
        : path.join(this.settings.binDir, 'nginx', `nginx-${this.settings.nginxVersion || '1.28.2'}`);
      args = ['-p', prefix, '-c', path.join(etcDir, 'nginx', 'nginx.conf'), '-s', 'stop'];
    } else if (name === 'apache') {
      args = ['-k', 'shutdown', '-f', path.join(etcDir, 'apache2', 'httpd.conf')];
    } else if (name === 'postgresql' && process.platform === 'win32') {
      const pgData = path.join(this.settings.dataDir, 'data', 'postgresql');
      actualBinary = path.join(path.dirname(binary), 'pg_ctl.exe');
      args = ['stop', '-D', pgData, '-m', 'fast'];
    }

    if (!args) return;

    await new Promise<void>((resolve) => {
      const p = spawn(actualBinary, args as string[], {
        cwd: path.dirname(actualBinary),
        stdio: 'ignore',
        windowsHide: true,
      });
      p.on('exit', () => resolve());
      p.on('error', () => resolve());
    });
  }

  private async terminateProcessTree(pid: number): Promise<void> {
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const p = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        p.on('exit', () => resolve());
        p.on('error', () => resolve());
      });
      return;
    }

    // Unix: SIGTERM first, then SIGKILL after timeout
    try {
      process.kill(pid, 'SIGTERM');
    } catch { /* ignore */ }

    await new Promise((r) => setTimeout(r, 800));

    try {
      process.kill(pid, 0); // Check if still alive
      try {
        process.kill(pid, 'SIGKILL');
      } catch { /* ignore */ }
    } catch { /* already dead */ }
  }

  private async killOrphanedWindowsProcesses(names?: ServiceName[]): Promise<void> {
    if (process.platform !== 'win32') return;

    const serviceNames: ServiceName[] = names && names.length > 0
      ? names
      : ['nginx', 'apache', 'mariadb', 'php-fpm', 'redis', 'memcached', 'mailpit', 'postgresql', 'mongodb'];

    const pathMarkers: Partial<Record<ServiceName, string[]>> = {
      nginx: ['\\nginx\\'],
      apache: ['\\apache\\'],
      mariadb: ['\\mariadb\\'],
      'php-fpm': ['\\php\\'],
      redis: ['\\redis\\'],
      memcached: ['\\memcached\\'],
      mailpit: ['\\mailpit\\'],
      postgresql: ['\\postgresql\\'],
      mongodb: ['\\mongodb\\'],
    };

    const binRoot = this.settings.binDir.replace(/'/g, "''");
    const markerList = serviceNames.flatMap((name) => pathMarkers[name] || []);
    const markerExpr = markerList
      .map((marker) => `$_.ExecutablePath -like '*${marker.replace(/'/g, "''")}*'`)
      .join(' -or ');

    const script = [
      `$root='${binRoot}'`,
      "$procs = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (" + markerExpr + ") }",
      'foreach ($p in $procs) { taskkill /PID $p.ProcessId /T /F | Out-Null }',
    ].join('; ');

    await new Promise<void>((resolve) => {
      const p = spawn('powershell', ['-NoProfile', '-Command', script], {
        stdio: 'ignore',
        windowsHide: true,
      });
      p.on('exit', () => resolve());
      p.on('error', () => resolve());
    });
  }

  // ─── Database initialization ────────────────────────────────────────────────

  private async initMariaDB(version: string): Promise<void> {
    const dataDir = path.join(this.settings.dataDir, 'data', 'mariadb');
    if (await fs.pathExists(path.join(dataDir, 'mysql'))) return;

    await fs.ensureDir(dataDir);
    const installBin = path.join(
      this.settings.binDir, 'mariadb', `mariadb-${version}`, 'bin',
      `mariadb-install-db${EXE}`,
    );

    if (!await fs.pathExists(installBin)) return;

    this.log('mariadb', 'info', 'Initializing MariaDB data directory...');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(installBin, [`--datadir=${dataDir}`], { stdio: 'pipe' });
      proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`mariadb-install-db failed: ${code}`)));
      proc.stderr?.on('data', (d: Buffer) => this.log('mariadb', 'info', d.toString().trim()));
    });

    this.log('mariadb', 'info', 'MariaDB data directory initialized');
  }

  private async initPostgreSQL(version: string): Promise<void> {
    const dataDir = path.join(this.settings.dataDir, 'data', 'postgresql');
    if (await fs.pathExists(path.join(dataDir, 'PG_VERSION'))) return;

    await fs.ensureDir(dataDir);
    const initdbBin = path.join(
      this.settings.binDir, 'postgresql', `postgresql-${version}`, 'bin',
      `initdb${EXE}`,
    );

    if (!await fs.pathExists(initdbBin)) return;

    this.log('postgresql', 'info', 'Initializing PostgreSQL data directory...');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(initdbBin, [
        '-D', dataDir,
        '-U', 'postgres',
        '--locale=C',
        '--encoding=UTF8',
        '--auth-local=trust',
        '--auth-host=md5',
      ], { stdio: 'pipe' });
      proc.stdout?.on('data', (d: Buffer) => this.log('postgresql', 'info', d.toString().trim()));
      proc.stderr?.on('data', (d: Buffer) => this.log('postgresql', 'info', d.toString().trim()));
      proc.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`initdb failed: ${code}`)));
    });

    this.log('postgresql', 'info', 'PostgreSQL data directory initialized');
  }
}
