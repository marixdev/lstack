/**
 * CertManager – SSL certificate management with mkcert
 * Manages CA installation, domain cert generation, and trust providers
 * for Windows/macOS/Linux (including Chromium NSS and Firefox NSS).
 *
 * Certs stored in: .lstack/etc/ssl/
 */

import path from 'path';
import fs from 'fs-extra';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream } from 'fs';
import axios from 'axios';

const execFileAsync = promisify(execFile);

// ── SSL Trust Provider interfaces & helpers ──────────────────────────

const CA_LABEL = 'LStack Local CA';

interface SslProviderStatus {
  id: string;
  label: string;
  supported: boolean;
  ready: boolean | null;
  state: 'ready' | 'missing';
  message: string;
  warnings?: string[];
  meta?: Record<string, unknown>;
}

interface SslProvider {
  id: string;
  label: string;
  supportsCurrentPlatform(): boolean;
  getStatus(caCertPath: string): Promise<SslProviderStatus>;
  install?(caCertPath: string, log: (msg: string) => void): Promise<void>;
}

/** Check if a binary is available on the system */
async function binExists(bin: string, args: string[] = ['--help']): Promise<boolean> {
  try {
    await execFileAsync(bin, args, { timeout: 10_000 });
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException)?.code !== 'ENOENT';
  }
}

/** Get SHA-256 fingerprint of a certificate via openssl */
async function getCertFingerprint(certPath: string): Promise<string | null> {
  if (!await fs.pathExists(certPath)) return null;
  try {
    const { stdout } = await execFileAsync('openssl', [
      'x509', '-noout', '-fingerprint', '-sha256', '-in', certPath,
    ], { timeout: 15_000 });
    return stdout.split('=')[1]?.trim().split(':').join('').toUpperCase() || null;
  } catch {
    return null;
  }
}

