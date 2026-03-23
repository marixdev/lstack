import axios from 'axios';
import path from 'path';
import fs from 'fs-extra';
import extractZip from 'extract-zip';
import { createWriteStream } from 'fs';
import type { PackageCategory, PackageVersion, DownloadProgress, Platform } from '../../src/types';

// ─── Packages Registry ────────────────────────────────────────────────────────
// Official download URLs for all packages, all platforms
import { app } from 'electron';

export let PACKAGE_REGISTRY: PackageCategory[] = [];

export function initPackageRegistry() {
  const p = app.isPackaged ? path.join(process.resourcesPath, 'package-registry.json') : path.join(app.getAppPath(), 'package-registry.json');
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
      PACKAGE_REGISTRY = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse package-registry.json:', e);
    }
  }
}

// We cannot call initPackageRegistry() immediately if app is not ready for getAppPath, but we can do it inside PackageManager constructor or later.

export class PackageManager {
  private platform: Platform;
  private registry: PackageCategory[];

  constructor(
    private binDir: string,
    private resourcesDir: string,
    private dataDir: string,
    private onProgress: (progress: DownloadProgress) => void,
    private onInstallLog?: (data: string) => void,
  ) {
    if (PACKAGE_REGISTRY.length === 0) {
      initPackageRegistry();
    }
    this.platform = process.platform as Platform;
    this.registry = PACKAGE_REGISTRY;
  }

  getCategories(): PackageCategory[] {
    return this.registry.map((cat) => ({
      ...cat,
      versions: cat.versions.map((v) => ({
        ...v,
        isInstalled: this.isInstalled(cat.id, v.version),
        installedPath: this.getInstallPath(cat.id, v.version),
      })),
    }));
  }

  // Map binary names per category to validate real installation
  private readonly BINARY_CHECK: Partial<Record<string, string[]>> = {
    nginx:      ['nginx.exe', 'nginx', 'usr/sbin/nginx'],
    apache:     ['bin/httpd.exe', 'bin/httpd', 'Apache24/bin/httpd.exe', 'Apache24/bin/httpd', 'etc/apache2/bin/httpd', 'apache2/bin/httpd'],
    mariadb:    ['bin/mariadbd.exe', 'bin/mysqld.exe', 'bin/mariadbd'],
    php:        ['php-cgi.exe', 'php-cgi', 'php.exe', 'php', 'bin/php-cgi', 'bin/php'],
    phpmyadmin: ['index.php'],
    redis:      ['redis-server.exe', 'redis-server', 'bin/redis-server'],
    mailpit:    ['mailpit.exe', 'mailpit'],
    postgresql: ['bin/postgres.exe', 'bin/postgres'],
    mongodb:    ['bin/mongod.exe', 'bin/mongod'],
    memcached:  ['bin/memcached.exe', 'bin/memcached', 'memcached.exe', 'memcached'],
  };

  isInstalled(categoryId: string, version: string): boolean {
    const installPath = this.getInstallPath(categoryId, version);
    if (!fs.existsSync(installPath)) return false;

    // Verify at least one expected binary/file exists
    const checks = this.BINARY_CHECK[categoryId];
    if (!checks) return true;
    return checks.some((rel) => fs.existsSync(path.join(installPath, rel)));
  }

  getInstallPath(categoryId: string, version: string): string {
    return path.join(this.binDir, categoryId, `${categoryId}-${version}`);
  }

  // ─── File system scanners ─────────────────────────────────────────────────
  
