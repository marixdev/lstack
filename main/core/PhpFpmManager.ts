import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import type { LStackSettings, LogEntry, VHostPhpSettings } from '../../src/types';

export interface PhpFpmProcess {
  profileId: string;
  phpVersion: string;
  port: number;
  process: ChildProcess;
  pid: number | undefined;
}

export class PhpFpmManager {
  private settings: LStackSettings;
  private processes: Map<string, PhpFpmProcess> = new Map();
  private log: (level: LogEntry['level'], message: string) => void;

  constructor(
    settings: LStackSettings,
    onLog: (entry: LogEntry) => void,
  ) {
    this.settings = settings;
    this.log = (level, message) => {
      onLog({ service: 'lstack', level, message, timestamp: new Date().toISOString() });
    };
  }

  updateSettings(settings: LStackSettings): void {
    this.settings = settings;
  }

  getProfilePort(profileId: string): number {
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
      hash = (hash << 5) - hash + profileId.charCodeAt(i);
      hash |= 0;
    }
    return 9100 + Math.abs(hash) % 500;
  }

  private applyIniValue(content: string, key: string, value: string): string {
    const rx = new RegExp(`^;?\\s*${key}\\s*=.*$`, 'm');
    if (rx.test(content)) {
      return content.replace(rx, `${key} = ${value}`);
    }
    return content + `\n${key} = ${value}\n`;
  }

  async killProcessOnPort(port: number): Promise<void> {
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const p = spawn('powershell', [
          '-NoProfile', '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
        ], { stdio: 'ignore', windowsHide: true });
        p.on('exit', () => resolve());
        p.on('error', () => resolve());
      });
    } else {
      await new Promise<void>((resolve) => {
        const p = spawn('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
        p.on('exit', () => resolve());
        p.on('error', () => resolve());
      });
    }
  }

  async applyExtensionsToIni(iniContent: string, extensions: string[]): Promise<string> {
    let content = iniContent;
    for (const ext of extensions) {
      const rxEnabled = new RegExp(`^extension\\s*=\\s*(?:php_)?${ext}(?:\\.dll)?\\s*$`, 'm');
      const rxDisabled = new RegExp(`^;\\s*extension\\s*=\\s*(?:php_)?${ext}(?:\\.dll)?\\s*$`, 'm');
      if (!rxEnabled.test(content)) {
        if (rxDisabled.test(content)) {
          content = content.replace(rxDisabled, `extension=${ext}`);
        } else {
          content += `\nextension=${ext}\n`;
        }
      }
    }
    return content;
  }

  async getBuiltInExtensions(phpVersion: string): Promise<string[]> {
    const phpDir = path.join(this.settings.binDir, 'php', `php-${phpVersion}`);
    const extDir = process.platform === 'win32'
      ? path.join(phpDir, 'ext')
      : path.join(phpDir, 'lib', 'php', 'extensions');

    if (!await fs.pathExists(extDir)) return [];

    const files = await fs.readdir(extDir).catch(() => []);
    const exts: string[] = [];

    // On Windows, look for php_xxx.dll; on Linux, look for xxx.so
    for (const file of files) {
      if (process.platform === 'win32') {
        const match = file.match(/^php_(.+)\.dll$/);
        if (match) exts.push(match[1]);
      } else {
        const match = file.match(/^(.+)\.so$/);
        if (match) exts.push(match[1]);
      }
    }
    // Also scan nested dirs on Linux
    if (process.platform !== 'win32') {
      const subdirs = await fs.readdir(extDir).catch(() => []);
      for (const sub of subdirs) {
        const subPath = path.join(extDir, sub);
        if ((await fs.stat(subPath).catch(() => null))?.isDirectory()) {
          const subFiles = await fs.readdir(subPath).catch(() => []);
          for (const file of subFiles) {
            const match = file.match(/^(.+)\.so$/);
            if (match) exts.push(match[1]);
          }
        }
      }
    }

    return [...new Set(exts)].sort();
  }

  async startProjectPhpFpm(
    profileId: string,
    phpVersion: string,
    phpSettings: VHostPhpSettings,
    extensions: string[] = [],
  ): Promise<number> {
    // If already running for this profile, return existing port
    const existing = this.processes.get(profileId);
    if (existing && existing.process.exitCode === null && !existing.process.killed) {
      return existing.port;
    }

    const port = this.getProfilePort(profileId);

    // Kill anything still listening on the target port
    await this.killProcessOnPort(port);

    const phpDir = path.join(this.settings.binDir, 'php', `php-${phpVersion}`);
    let phpBinary: string;
    let args: string[];
    let env: NodeJS.ProcessEnv;

    if (process.platform === 'win32') {
      phpBinary = path.join(phpDir, 'php-cgi.exe');
      const etcPhpDir = path.join(this.settings.dataDir, 'etc', 'php');
      await fs.ensureDir(etcPhpDir);

      // Write a custom php.ini for this profile
      const srcIni = path.join(phpDir, 'php.ini');
      let iniContent = '';
      if (await fs.pathExists(srcIni)) {
        iniContent = await fs.readFile(srcIni, 'utf-8');
      }

      // Apply settings
      if (phpSettings.memory_limit) iniContent = this.applyIniValue(iniContent, 'memory_limit', phpSettings.memory_limit);
      if (phpSettings.max_execution_time !== undefined) iniContent = this.applyIniValue(iniContent, 'max_execution_time', String(phpSettings.max_execution_time));
      if (phpSettings.max_input_time !== undefined) iniContent = this.applyIniValue(iniContent, 'max_input_time', String(phpSettings.max_input_time));
      if (phpSettings.max_input_vars !== undefined) iniContent = this.applyIniValue(iniContent, 'max_input_vars', String(phpSettings.max_input_vars));
      if (phpSettings.upload_max_filesize) iniContent = this.applyIniValue(iniContent, 'upload_max_filesize', phpSettings.upload_max_filesize);
      if (phpSettings.post_max_size) iniContent = this.applyIniValue(iniContent, 'post_max_size', phpSettings.post_max_size);

      // Apply extensions
      if (extensions.length > 0) {
        iniContent = await this.applyExtensionsToIni(iniContent, extensions);
      }

      const profileIniPath = path.join(etcPhpDir, `php-${profileId}.ini`);
      await fs.writeFile(profileIniPath, iniContent.trim());

      args = ['-b', `127.0.0.1:${port}`, '-c', profileIniPath];
      env = {
        ...process.env,
        PHP_FCGI_CHILDREN: '5',
        PHP_FCGI_MAX_REQUESTS: '1000',
      };
    } else {
      phpBinary = path.join(phpDir, 'sbin', 'php-fpm');

      const etcPhpDir = path.join(this.settings.dataDir, 'etc', 'php');
      await fs.ensureDir(etcPhpDir);

      const logsDir = path.join(this.settings.dataDir, 'logs', 'php');
      await fs.ensureDir(logsDir);

      const tmpDir = path.join(this.settings.dataDir, 'tmp');
      await fs.ensureDir(tmpDir);

      const errorLog = path.join(logsDir, `php-fpm-${profileId}-error.log`);

      // Build php-fpm conf
      const settingsBlock = [
        phpSettings.memory_limit ? `php_admin_value[memory_limit] = ${phpSettings.memory_limit}` : '',
        phpSettings.max_execution_time !== undefined ? `php_admin_value[max_execution_time] = ${phpSettings.max_execution_time}` : '',
        phpSettings.max_input_time !== undefined ? `php_admin_value[max_input_time] = ${phpSettings.max_input_time}` : '',
        phpSettings.max_input_vars !== undefined ? `php_admin_value[max_input_vars] = ${phpSettings.max_input_vars}` : '',
        phpSettings.upload_max_filesize ? `php_admin_value[upload_max_filesize] = ${phpSettings.upload_max_filesize}` : '',
        phpSettings.post_max_size ? `php_admin_value[post_max_size] = ${phpSettings.post_max_size}` : '',
      ].filter(Boolean).join('\n');

      const conf = `
[global]
error_log = ${errorLog}
daemonize = no

[www]
listen = 127.0.0.1:${port}
pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
clear_env = no
${settingsBlock}
      `.trim();

      const confPath = path.join(etcPhpDir, `php-fpm-${profileId}.conf`);
      await fs.writeFile(confPath, conf.trim());

      args = ['-y', confPath, '--nodaemonize'];
      env = { ...process.env };
    }

    if (!await fs.pathExists(phpBinary)) {
      throw new Error(`PHP binary not found: ${phpBinary}. Please install PHP ${phpVersion} first.`);
    }

    this.log('info', `Starting PHP-FPM for project "${profileId}" (PHP ${phpVersion}) on port ${port}...`);
    this.log('info', `Command: ${phpBinary} ${args.join(' ')}`);

    const proc = spawn(phpBinary, args, {
      cwd: path.dirname(phpBinary),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true,
    });

    const errorLog = path.join(this.settings.dataDir, 'logs', 'php', `php-fpm-${profileId}-error.log`);
    this.log('info', `PHP runtime error log: ${errorLog}`);

    proc.stdout?.on('data', (d: Buffer) => {
      this.log('info', `[${profileId}] ${d.toString().trim()}`);
    });

    proc.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim();
      this.log('error', `[${profileId}] STDERR: ${msg}`);
    });

    proc.on('error', (err) => {
      this.log('error', `Failed to start PHP-FPM for ${profileId}: ${err.message}`);
      this.processes.delete(profileId);
    });

    proc.on('exit', (code, signal) => {
      const level = code === 0 ? 'info' : 'error';
      this.log(level, `PHP-FPM for ${profileId} exited (code=${code}, signal=${signal})`);
      this.processes.delete(profileId);
    });

    this.processes.set(profileId, {
      profileId,
      phpVersion,
      port,
      process: proc,
      pid: proc.pid,
    });

    // Wait for process to start
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));

    if (proc.exitCode === null && !proc.killed) {
      this.log('info', `PHP-FPM for ${profileId} started successfully (PID ${proc.pid}, port ${port})`);
    } else {
      this.log('error', `PHP-FPM process for ${profileId} exited with code ${proc.exitCode}`);
      this.processes.delete(profileId);
      throw new Error(`PHP-FPM failed to start for ${profileId} (exit code: ${proc.exitCode})`);
    }

    return port;
  }

  async stopProjectPhpFpm(profileId: string): Promise<void> {
    const existing = this.processes.get(profileId);
    const port = this.getProfilePort(profileId);

    this.log('info', `Stopping PHP-FPM for project "${profileId}"...`);

    if (existing?.process?.pid) {
      await this.terminateProcess(existing.process.pid);
    }

    await this.killProcessOnPort(port);

    // Clean up profile-specific ini on Windows
    if (process.platform === 'win32') {
      const etcPhpDir = path.join(this.settings.dataDir, 'etc', 'php');
      const profileIniPath = path.join(etcPhpDir, `php-${profileId}.ini`);
      await fs.remove(profileIniPath).catch(() => {});
    }

    this.processes.delete(profileId);
    this.log('info', `PHP-FPM for ${profileId} stopped`);
  }

  async restartProjectPhpFpm(
    profileId: string,
    phpVersion: string,
    phpSettings: VHostPhpSettings,
    extensions: string[] = [],
  ): Promise<number> {
    await this.stopProjectPhpFpm(profileId);
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    return this.startProjectPhpFpm(profileId, phpVersion, phpSettings, extensions);
  }

  async stopAll(): Promise<void> {
    const keys = Array.from(this.processes.keys());
    await Promise.all(keys.map((id) => this.stopProjectPhpFpm(id)));
  }

  getRunningProcesses(): PhpFpmProcess[] {
    return Array.from(this.processes.values());
  }

  getProcess(profileId: string): PhpFpmProcess | undefined {
    return this.processes.get(profileId);
  }

  isProjectRunning(profileId: string): boolean {
    return this.processes.has(profileId);
  }

  getProjectPort(profileId: string): number | undefined {
    return this.processes.get(profileId)?.port;
  }

  async terminateProcess(pid: number): Promise<void> {
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

    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // process already dead
    }
  }
}