/** Find all Firefox NSS profile directories */
async function findFirefoxProfiles(): Promise<string[]> {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return [];

  const roots = [
    path.join(home, '.mozilla', 'firefox'),
    path.join(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'),
  ];
  const profiles: string[] = [];

  for (const root of roots) {
    if (!await fs.pathExists(root)) continue;
    const entries = await fs.readdir(root).catch(() => [] as string[]);
    for (const entry of entries) {
      if (entry.endsWith('.ini')) continue;
      const dir = path.join(root, entry);
      const stat = await fs.stat(dir).catch(() => null);
      if (!stat?.isDirectory()) continue;
      if (
        await fs.pathExists(path.join(dir, 'cert9.db')) ||
        await fs.pathExists(path.join(dir, 'key4.db')) ||
        await fs.pathExists(path.join(dir, 'pkcs11.txt'))
      ) {
        profiles.push(dir);
      }
    }
  }
  return Array.from(new Set(profiles));
}

/** Run certutil with given args */
async function runCertutil(args: string[]): Promise<void> {
  await execFileAsync('certutil', args, { timeout: 15_000 });
}

/** Auto-install NSS tools on Linux */
async function autoInstallNssTools(log: (msg: string) => void): Promise<void> {
  if (await binExists('certutil', ['-H'])) return;

  const managers = [
    { label: 'apt-get/libnss3-tools', check: 'apt-get', steps: [
      { command: 'sudo', args: ['apt-get', 'update'] },
      { command: 'sudo', args: ['apt-get', 'install', '-y', 'libnss3-tools'] },
    ]},
    { label: 'dnf/nss-tools', check: 'dnf', steps: [
      { command: 'sudo', args: ['dnf', 'install', '-y', 'nss-tools'] },
    ]},
    { label: 'yum/nss-tools', check: 'yum', steps: [
      { command: 'sudo', args: ['yum', 'install', '-y', 'nss-tools'] },
    ]},
    { label: 'pacman/nss', check: 'pacman', steps: [
      { command: 'sudo', args: ['pacman', '-Sy', '--noconfirm', 'nss'] },
    ]},
    { label: 'zypper/mozilla-nss-tools', check: 'zypper', steps: [
      { command: 'sudo', args: ['zypper', '--non-interactive', 'install', 'mozilla-nss-tools'] },
    ]},
  ];

  log('Đang tự cài dependency NSS trên Linux...');

  for (const mgr of managers) {
    if (!await binExists(mgr.check, ['--version'])) continue;
    log(`Phát hiện ${mgr.label}, đang cài certutil...`);
    let failed = false;
    for (const step of mgr.steps) {
      try {
        await execFileAsync(step.command, step.args, { timeout: 300_000 });
      } catch (err: unknown) {
        const msg = (err as { stderr?: { toString?(): string } })?.stderr?.toString?.() ||
          (err as Error)?.message || 'unknown error';
        log(`Không thể tự cài dependency Linux qua ${mgr.label}: ${msg}`);
        failed = true;
        break;
      }
    }
    if (!failed && await binExists('certutil', ['-H'])) {
      log(`Đã cài dependency NSS thành công qua ${mgr.label}.`);
      return;
    }
  }
  log('Không tìm thấy package manager được hỗ trợ hoặc cài tự động thất bại. Hãy tự cài certutil thủ công.');
}

/** Ensure NSS DB exists at a path */
async function ensureNssDb(dbDir: string): Promise<void> {
  await fs.ensureDir(dbDir);
  const certDb = path.join(dbDir, 'cert9.db');
  if (!await fs.pathExists(certDb)) {
    await runCertutil(['-N', '-d', `sql:${dbDir}`, '--empty-password']);
  }
}

/** Get Chromium NSS DB paths */
async function getChromiumNssDbPaths(): Promise<string[]> {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return [];

  const p1 = path.join(home, '.local', 'share', 'pki', 'nssdb');
  const p2 = path.join(home, '.pki', 'nssdb');
  const paths: string[] = [];

  if (await fs.pathExists(p2)) paths.push(p2);
  if (await fs.pathExists(p1)) paths.push(p1);
  if (paths.length === 0) paths.push(p1);

  return Array.from(new Set(paths));
}

// ── SSL Trust Providers ──────────────────────────────────────────────

class WindowsRootStore implements SslProvider {
  id = 'system';
  label = 'Windows Root Store';

  supportsCurrentPlatform(): boolean {
    return process.platform === 'win32';
  }

  async getStatus(caCertPath: string): Promise<SslProviderStatus> {
    if (!await fs.pathExists(caCertPath)) {
      return {
        id: this.id, label: this.label, supported: true, ready: false,
        state: 'missing', message: 'Chưa có CA để kiểm tra trong Windows Root Store.',
      };
    }

    const fp = await getCertFingerprint(caCertPath);
    if (!fp) {
      return {
        id: this.id, label: this.label, supported: true, ready: null,
        state: 'missing', message: 'Không thể đọc fingerprint của CA để kiểm tra Windows Root Store.',
      };
    }

    try {
      const psCommand = [
        `$fp = '${fp}'`,
        '$cert = Get-ChildItem Cert:/CurrentUser/Root | Where-Object { $_.Thumbprint -eq $fp } | Select-Object -First 1',
        "if ($cert) { 'FOUND' } else { 'MISSING' }",
      ].join('; ');

      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', psCommand,
      ], { timeout: 20_000 });

      const found = stdout.includes('FOUND');
      return {
        id: this.id, label: this.label, supported: true, ready: found,
        state: found ? 'ready' : 'missing',
        message: found
          ? 'Windows đã trust CA trong CurrentUser Root.'
          : 'Windows chưa trust CA trong CurrentUser Root.',
      };
    } catch {
      return {
        id: this.id, label: this.label, supported: true, ready: null,
        state: 'missing', message: 'Không thể xác minh Windows Root Store.',
      };
    }
  }
}

class MacOSKeychain implements SslProvider {
  id = 'system';
  label = 'macOS Keychain';

  supportsCurrentPlatform(): boolean {
    return process.platform === 'darwin';
  }