  /** Return installed versions dynamically by scanning filesystem */
  async getInstalledVersions(): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    for (const cat of this.registry) {
      result[cat.id] = cat.versions
        .filter((v) => this.isInstalled(cat.id, v.version))
        .map((v) => v.version);
    }
    return result;
  }

  async install(categoryId: string, version: string): Promise<void> {
    const packageId = `${categoryId}-${version}`;
    this.onInstallLog?.(`\r\n\x1b[36m==>\x1b[0m Starting installation of ${packageId}...\r\n`);
    const category = this.registry.find((c) => c.id === categoryId);
    if (!category) throw new Error(`Unknown package: ${categoryId}`);

    const pkg = category.versions.find((v) => v.version === version);
    if (!pkg) throw new Error(`Unknown version: ${version}`);

    const url = pkg.downloads[this.platform];
    if (!url) throw new Error(`No download available for ${this.platform}`);

    const installDir = this.getInstallPath(categoryId, version);
    await fs.ensureDir(installDir);

    const tmpDir = path.join(this.binDir, '.tmp');
    await fs.ensureDir(tmpDir);
    const tmpFile = path.join(tmpDir, `${packageId}.download`);
    let selectedUrl = url;
    let selectedFileName = path.basename(url);

    try {
      // Download with source fallback for unstable mirrors
      const candidates = this.getDownloadCandidates(categoryId, version, url);
      let lastError: Error | null = null;
      let downloaded = false;

      for (const candidate of candidates) {
        try {
          this.onInstallLog?.(`\x1b[34m==>\x1b[0m Trying mirror: ${candidate}\r\n`);
          await fs.remove(tmpFile).catch(() => {});
          await this.download(categoryId, version, candidate, tmpFile);
          selectedUrl = candidate;
          selectedFileName = path.basename(candidate);
          downloaded = true;
          this.onInstallLog?.(`\x1b[32m==>\x1b[0m Download successful.\r\n`);
          break;
        } catch (error: any) {
          this.onInstallLog?.(`\x1b[31m==>\x1b[0m Error downloading from ${candidate}: ${error.message}\r\n`);
          lastError = error;
        }
      }

      if (!downloaded) {
        throw lastError || new Error('Download failed on all mirrors');
      }

      // Extract
      this.onProgress({ packageId, bytesDownloaded: 0, totalBytes: 0, percent: 100, speed: 0, status: 'extracting' });
      this.onInstallLog?.(`\r\n\x1b[33m==>\x1b[0m Extracting ${selectedFileName}...\r\n`);

      const originalNoAsar = process.noAsar;
      process.noAsar = true; // Disable asar so Electron doesn't crash extracting postgresql asar files

      try {
        if (selectedFileName.endsWith('.zip')) {
          let extractedCount = 0;
          await extractZip(tmpFile, { 
            dir: installDir,
            onEntry: (entry) => {
              extractedCount++;
              if (extractedCount % 50 === 0) {
                // To avoid spamming terminal too much, print every 50th file
                this.onInstallLog?.(`\x1b[2K\r  \x1b[90mExtracting: ${entry.fileName}\x1b[0m`);
              }
            }
          });
          this.onInstallLog?.(`\x1b[2K\r`); // clear the last logging line
        } else if (selectedFileName.endsWith('.tar.gz') || selectedFileName.endsWith('.tgz')) {
          await this.extractTarGz(tmpFile, installDir);
        } else if (selectedFileName.endsWith('.tar.xz') || selectedFileName.endsWith('.txz')) {
          await this.extractTarXz(tmpFile, installDir);
        }
      } finally {
        process.noAsar = originalNoAsar;
      }
      this.onInstallLog?.(`\x1b[32m==>\x1b[0m Extraction complete.\r\n`);

      // Flatten if needed (e.g., nginx-1.28.0/nginx.exe, phpMyAdmin-5.2.3/...)
      // Special case: Apache Lounge zip has "Apache24/" root dir
      this.onInstallLog?.(`\x1b[36m==>\x1b[0m Checking directory structure...\r\n`);
      await this.flattenNestedDir(installDir);

      // phpMyAdmin: generate config
      if (categoryId === 'phpmyadmin') {
        this.onInstallLog?.(`\x1b[36m==>\x1b[0m Generating phpMyAdmin config...\r\n`);
        await this.generatePhpMyAdminConfig(installDir);
      }

      // PHP: auto-configure php.ini with required extensions (mysqli, pdo_mysql, etc.)
      if (categoryId === 'php') {
        this.onInstallLog?.(`\x1b[36m==>\x1b[0m Configuring php.ini extensions...\r\n`);
        await this.configurePhpIni(installDir);
      }

      // Also re-run configurePhpIni on ALL installed PHP when phpMyAdmin is installed
      // (in case PHP was installed before this fix existed)
      if (categoryId === 'phpmyadmin') {
        this.onInstallLog?.(`\x1b[36m==>\x1b[0m Reconfiguring all PHP installations to enable required extensions...\r\n`);
        await this.reconfigureAllPhpInis();
      }

      this.onProgress({ packageId, bytesDownloaded: 1, totalBytes: 1, percent: 100, speed: 0, status: 'done' });
      this.onInstallLog?.(`\x1b[32m==>\x1b[0m Installation of ${packageId} finished successfully!\r\n`);
    } catch (err: any) {
      // Clean up failed install dir
      this.onInstallLog?.(`\x1b[31m==>\x1b[0m \x1b[1minstallation failed:\x1b[0m ${err.message}\r\n`);
      
      const originalNoAsar = process.noAsar;
      process.noAsar = true;
      try {
        await fs.remove(installDir).catch(() => {});
      } finally {
        process.noAsar = originalNoAsar;
      }
      
      this.onProgress({ packageId, bytesDownloaded: 0, totalBytes: 0, percent: 0, speed: 0, status: 'error', error: err.message });
      throw err;
    } finally {
      await fs.remove(tmpFile).catch(() => {});
    }
  }

  private getDownloadCandidates(categoryId: string, version: string, primaryUrl: string): string[] {
    const candidates = [primaryUrl];

    if (categoryId === 'php' && this.platform === 'win32') {
      const minor = version.split('.').slice(0, 2).join('.');

      if (minor === '8.5') {
        candidates.push('https://github.com/shivammathur/php-builder-windows/releases/download/php8.5/php-8.5.4-nts-Win32-vs17-x64.zip');
        candidates.push('https://windows.php.net/downloads/releases/php-8.5.4-nts-Win32-vs17-x64.zip');
      }

      if (minor === '8.4') {
        candidates.push('https://github.com/shivammathur/php-builder-windows/releases/download/php8.4/php-8.4.19-nts-Win32-vs17-x64.zip');
        candidates.push('https://windows.php.net/downloads/releases/php-8.4.19-nts-Win32-vs17-x64.zip');
      }

      if (minor === '8.3') {
        candidates.push('https://windows.php.net/downloads/releases/php-8.3.29-nts-Win32-vs16-x64.zip');
      }

      if (minor === '8.2') {
        candidates.push('https://windows.php.net/downloads/releases/php-8.2.30-nts-Win32-vs16-x64.zip');
      }

      if (minor === '8.1') {
        candidates.push('https://windows.php.net/downloads/releases/php-8.1.34-nts-Win32-vs16-x64.zip');
      }

      if (minor === '7.4') {
        candidates.push('https://windows.php.net/downloads/releases/archives/php-7.4.33-nts-Win32-vc15-x64.zip');
      }

      if (minor === '7.3') {
        candidates.push('https://windows.php.net/downloads/releases/archives/php-7.3.33-nts-Win32-VC15-x64.zip');
      }

      if (minor === '5.6') {
        candidates.push('https://windows.php.net/downloads/releases/archives/php-5.6.40-nts-Win32-VC11-x64.zip');
      }
    }

    return Array.from(new Set(candidates));
  }

  async uninstall(categoryId: string, version: string): Promise<void> {
    const installDir = this.getInstallPath(categoryId, version);
    const originalNoAsar = process.noAsar;
    process.noAsar = true;
    try {
      if (await fs.pathExists(installDir)) {
        await fs.remove(installDir);
      }
    } finally {
      process.noAsar = originalNoAsar;
    }
  }

  private async download(
    categoryId: string,
    version: string,
    url: string,
    dest: string,
  ): Promise<void> {
    const packageId = `${categoryId}-${version}`;

    // Ensure destination directory exists
    await fs.ensureDir(path.dirname(dest));

    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 600_000,
      maxRedirects: 10,
      headers: {
        // Some servers (windows.php.net) block requests without User-Agent
        'User-Agent': 'Mozilla/5.0 DevStack/0.1.0',
        'Accept': '*/*',
      },
    });

    const totalBytes = parseInt(response.headers['content-length'] ?? '0', 10);
    let downloaded = 0;
    let lastReport = Date.now();
    const startTime = Date.now();

    // Track download bytes via 'data' events (works in Node.js unlike onDownloadProgress)
    response.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      const now = Date.now();
      if (now - lastReport < 300) return;
      lastReport = now;
      const elapsed = (now - startTime) / 1000 || 0.001;
      const percent = totalBytes > 0 ? Math.min(99, Math.round((downloaded / totalBytes) * 100)) : 0;
      const speed = downloaded / elapsed;
      
      this.onProgress({
        packageId,
        bytesDownloaded: downloaded,
        totalBytes,
        percent,
        speed,
        status: 'downloading',
      });

      const mbDownloaded = (downloaded / 1024 / 1024).toFixed(1);
      const mbTotal = totalBytes > 0 ? (totalBytes / 1024 / 1024).toFixed(1) : '?';
      const speedMb = (speed / 1024 / 1024).toFixed(1);
      this.onInstallLog?.(`\x1b[2K\r\x1b[34m==>\x1b[0m Downloading: ${percent}% (${mbDownloaded}/${mbTotal} MB) at ${speedMb} MB/s...`);
    });

    // Use pipe() + Promise — more reliable than stream/promises.pipeline() in Electron
    await new Promise<void>((resolve, reject) => {
      const writer = createWriteStream(dest);

      response.data.on('error', (err: Error) => {
        writer.destroy(err);
        this.onInstallLog?.(`\r\n\x1b[31m==>\x1b[0m Download stream error: ${err.message}\r\n`);
        reject(new Error(`Download stream error: ${err.message}`));
      });

      writer.on('error', (err: Error) => {
        this.onInstallLog?.(`\r\n\x1b[31m==>\x1b[0m Write error: ${err.message}\r\n`);
        reject(new Error(`Write error: ${err.message}`));
      });

      writer.on('finish', () => {
        this.onInstallLog?.(`\r\n\x1b[32m==>\x1b[0m Download finished.\r\n`);
        resolve();
      });

      response.data.pipe(writer);
    });
  }

  private async extractTarGz(src: string, dest: string): Promise<void> {
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const args = ['-xzvf', src, '-C', dest, '--strip-components=1'];
      const child = spawn('tar', args);

      let extractedCount = 0;
      child.stdout.on('data', (data) => {
        extractedCount++;
        if (extractedCount % 50 === 0) {
          const lines = data.toString().split('\n');
          if (lines[0]) this.onInstallLog?.(`\x1b[2K\r  \x1b[90mExtracting: ${lines[0].trim()}\x1b[0m`);
        }
      });
      child.stderr.on('data', (data) => {
        // tar sometimes outputs to stderr
        extractedCount++;
        if (extractedCount % 50 === 0) {
          const lines = data.toString().split('\n');
          if (lines[0]) this.onInstallLog?.(`\x1b[2K\r  \x1b[90mExtracting: ${lines[0].trim()}\x1b[0m`);
        }
      });

      child.on('close', (code) => {
        this.onInstallLog?.(`\x1b[2K\r`);
        if (code === 0) resolve();
        else reject(new Error(`tar process exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }

  private async extractTarXz(src: string, dest: string): Promise<void> {
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const args = ['-xJvf', src, '-C', dest, '--strip-components=1'];
      const child = spawn('tar', args);

      let extractedCount = 0;
      child.stdout.on('data', (data) => {
        extractedCount++;
        if (extractedCount % 50 === 0) {
          const lines = data.toString().split('\n');
          if (lines[0]) this.onInstallLog?.(`\x1b[2K\r  \x1b[90mExtracting: ${lines[0].trim()}\x1b[0m`);
        }
      });
      child.stderr.on('data', (data) => {
        extractedCount++;
        if (extractedCount % 50 === 0) {
          const lines = data.toString().split('\n');
          if (lines[0]) this.onInstallLog?.(`\x1b[2K\r  \x1b[90mExtracting: ${lines[0].trim()}\x1b[0m`);
        }
      });

      child.on('close', (code) => {
        this.onInstallLog?.(`\x1b[2K\r`);
        if (code === 0) resolve();
        else reject(new Error(`tar process exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }

  private async flattenNestedDir(dir: string): Promise<void> {
    const originalNoAsar = process.noAsar;
    process.noAsar = true;
    try {
      // Apache Lounge often extracts as Apache24/ plus extra files in root.
      // If Apache24 exists, keep root files and move Apache24 contents up.
      const apache24Dir = path.join(dir, 'Apache24');
      if (await fs.pathExists(apache24Dir)) {
        const stat = await fs.stat(apache24Dir);
        if (stat.isDirectory()) {
          const entries = await fs.readdir(apache24Dir);
          for (const entry of entries) {
            const src = path.join(apache24Dir, entry);
            const dst = path.join(dir, entry);
            if (await fs.pathExists(dst)) {
              await fs.remove(dst);
            }
            await fs.move(src, dst, { overwrite: true });
          }
          await fs.remove(apache24Dir);
        }
      }

      // If extracted dir contains exactly one subdirectory, move contents up
      const entries = await fs.readdir(dir);
      if (entries.length === 1) {
        const subDir = path.join(dir, entries[0]);
        const stat = await fs.stat(subDir);
        if (stat.isDirectory()) {
          const tmp = dir + '_tmp';
          await fs.move(subDir, tmp);
          await fs.remove(dir);
          await fs.move(tmp, dir);
        }
      }
    } finally {
      process.noAsar = originalNoAsar;
    }
  }

  private async generatePhpMyAdminConfig(installDir: string): Promise<void> {
    const configFile = path.join(installDir, 'config.inc.php');
    const secret = Math.random().toString(36).substring(2, 42);
    const config = `<?php
declare(strict_types=1);

$cfg['blowfish_secret'] = '${secret}';

$i = 0;
$i++;

/* Connection type */
  $cfg['Servers'][$i]['auth_type'] = 'config';
  $cfg['Servers'][$i]['user'] = 'root';
  $cfg['Servers'][$i]['password'] = '';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['port'] = '3306';
$cfg['Servers'][$i]['connect_type'] = 'tcp';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = true;

/* Directory for uploads */
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';

/* Theme */
$cfg['ThemeDefault'] = 'pmahomme';
$cfg['NavigationDisplayLogo'] = true;
$cfg['ShowAll'] = true;
$cfg['MaxRows'] = 50;
$cfg['DefaultLang'] = 'vi';
`;
    await fs.writeFile(configFile, config);
  }

  // ─── Auto-configure php.ini ───────────────────────────────────────────────
  // Called after PHP zip is extracted. Enables all extensions needed by
  // phpMyAdmin and typical PHP web apps.
  private async configurePhpIni(phpDir: string): Promise<void> {
    const srcIni = path.join(phpDir, 'php.ini-development');
    const dstIni = path.join(phpDir, 'php.ini');

    // Don't overwrite if already configured
    if (await fs.pathExists(dstIni)) return;
    if (!await fs.pathExists(srcIni)) return;

    let ini = await fs.readFile(srcIni, 'utf-8');

    // ── 1. Set extension_dir to absolute path ─────────────────────────────
    const extDir = path.join(phpDir, 'ext').replace(/\\/g, '/');
    ini = ini.replace(
      /^;?\s*extension_dir\s*=\s*"\.\/ext"\s*$/m,
      `extension_dir = "${extDir}"`,
    );
    // Also handle the Windows-style commented line
    ini = ini.replace(
      /^;\s*extension_dir\s*=\s*"ext"\s*$/m,
      `extension_dir = "${extDir}"`,
    );

    // ── 2. Enable required extensions ────────────────────────────────────
    const REQUIRED = [
      'curl',
      'exif',
      'fileinfo',
      'gd',
      'gettext',
      'intl',
      'mbstring',
      'mysqli',
      'openssl',
      'pdo_mysql',
      'pdo_sqlite',
      'soap',
      'zip',
    ];

    for (const ext of REQUIRED) {
      // Uncomment both ;extension=ext and ;extension=php_ext.dll forms
      ini = ini.replace(
        new RegExp(`^;(extension=(?:php_)?${ext}(?:\\.dll)?)\\s*$`, 'im'),
        '$1',
      );
    }

    // ── 3. Tune performance limits ───────────────────────────────────────
    ini = ini
      .replace(/^memory_limit\s*=\s*128M\s*$/m,       'memory_limit = 512M')
      .replace(/^upload_max_filesize\s*=\s*2M\s*$/m,  'upload_max_filesize = 256M')
      .replace(/^post_max_size\s*=\s*8M\s*$/m,        'post_max_size = 256M')
      .replace(/^max_execution_time\s*=\s*30\s*$/m,   'max_execution_time = 300')
      .replace(/^max_input_time\s*=\s*60\s*$/m,       'max_input_time = 300');

    // ── 4. Enable OPcache ─────────────────────────────────────────────────
    ini = ini
      .replace(/^;zend_extension=opcache\s*$/im, 'zend_extension=opcache')
      .replace(/^;opcache\.enable=1\s*$/m,       'opcache.enable=1')
      .replace(/^;opcache\.memory_consumption=128\s*$/m, 'opcache.memory_consumption=256');

    await fs.writeFile(dstIni, ini);
  }

  // Re-configure existing PHP installs (can be called from IPC)
  async reconfigureAllPhpInis(): Promise<void> {
    const phpBaseDir = path.join(this.binDir, 'php');
    if (!await fs.pathExists(phpBaseDir)) return;

    const dirs = await fs.readdir(phpBaseDir);
    for (const dir of dirs) {
      const phpDir = path.join(phpBaseDir, dir);
      const dstIni = path.join(phpDir, 'php.ini');
      // Remove old ini so configurePhpIni regenerates it
      await fs.remove(dstIni).catch(() => {});
      await this.configurePhpIni(phpDir);
    }
  }
}