  async getStatus(caCertPath: string): Promise<SslProviderStatus> {
    if (!await fs.pathExists(caCertPath)) {
      return {
        id: this.id, label: this.label, supported: true, ready: false,
        state: 'missing', message: 'Chưa có CA để kiểm tra trong macOS Keychain.',
      };
    }

    const fp = await getCertFingerprint(caCertPath);
    if (!fp) {
      return {
        id: this.id, label: this.label, supported: true, ready: null,
        state: 'missing', message: 'Không thể đọc fingerprint của CA để kiểm tra macOS Keychain.',
      };
    }

    try {
      const { stdout } = await execFileAsync('security', [
        'find-certificate', '-a', '-Z', '/Library/Keychains/System.keychain',
      ], { timeout: 20_000 });

      const found = stdout.split(':').join('').toUpperCase().includes(fp);
      return {
        id: this.id, label: this.label, supported: true, ready: found,
        state: found ? 'ready' : 'missing',
        message: found
          ? 'macOS đã trust CA trong System Keychain.'
          : 'macOS chưa trust CA trong System Keychain.',
      };
    } catch {
      return {
        id: this.id, label: this.label, supported: true, ready: null,
        state: 'missing', message: 'Không thể xác minh macOS Keychain.',
      };
    }
  }
}

class LinuxSystemStore implements SslProvider {
  id = 'system';
  label = 'Linux System Store';

  supportsCurrentPlatform(): boolean {
    return process.platform === 'linux';
  }

  async getStatus(caCertPath: string): Promise<SslProviderStatus> {
    if (!await fs.pathExists(caCertPath)) {
      return {
        id: this.id, label: this.label, supported: true, ready: false,
        state: 'missing', message: 'Chưa có CA để kiểm tra trong trust store của Linux.',
      };
    }

    const bundles = [
      '/etc/ssl/certs/ca-certificates.crt',
      '/etc/pki/tls/certs/ca-bundle.crt',
      '/etc/ssl/cert.pem',
    ];

    for (const bundle of bundles) {
      if (!await fs.pathExists(bundle)) continue;
      try {
        const { stdout, stderr } = await execFileAsync('openssl', [
          'verify', '-CAfile', bundle, caCertPath,
        ], { timeout: 15_000 });
        if (`${stdout}\n${stderr}`.includes(': OK')) {
          return {
            id: this.id, label: this.label, supported: true, ready: true,
            state: 'ready', message: 'Linux đã trust CA trong system store.',
          };
        }
      } catch { /* continue */ }
    }

    return {
      id: this.id, label: this.label, supported: true, ready: false,
      state: 'missing', message: 'Linux chưa trust CA trong system store.',
      warnings: ['Hãy cài lại SSL với quyền phù hợp nếu CA đã tồn tại nhưng hệ thống vẫn chưa trust.'],
    };
  }
}

class ChromiumNSS implements SslProvider {
  id = 'chromium';
  label = 'Chromium NSS';

  supportsCurrentPlatform(): boolean {
    return process.platform === 'linux';
  }

  async getStatus(caCertPath: string): Promise<SslProviderStatus> {
    const dbPaths = await getChromiumNssDbPaths();
    const certutilReady = await binExists('certutil', ['-H']);

    if (!await fs.pathExists(caCertPath)) {
      return {
        id: this.id, label: this.label, supported: true, ready: false,
        state: 'missing', message: 'Chưa có CA để trust Chromium.',
        meta: { dbCount: dbPaths.length, certutilReady },
      };
    }

    if (!certutilReady) {
      return {
        id: this.id, label: this.label, supported: true, ready: false,
        state: 'missing', message: 'Thiếu certutil / libnss3-tools nên chưa thể trust Chromium.',
        meta: { dbCount: dbPaths.length, certutilReady: false },
      };
    }

    for (const dbPath of dbPaths) {
      try {
        if (!await fs.pathExists(path.join(dbPath, 'cert9.db'))) {
          return {
            id: this.id, label: this.label, supported: true, ready: null,
            state: 'missing',
            message: 'Chưa có Chromium NSS DB để kiểm tra, sẽ tạo khi cài trust.',
            meta: { dbCount: dbPaths.length, certutilReady: true },
          };
        }
        const { stdout } = await execFileAsync('certutil', [
          '-L', '-d', `sql:${dbPath}`,
        ], { timeout: 15_000 });

        if (!stdout.includes(CA_LABEL)) {
          return {
            id: this.id, label: this.label, supported: true, ready: false,
            state: 'missing', message: 'Chromium chưa trust CA của LStack.',
            warnings: [`NSS DB chưa trust: ${dbPath}`],
            meta: { dbCount: dbPaths.length, certutilReady: true },
          };
        }
      } catch {
        return {
          id: this.id, label: this.label, supported: true, ready: false,
          state: 'missing', message: 'Không thể đọc NSS DB của Chromium.',
          meta: { dbCount: dbPaths.length, certutilReady: true },
        };
      }
    }

    return {
      id: this.id, label: this.label, supported: true, ready: true,
      state: 'ready', message: 'Chromium đã trust CA trong NSS DB.',
      meta: { dbCount: dbPaths.length, certutilReady: true },
    };
  }

  async install(caCertPath: string, log: (msg: string) => void): Promise<void> {
    await autoInstallNssTools(log);
    if (!await binExists('certutil', ['-H'])) {
      log('Thiếu certutil/libnss3-tools, bỏ qua bước trust Chromium NSS trên Linux.');
      return;
    }

    const dbPaths = await getChromiumNssDbPaths();
    for (const dbPath of dbPaths) {
      await ensureNssDb(dbPath);
      await runCertutil(['-D', '-n', CA_LABEL, '-d', `sql:${dbPath}`]).catch(() => {});
      await runCertutil(['-A', '-n', CA_LABEL, '-t', 'C,,', '-i', caCertPath, '-d', `sql:${dbPath}`]);
      log(`Đã trust CA cho Chromium NSS DB: ${dbPath}`);
    }
  }
}

class FirefoxNSS implements SslProvider {
  id = 'firefox';
  label = 'Firefox NSS';

  supportsCurrentPlatform(): boolean {
    return process.platform === 'linux';
  }

  async getStatus(caCertPath: string): Promise<SslProviderStatus> {
    const profiles = await findFirefoxProfiles();
    const certutilReady = await binExists('certutil', ['-H']);

    if (!await fs.pathExists(caCertPath)) {
      return {
        id: this.id, label: this.label, supported: true, ready: false,
        state: 'missing', message: 'Chưa có CA để trust Firefox.',
        meta: { profiles: profiles.length, certutilReady },
      };
    }

    if (!certutilReady) {
      return {
        id: this.id, label: this.label, supported: true, ready: false,
        state: 'missing', message: 'Thiếu certutil / libnss3-tools nên chưa thể trust Firefox.',
        meta: { profiles: profiles.length, certutilReady: false },
      };
    }

    if (profiles.length === 0) {
      return {
        id: this.id, label: this.label, supported: true, ready: null,
        state: 'missing', message: 'Chưa tìm thấy Firefox profile để kiểm tra NSS.',
        meta: { profiles: 0, certutilReady: true },
      };
    }

    for (const profile of profiles) {
      try {
        const { stdout } = await execFileAsync('certutil', [
          '-L', '-d', `sql:${profile}`,
        ], { timeout: 15_000 });

        if (!stdout.includes(CA_LABEL)) {
          return {
            id: this.id, label: this.label, supported: true, ready: false,
            state: 'missing', message: 'Firefox chưa trust CA của LStack.',
            warnings: [`Profile chưa trust: ${profile}`],
            meta: { profiles: profiles.length, certutilReady: true },
          };
        }
      } catch {
        return {
          id: this.id, label: this.label, supported: true, ready: false,
          state: 'missing', message: 'Không thể đọc NSS DB của Firefox.',
          meta: { profiles: profiles.length, certutilReady: true },
        };
      }
    }

    return {
      id: this.id, label: this.label, supported: true, ready: true,
      state: 'ready', message: 'Firefox đã trust CA trong NSS DB.',
      meta: { profiles: profiles.length, certutilReady: true },
    };
  }

  async install(caCertPath: string, log: (msg: string) => void): Promise<void> {
    await autoInstallNssTools(log);
    if (!await binExists('certutil', ['-H'])) {
      log('Thiếu certutil/libnss3-tools, bỏ qua bước trust Firefox NSS trên Linux.');
      return;
    }

    const profiles = await findFirefoxProfiles();
    if (profiles.length === 0) {
      log('Không tìm thấy Firefox profile để trust NSS.');
      return;
    }

    for (const profile of profiles) {
      await runCertutil(['-D', '-n', CA_LABEL, '-d', `sql:${profile}`]).catch(() => {});
      await runCertutil(['-A', '-n', CA_LABEL, '-t', 'C,,', '-i', caCertPath, '-d', `sql:${profile}`]);
      log(`Đã trust CA cho Firefox profile: ${profile}`);
    }
  }
}

/** Get all SSL providers that support the current platform */
function getProviders(): SslProvider[] {
  return [
    new WindowsRootStore(),
    new MacOSKeychain(),
    new LinuxSystemStore(),
    new ChromiumNSS(),
    new FirefoxNSS(),
  ].filter(p => p.supportsCurrentPlatform());
}

// ── mkcert download URLs ─────────────────────────────────────────────

const MKCERT_VERSION = 'v1.4.4';

const MKCERT_URLS: Record<string, string> = {
  'win32-x64': `https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-windows-amd64.exe`,
  'darwin-arm64': `https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-darwin-arm64`,
  'darwin-x64': `https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-darwin-amd64`,
  'linux-x64': `https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-amd64`,
  'linux-arm64': `https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-arm64`,
};

// ── CertManager class ────────────────────────────────────────────────

export class CertManager {
  private sslDir: string;
  private mkcertBin: string;
  private certFile: string;
  private keyFile: string;

  constructor(sslDir: string) {
    this.sslDir = sslDir;
    this.mkcertBin = path.join(sslDir, process.platform === 'win32' ? 'mkcert.exe' : 'mkcert');
    this.certFile = path.join(sslDir, 'lstack.crt');
    this.keyFile = path.join(sslDir, 'lstack.key');
  }

  /** Auto-generate default cert if mkcert is ready but cert is missing */
  async ensureCACert(): Promise<void> {
    await fs.ensureDir(this.sslDir);
    if (await fs.pathExists(this.mkcertBin) && !await fs.pathExists(this.certFile)) {
      await this.generateCert().catch(() => {});
    }
  }

  /** Get full SSL status including all trust providers */
  async getStatus(): Promise<{
    mkcertReady: boolean;
    caExists: boolean;
    warnings: string[];
    providers: SslProviderStatus[];
  }> {
    const mkcertReady = await fs.pathExists(this.mkcertBin);
    const caExists = await fs.pathExists(this.getCACertPath());
    const providers = await Promise.all(
      getProviders().map(p => p.getStatus(this.getCACertPath())),
    );
    const warnings = providers.flatMap(p => p.warnings || []);
    return { mkcertReady, caExists, warnings, providers };
  }

  /** Install CA certificate into system trust stores */
  async installCA(log: (msg: string) => void): Promise<void> {
    await fs.ensureDir(this.sslDir);

    // Download mkcert if not present
    if (!await fs.pathExists(this.mkcertBin)) {
      const url = this.getMkcertUrl();
      if (!url) throw new Error('Không có mkcert binary cho platform/arch này.');
      log('Đang tải mkcert...');
      await this.downloadFile(url, this.mkcertBin, log);
      if (process.platform !== 'win32') {
        await fs.chmod(this.mkcertBin, 0o755);
      }
      log('Tải mkcert thành công.');
    }

    // Install CA
    log('Đang cài CA Certificate vào hệ thống...');
    if (process.platform === 'win32') {
      log('(Windows: vui lòng chấp nhận UAC dialog nếu xuất hiện)');
    } else if (process.platform === 'darwin') {
      log('(macOS: hệ thống có thể yêu cầu xác thực để thêm CA vào keychain)');
    } else if (process.platform === 'linux') {
      log('(Linux: system trust và Firefox NSS sẽ được xử lý riêng)');
    }

    await this.runMkcert(['-install'], log);
    await this.generateCert().catch(() => {});

    // Sync trust to all available providers
    for (const provider of getProviders()) {
      if (provider.install) {
        log(`Đang đồng bộ trust cho ${provider.label}...`);
        await provider.install(this.getCACertPath(), log);
      }
    }

    log('CA Certificate đã được cài đặt, sẵn sàng cấp Local SSL!');
  }

  /** Remove domain-specific cert files */
  async removeDomainCert(hostname: string): Promise<void> {
    const certFile = path.join(this.sslDir, `${hostname}.crt`);
    const keyFile = path.join(this.sslDir, `${hostname}.key`);
    await fs.remove(certFile).catch(() => {});
    await fs.remove(keyFile).catch(() => {});
  }

  /** Generate cert for a specific domain (+ wildcard) */
  async generateDomainCert(hostname: string): Promise<{ certFile: string; keyFile: string }> {
    const certFile = path.join(this.sslDir, `${hostname}.crt`);
    const keyFile = path.join(this.sslDir, `${hostname}.key`);

    if (await fs.pathExists(this.mkcertBin)) {
      if (!await fs.pathExists(certFile)) {
        await this.runMkcert(['-key-file', keyFile, '-cert-file', certFile, hostname, `*.${hostname}`]);
      }
      return { certFile, keyFile };
    }
    return { certFile, keyFile };
  }

  /** Generate default cert for localhost, 127.0.0.1, ::1 */
  async generateCert(): Promise<void> {
    if (!await fs.pathExists(this.mkcertBin)) return;
    if (await fs.pathExists(this.certFile) && await fs.pathExists(this.keyFile)) return;
    await this.runMkcert([
      '-key-file', this.keyFile,
      '-cert-file', this.certFile,
      'localhost', '127.0.0.1', '::1',
    ]);
  }

  /** Spawn mkcert process with CAROOT set to sslDir */
  private runMkcert(args: string[], log?: (msg: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.mkcertBin, args, {
        env: { ...process.env, CAROOT: this.sslDir },
        shell: false,
      });
      proc.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line && log) log(line);
      });
      proc.stderr?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line && log) log(line);
      });
      proc.on('error', reject);
      proc.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`mkcert exited with code ${code}`)),
      );
    });
  }

  /** Get mkcert download URL for current platform/arch */
  private getMkcertUrl(): string | undefined {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return MKCERT_URLS[`${process.platform}-${arch}`];
  }

  /** Download a file with progress logging */
  private async downloadFile(
    url: string,
    dest: string,
    log: (msg: string) => void,
  ): Promise<void> {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 120_000,
      maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 LStack/0.1.0',
        Accept: '*/*',
      },
    });

    const totalBytes = parseInt(response.headers['content-length'] ?? '0', 10);
    let downloaded = 0;
    let lastLog = Date.now();

    response.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (Date.now() - lastLog < 1000) return;
      lastLog = Date.now();
      const kb = (downloaded / 1024).toFixed(0);
      const pct = totalBytes > 0 ? ` (${Math.round((downloaded / totalBytes) * 100)}%)` : '';
      log(`Đang tải mkcert... ${kb} KB${pct}`);
    });

    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(dest);
      response.data.on('error', (err: Error) => { ws.destroy(err); reject(err); });
      ws.on('error', reject);
      ws.on('finish', resolve);
      response.data.pipe(ws);
    });
  }

  getCertPath(): string {
    return this.certFile;
  }

  getKeyPath(): string {
    return this.keyFile;
  }

  getCACertPath(): string {
    return path.join(this.sslDir, 'rootCA.pem');
  }
}
