import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import fs from 'fs-extra';
import type { LStackSettings, VHost, LogEntry, PhpProfile, PhpRuntimeStatus, VHostPhpSettings } from '../../src/types';
import type { CertManager } from './CertManager';
import { PhpFpmManager } from './PhpFpmManager';
import { PhpProfileManager } from './PhpProfileManager';

// ─── Nginx Config Templates ──────────────────────────────────────────────────
const NGINX_SERVER_HTTP_TPL = `server {
    listen <<HTTP_PORT>>;
    server_name <<HOSTNAME>> *.<<HOSTNAME>>;
    root "<<PROJECT_DIR>>";
    index index.php index.html index.htm;

    location ~ /.well-known {
        auth_basic off;
        allow all;
    }

    location / {
        try_files $uri $uri/ /index.php$is_args$args;
        autoindex on;
    }

    location ~ \\.php$ {
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_pass 127.0.0.1:<<PHP_PORT>>;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        try_files $uri =404;
        fastcgi_read_timeout 3600;
        fastcgi_send_timeout 3600;
        <<PHP_VALUES>>
    }

    location ~* ^.+\\.(css|js|jpg|jpeg|gif|png|ico|gz|svg|svgz|ttf|otf|woff|woff2|eot|mp4|ogg|ogv|webm|webp|zip|swf|map|mjs)$ {
        add_header Access-Control-Allow-Origin "*";
        expires max;
        access_log off;
    }

    location ~ /\\.(ht|svn|git) {
        deny all;
    }
}
`;

const NGINX_SERVER_SSL_TPL = `server {
    listen <<HTTP_PORT>>;
    server_name <<HOSTNAME>> *.<<HOSTNAME>>;
    return 301 https://$host$request_uri;
}

server {
    listen <<HTTPS_PORT>> ssl;
    http2 on;
    server_name <<HOSTNAME>> *.<<HOSTNAME>>;
    root "<<PROJECT_DIR>>";
    index index.php index.html index.htm;

    ssl_certificate     "<<SSL_CERT>>";
    ssl_certificate_key "<<SSL_KEY>>";

    location ~ /.well-known {
        auth_basic off;
        allow all;
    }

    location / {
        try_files $uri $uri/ /index.php$is_args$args;
        autoindex on;
    }

    location ~ \\.php$ {
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_pass 127.0.0.1:<<PHP_PORT>>;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        try_files $uri =404;
        fastcgi_read_timeout 3600;
        fastcgi_send_timeout 3600;
        <<PHP_VALUES>>
    }

    location ~* ^.+\\.(css|js|jpg|jpeg|gif|png|ico|gz|svg|svgz|ttf|otf|woff|woff2|eot|mp4|ogg|ogv|webm|webp|zip|swf|map|mjs)$ {
        add_header Access-Control-Allow-Origin "*";
        expires max;
        access_log off;
    }

    location ~ /\\.(ht|svn|git) {
        deny all;
    }
}
`;

const NGINX_MAIN_TPL = `worker_processes  auto;
error_log  "<<LOGS_DIR>>/nginx/error.log" warn;
pid        "<<DATA_DIR>>/tmp/nginx.pid";

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent"';
    access_log  "<<LOGS_DIR>>/nginx/access.log"  main;
    sendfile        on;
    keepalive_timeout  65;
    client_max_body_size 100m;
    gzip  on;

    # PHP upstream (minimal profile - used by default server + phpMyAdmin)
    upstream php_upstream {
        server 127.0.0.1:<<PHP_PORT>>;
    }

    # Default server - localhost.test (also catches bare localhost)
    server {
        listen <<HTTP_PORT>> default_server;
        server_name localhost.test localhost;
        root "<<WWW_DIR>>";
        index index.php index.html;

        location / {
            try_files $uri $uri/ /index.php$is_args$args;
            autoindex on;
        }

        location ~ \\.php$ {
            include fastcgi_params;
            fastcgi_pass php_upstream;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        <<PHP_VALUES>>
        }
    }

    # phpMyAdmin server - phpmyadmin.test
    server {
        listen <<HTTP_PORT>>;
        server_name phpmyadmin.test;
        root "<<PMA_DIR>>";
        index index.php index.html;

        location / {
            try_files $uri $uri/ /index.php$is_args$args;
        }

        location ~ \\.php$ {
            include fastcgi_params;
            fastcgi_pass php_upstream;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        }
    }

    # Include auto-generated virtual hosts
    include "<<ETC_DIR>>/nginx/sites-enabled/*.conf";
}
`;

// ─── Apache Config Templates ────────────────────────────────────────────────
const APACHE_VHOST_TPL = `<VirtualHost *:<<HTTP_PORT>>>
    DocumentRoot "<<PROJECT_DIR>>"
    ServerName <<HOSTNAME>>
    ServerAlias *.<<HOSTNAME>>

    <DirectoryMatch "/\\.(git|svn|ht)">
        Require all denied
    </DirectoryMatch>

    <FilesMatch "\\.php$">
        SetHandler "proxy:fcgi://127.0.0.1:<<PHP_PORT>>/"
    </FilesMatch>

    ProxyFCGISetEnvIf "true" SCRIPT_FILENAME "%{DOCUMENT_ROOT}%{reqenv:SCRIPT_NAME}"
    ProxyTimeout 3600

    <Directory "<<PROJECT_DIR>>">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    DirectoryIndex index.php index.html

    ErrorLog "<<LOGS_DIR>>/apache/<<NAME>>-error.log"
    CustomLog "<<LOGS_DIR>>/apache/<<NAME>>-access.log" combined
</VirtualHost>
`;

const APACHE_VHOST_SSL_TPL = `<VirtualHost *:<<HTTP_PORT>>>
    DocumentRoot "<<PROJECT_DIR>>"
    ServerName <<HOSTNAME>>
    ServerAlias *.<<HOSTNAME>>
    Redirect permanent / https://<<HOSTNAME>>/
</VirtualHost>

<VirtualHost *:<<HTTPS_PORT>>>
    DocumentRoot "<<PROJECT_DIR>>"
    ServerName <<HOSTNAME>>
    ServerAlias *.<<HOSTNAME>>

    SSLEngine on
    SSLCertificateFile "<<SSL_CERT>>"
    SSLCertificateKeyFile "<<SSL_KEY>>"
    SSLProtocol all -SSLv2 -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite HIGH:!aNULL:!MD5

    <DirectoryMatch "/\\.(git|svn|ht)">
        Require all denied
    </DirectoryMatch>

    <FilesMatch "\\.php$">
        SetHandler "proxy:fcgi://127.0.0.1:<<PHP_PORT>>/"
    </FilesMatch>

    ProxyFCGISetEnvIf "true" SCRIPT_FILENAME "%{DOCUMENT_ROOT}%{reqenv:SCRIPT_NAME}"
    ProxyTimeout 3600

    <Directory "<<PROJECT_DIR>>">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    DirectoryIndex index.php index.html

    ErrorLog "<<LOGS_DIR>>/apache/<<NAME>>-ssl-error.log"
    CustomLog "<<LOGS_DIR>>/apache/<<NAME>>-ssl-access.log" combined
</VirtualHost>
`;

// ─── VHostManager ─────────────────────────────────────────────────────────────
export class VHostManager {
  private settings: LStackSettings;
  private resourcesDir: string;
  private onLog: (entry: LogEntry) => void;
  private onReloadWebserver?: () => void;
  private watcher?: FSWatcher;
  private onVHostChange?: (vhosts: VHost[]) => void;
  private certManager?: CertManager;
  public phpFpmManager: PhpFpmManager;
  public phpProfileManager: PhpProfileManager;

  constructor(
    settings: LStackSettings,
    resourcesDir: string,
    onLog: (entry: LogEntry) => void,
    onReloadWebserver?: () => void,
    certManager?: CertManager,
  ) {
    this.settings = settings;
    this.resourcesDir = resourcesDir;
    this.onLog = onLog;
    this.onReloadWebserver = onReloadWebserver;
    this.certManager = certManager;
    this.phpFpmManager = new PhpFpmManager(settings, onLog);
    this.phpProfileManager = new PhpProfileManager(settings);
  }

  setOnVHostChange(cb: (vhosts: VHost[]) => void): void {
    this.onVHostChange = cb;
  }

  // ── PHP Profile methods (delegated) ───────────────────────────────────────
  getProjectHashPort(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash |= 0;
    }
    return 9001 + Math.abs(hash) % 999;
  }

  async listPhpProfiles(): Promise<PhpProfile[]> {
    return this.phpProfileManager.list();
  }

  async getPhpProfile(id: string): Promise<PhpProfile | null> {
    return this.phpProfileManager.get(id);
  }

  async getBuiltInPhpExtensions(phpVersion: string): Promise<string[]> {
    return this.phpFpmManager.getBuiltInExtensions(phpVersion);
  }

  async listPhpRuntimeStatuses(): Promise<PhpRuntimeStatus[]> {
    const profiles = await this.phpProfileManager.list();
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    const vhostsData: any[] = await fs.readJson(vhostsFile).catch(() => []);

    const profileUsage = new Map<string, number>();
    for (const v of vhostsData) {
      const pid = v.phpProfileId;
      if (pid) profileUsage.set(pid, (profileUsage.get(pid) || 0) + 1);
    }

    return Promise.all(profiles.map(async (p) => {
      const proc = this.phpFpmManager.getProcess(p.id);
      return {
        profileId: p.id,
        profileName: p.name,
        phpVersion: p.phpVersion,
        port: proc?.port || await this.phpProfileManager.getPortForProfile(p.id),
        running: !!proc,
        pid: proc?.pid,
        projectCount: profileUsage.get(p.id) || 0,
        isBuiltIn: p.isBuiltIn,
      };
    }));
  }

  async createPhpProfile(data: Omit<PhpProfile, 'id'>): Promise<PhpProfile> {
    return this.phpProfileManager.create(data);
  }

  async updatePhpProfileDefinition(id: string, patch: Partial<PhpProfile>): Promise<PhpProfile> {
    const updated = await this.phpProfileManager.update(id, patch);
    await this.restartVhostsUsingProfile(id);
    return updated;
  }

  async deletePhpProfileDefinition(id: string): Promise<void> {
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    const vhosts: any[] = await fs.readJson(vhostsFile).catch(() => []);
    const remaining: any[] = [];
    let changed = false;

    for (const v of vhosts) {
      if (v.phpProfileId !== id) {
        remaining.push(v);
        continue;
      }
      const projDir = v.projectDir;
      if (projDir && await fs.pathExists(projDir)) {
        remaining.push(v);
        continue;
      }
      changed = true;
    }

    if (changed) {
      await fs.writeJson(vhostsFile, remaining, { spaces: 2 });
    }

    if (remaining.some((v) => v.phpProfileId === id)) {
      throw new Error('Cannot delete profile being used by projects');
    }

    return this.phpProfileManager.delete(id);
  }

  async resolveProfile(vhost: any, projectDir?: string): Promise<PhpProfile> {
    const profileId = vhost.phpProfileId ||
      (projectDir ? await this.phpProfileManager.detectRecommendedProfile(projectDir) : 'minimal');

    const profile = await this.phpProfileManager.get(profileId);
    if (profile) return profile;

    const fallback = await this.phpProfileManager.get('minimal');
    if (!fallback) throw new Error('Minimal PHP profile is missing');
    return fallback;
  }

  async restartProfileRuntime(
    profileId: string,
    phpVersion: string,
    phpSettings: VHostPhpSettings,
    extensions: string[] = [],
  ): Promise<number> {
    return this.phpFpmManager.restartProjectPhpFpm(profileId, phpVersion, phpSettings, extensions);
  }

  async restartVhostsUsingProfile(profileId: string): Promise<void> {
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    if (!await fs.pathExists(vhostsFile)) return;

    const vhosts: any[] = await fs.readJson(vhostsFile).catch(() => []);
    const affected = vhosts.filter((v) => v.phpProfileId === profileId);
    if (affected.length === 0) return;

    const profile = await this.phpProfileManager.get(profileId);
    if (!profile) throw new Error(`PHP profile not found: ${profileId}`);

    let newPort: number | null = null;

    for (const v of affected) {
      const phpVer = v.phpVersion || profile.phpVersion || this.settings.phpVersion;
      newPort = await this.restartProfileRuntime(
        profileId,
        phpVer,
        { ...profile.phpSettings },
        profile.phpExtensions,
      );
      v.cgiPort = newPort;
      await this.add(v.name, v.projectDir || path.join(this.settings.wwwDir, v.name));
    }

    if (newPort !== null) {
      for (const v of vhosts) {
        if (v.phpProfileId === profileId) v.cgiPort = newPort;
      }
      await fs.writeJson(vhostsFile, vhosts, { spaces: 2 });
    }

    this.onReloadWebserver?.();
    if (this.onVHostChange) {
      this.onVHostChange(await this.list());
    }
  }

  async updatePhpSettings(name: string, phpSettings: VHostPhpSettings): Promise<any> {
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    let vhosts: any[] = [];
    if (await fs.pathExists(vhostsFile)) vhosts = await fs.readJson(vhostsFile);

    const currentVhost = (await this.list()).find((v) => v.name === name);
    let idx = vhosts.findIndex((v: any) => v.name === name);

    if (idx === -1) {
      vhosts.push({
        ...currentVhost || {},
        name,
        hostname: currentVhost?.hostname || `${name}.${this.settings.domain}`,
        projectDir: currentVhost?.projectDir || path.join(this.settings.wwwDir, name),
        phpSettings,
        cgiPort: currentVhost?.cgiPort || 9099,
      });
      idx = vhosts.length - 1;
    } else {
      vhosts[idx].phpSettings = phpSettings;
      vhosts[idx].cgiPort = vhosts[idx].cgiPort || 9099;
      vhosts[idx].hostname = vhosts[idx].hostname || `${name}.${this.settings.domain}`;
      vhosts[idx].projectDir = vhosts[idx].projectDir || path.join(this.settings.wwwDir, name);
    }

    await fs.writeJson(vhostsFile, vhosts, { spaces: 2 });

    const profile = await this.resolveProfile(vhosts[idx], vhosts[idx].projectDir);
    const phpVer = vhosts[idx].phpVersion || profile.phpVersion || this.settings.phpVersion;

    try {
      const port = await this.restartProfileRuntime(
        vhosts[idx].phpProfileId || profile.id,
        phpVer,
        { ...profile.phpSettings, ...phpSettings },
        profile.phpExtensions,
      );
      vhosts[idx].cgiPort = port;
      await fs.writeJson(vhostsFile, vhosts, { spaces: 2 });
    } catch (err: any) {
      this.log('warn', `Failed to restart PHP runtime for ${name}: ${err.message}`);
    }

    await this.add(vhosts[idx].name, vhosts[idx].projectDir || path.join(this.settings.wwwDir, name));
    if (this.onReloadWebserver) this.onReloadWebserver();
    return vhosts[idx];
  }

  async updatePhpVersion(name: string, phpVersion: string): Promise<any> {
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    let vhosts: any[] = [];
    if (await fs.pathExists(vhostsFile)) vhosts = await fs.readJson(vhostsFile);

    const currentVhost = (await this.list()).find((v) => v.name === name);
    if (!currentVhost) throw new Error('VHost not found: ' + name);

    let idx = vhosts.findIndex((v: any) => v.name === name);
    if (idx === -1) {
      vhosts.push({ ...currentVhost, phpVersion, cgiPort: currentVhost.cgiPort || 9099 });
      idx = vhosts.length - 1;
    } else {
      vhosts[idx].phpVersion = phpVersion;
    }

    await fs.writeJson(vhostsFile, vhosts, { spaces: 2 });

    const profile = await this.resolveProfile(vhosts[idx], vhosts[idx].projectDir);

    try {
      const port = await this.restartProfileRuntime(
        vhosts[idx].phpProfileId || profile.id,
        phpVersion,
        { ...profile.phpSettings },
        profile.phpExtensions,
      );
      vhosts[idx].cgiPort = port;
      await fs.writeJson(vhostsFile, vhosts, { spaces: 2 });
    } catch (err: any) {
      this.log('warn', `Failed to restart PHP runtime for ${name}: ${err.message}`);
    }

    await this.add(vhosts[idx].name, vhosts[idx].projectDir || path.join(this.settings.wwwDir, name));
    if (this.onReloadWebserver) this.onReloadWebserver();
    return vhosts[idx];
  }

  async updatePhpProfile(name: string, profileId: string): Promise<any> {
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    let vhosts: any[] = [];
    if (await fs.pathExists(vhostsFile)) vhosts = await fs.readJson(vhostsFile);

    const currentVhost = (await this.list()).find((v) => v.name === name);
    const profile = await this.phpProfileManager.get(profileId);
    if (!profile) throw new Error(`PHP profile not found: ${profileId}`);

    let idx = vhosts.findIndex((v: any) => v.name === name);
    if (idx === -1) {
      vhosts.push({
        ...currentVhost || {},
        name,
        hostname: currentVhost?.hostname || `${name}.${this.settings.domain}`,
        projectDir: currentVhost?.projectDir || path.join(this.settings.wwwDir, name),
        phpProfileId: profileId,
        phpVersion: profile.phpVersion,
        cgiPort: currentVhost?.cgiPort || 9099,
      });
      idx = vhosts.length - 1;
    } else {
      vhosts[idx].phpProfileId = profileId;
      vhosts[idx].phpVersion = profile.phpVersion;
      delete vhosts[idx].phpSettings;
      vhosts[idx].hostname = vhosts[idx].hostname || `${name}.${this.settings.domain}`;
      vhosts[idx].projectDir = vhosts[idx].projectDir || path.join(this.settings.wwwDir, name);
    }

    try {
      const port = await this.restartProfileRuntime(
        profileId,
        profile.phpVersion,
        { ...profile.phpSettings },
        profile.phpExtensions,
      );
      vhosts[idx].cgiPort = port;
    } catch (err: any) {
      this.log('warn', `Failed to restart PHP runtime for profile ${profileId}: ${err.message}`);
      vhosts[idx].cgiPort = await this.phpProfileManager.getPortForProfile(profileId);
    }

    await fs.writeJson(vhostsFile, vhosts, { spaces: 2 });
    await this.add(vhosts[idx].name, vhosts[idx].projectDir || path.join(this.settings.wwwDir, name));
    if (this.onReloadWebserver) this.onReloadWebserver();
    return vhosts[idx];
  }

  async updatePhpExtensions(name: string, extensions: Record<string, boolean>): Promise<any> {
    const enabledExts = Object.entries(extensions).filter(([, v]) => !!v).map(([k]) => k);
    const newProfile = await this.createPhpProfile({
      name: `${name}-migrated`,
      description: `Migrated legacy extension set for ${name}`,
      isBuiltIn: false,
      phpVersion: this.settings.phpVersion,
      phpSettings: {
        memory_limit: '512M',
        max_execution_time: 300,
        max_input_time: 300,
        max_input_vars: 10000,
        upload_max_filesize: '256M',
        post_max_size: '256M',
      },
      phpExtensions: enabledExts,
    });
    return this.updatePhpProfile(name, newProfile.id);
  }

  // ── File watcher ──────────────────────────────────────────────────────────
  watch(): void {
    const { wwwDir } = this.settings;
    this.watcher = chokidar.watch(wwwDir, {
      depth: 0,
      ignoreInitial: false,
      persistent: true,
    });

    this.watcher.on('addDir', async (dirPath) => {
      if (dirPath === wwwDir) return;
      const name = path.basename(dirPath);
      if (name.startsWith('.')) return;

      this.log('info', `New folder detected: ${name} → creating virtual host`);

      await this.add(name, dirPath).catch((e) => {
        this.log('error', `Failed to create VHost for ${name}: ${e.message}`);
      });
    });

    this.watcher.on('unlinkDir', async (dirPath) => {
      if (dirPath === wwwDir) return;
      const name = path.basename(dirPath);
      await this.remove(name).catch(() => {});
    });
  }

  unwatch(): void {
    this.watcher?.close();
  }

  updateSettings(settings: LStackSettings): void {
    this.settings = settings;
    this.phpFpmManager.updateSettings(settings);
    this.phpProfileManager.updateSettings(settings);
  }

  async regenerateAll(oldDomain?: string): Promise<void> {
    const { wwwDir } = this.settings;
    if (!await fs.pathExists(wwwDir)) return;
    const files = await fs.readdir(wwwDir);
    for (const file of files) {
      if (file.startsWith('.')) continue;
      const p = path.join(wwwDir, file);
      if ((await fs.stat(p)).isDirectory()) {
        if (oldDomain && oldDomain !== this.settings.domain) {
          const oldHostname = `${file}.${oldDomain}`;
          await this.removeHostsEntry(oldHostname);
          if (this.certManager) {
            await this.certManager.removeDomainCert(oldHostname).catch(() => {});
          }
        }
        await this.add(file, p).catch(() => {});
      }
    }
  }

  async restartAllPhpRuntimes(): Promise<void> {
    await this.phpFpmManager.stopAll();
    await this.restorePhpFpmProcesses();
  }

  async restorePhpFpmProcesses(): Promise<void> {
    const started = new Set<string>();

    // Always ensure the "minimal" PHP-FPM is running — used by the default
    // nginx server block (localhost / localhost.test) and phpMyAdmin.
    try {
      const minimalProfile = await this.phpProfileManager.get('minimal');
      if (minimalProfile) {
        const phpVer = minimalProfile.phpVersion || this.settings.phpVersion;
        await this.phpFpmManager.startProjectPhpFpm(
          'minimal',
          phpVer,
          { ...minimalProfile.phpSettings },
          minimalProfile.phpExtensions,
        );
        started.add('minimal');
        this.log('info', 'Minimal PHP-FPM started for dashboard/phpMyAdmin');
      }
    } catch (err: any) {
      this.log('warn', `Failed to start minimal PHP-FPM: ${err.message}`);
    }

    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    if (!await fs.pathExists(vhostsFile)) return;

    try {
      const vhosts: any[] = await fs.readJson(vhostsFile);
      this.log('info', `Restoring ${vhosts.length} PHP-FPM processes...`);

      for (const v of vhosts) {
        const profile = await this.resolveProfile(v, v.projectDir);
        const profileId = v.phpProfileId || profile.id;

        if (started.has(profileId)) continue;

        const phpVer = v.phpVersion || profile.phpVersion || this.settings.phpVersion;
        try {
          await this.phpFpmManager.startProjectPhpFpm(
            profileId,
            phpVer,
            { ...profile.phpSettings },
            profile.phpExtensions,
          );
          started.add(profileId);
          await new Promise<void>((resolve) => setTimeout(resolve, 500));
        } catch (err: any) {
          this.log('warn', `Failed to restore PHP runtime for profile ${profileId}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.log('error', `Failed to restore PHP-FPM processes: ${err.message}`);
    }
  }

  private log(level: LogEntry['level'], message: string): void {
    this.onLog({
      service: 'lstack',
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  // ── List VHosts ───────────────────────────────────────────────────────────
  async list(): Promise<VHost[]> {
    const etcDir = path.join(this.settings.dataDir, 'etc');
    const sitesDir = path.join(etcDir, this.settings.webserver === 'apache' ? 'apache2' : 'nginx', 'sites-enabled');

    if (!await fs.pathExists(sitesDir)) return [];

    const files = await fs.readdir(sitesDir);
    const vhosts: VHost[] = [];

    for (const file of files) {
      if (!file.endsWith('.conf')) continue;
      const confPath = path.join(sitesDir, file);
      const content = await fs.readFile(confPath, 'utf-8');
      const vhost = this.parseVHostConf(file, content);
      if (vhost) vhosts.push(vhost);
    }

    // Merge data from vhosts.json
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    if (await fs.pathExists(vhostsFile)) {
      try {
        const saved: any[] = await fs.readJson(vhostsFile);
        for (const vhost of vhosts) {
          const match = saved.find((s) => s.name === vhost.name);
          if (match) {
            vhost.phpSettings = match.phpSettings;
            vhost.cgiPort = match.cgiPort;
            vhost.phpVersion = match.phpVersion;
            vhost.phpProfileId = match.phpProfileId;
            if (match.projectDir) {
              vhost.projectDir = match.projectDir;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return vhosts;
  }

  // ── Add VHost ─────────────────────────────────────────────────────────────
  async add(name: string, projectDir: string): Promise<VHost> {
    const { domain, webserver, httpPort, httpsPort, dataDir } = this.settings;
    const hostname = `${name}.${domain}`;
    const etcDir = path.join(dataDir, 'etc');
    const sslDir = path.join(etcDir, 'ssl');
    const logsDir = path.join(dataDir, 'logs');

    await fs.ensureDir(path.join(logsDir, webserver === 'apache' ? 'apache' : 'nginx'));

    // Auto-detect 'public' document root
    let docRoot = projectDir;
    if (path.basename(docRoot) !== 'public') {
      const publicPath = path.join(docRoot, 'public');
      if (await fs.pathExists(publicPath) && (await fs.stat(publicPath)).isDirectory()) {
        docRoot = publicPath;
      }
    }

    const certFile = this.certManager ? this.certManager.getCertPath() : path.join(sslDir, 'lstack.crt');
    const keyFile = this.certManager ? this.certManager.getKeyPath() : path.join(sslDir, 'lstack.key');
    const hasSSL = await fs.pathExists(certFile) && await fs.pathExists(keyFile);

    const vhost: VHost = {
      name,
      hostname,
      projectDir: docRoot,
      port: httpPort,
      sslPort: httpsPort,
      ssl: hasSSL,
      webserver,
      createdAt: new Date().toISOString(),
    };

    // Merge saved data from vhosts.json
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    if (await fs.pathExists(vhostsFile)) {
      try {
        const saved: any[] = await fs.readJson(vhostsFile);
        const match = saved.find((s) => s.name === name);
        if (match) {
          vhost.phpVersion = match.phpVersion;
          vhost.phpProfileId = match.phpProfileId;
          vhost.phpSettings = match.phpSettings;
          vhost.cgiPort = match.cgiPort;
          // Resolve saved projectDir (with .devstack → .lstack migration)
          const savedDir = (match.projectDir || '').replace(/\.devstack/g, '.lstack');
          const savedPublic = savedDir ? path.join(savedDir, 'public') : '';
          if (!vhost.projectDir.endsWith(`${path.sep}public`) && !vhost.projectDir.endsWith('/public')) {
            if (savedDir && await fs.pathExists(savedDir)) {
              if (savedPublic && await fs.pathExists(savedPublic)) {
                vhost.projectDir = savedPublic;
              } else {
                vhost.projectDir = savedDir;
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // Resolve PHP profile and start PHP-FPM
    const profile = await this.resolveProfile(vhost, projectDir);
    vhost.phpProfileId = vhost.phpProfileId || profile.id;
    vhost.phpVersion = vhost.phpVersion || profile.phpVersion || this.settings.phpVersion;
    // Always apply profile phpSettings (matches compiled behavior)
    vhost.phpSettings = { ...profile.phpSettings };

    try {
      const port = await this.phpFpmManager.startProjectPhpFpm(
        vhost.phpProfileId,
        vhost.phpVersion,
        vhost.phpSettings,
        profile.phpExtensions,
      );
      vhost.cgiPort = port;
    } catch (err: any) {
      this.log('warn', `Failed to start PHP runtime for ${name}: ${err.message}`);
      vhost.cgiPort = vhost.cgiPort || await this.phpProfileManager.getPortForProfile(vhost.phpProfileId);
    }

    // Persist to vhosts.json
    let vhostsData: any[] = [];
    if (await fs.pathExists(vhostsFile)) {
      vhostsData = await fs.readJson(vhostsFile).catch(() => []);
    }
    const existingIdx = vhostsData.findIndex((v: any) => v.name === name);
    const saveEntry = {
      name: vhost.name,
      hostname: vhost.hostname,
      projectDir: vhost.projectDir,
      phpVersion: vhost.phpVersion,
      phpProfileId: vhost.phpProfileId,
      phpSettings: vhost.phpSettings,
      cgiPort: vhost.cgiPort,
    };
    if (existingIdx === -1) {
      vhostsData.push(saveEntry);
    } else {
      vhostsData[existingIdx] = { ...vhostsData[existingIdx], ...saveEntry };
    }
    await fs.writeJson(vhostsFile, vhostsData, { spaces: 2 });

    // Write webserver config
    if (webserver === 'nginx') {
      await this.writeNginxConf(vhost, etcDir, sslDir, logsDir);
    } else {
      await this.writeApacheConf(vhost, etcDir, sslDir, logsDir);
    }

    await this.addHostsEntry(hostname);
    this.onReloadWebserver?.();

    if (this.onVHostChange) {
      this.onVHostChange(await this.list());
    }

    return vhost;
  }

  // ── Remove VHost ──────────────────────────────────────────────────────────
  async remove(name: string): Promise<void> {
    const { domain, dataDir } = this.settings;
    const hostname = `${name}.${domain}`;
    const etcDir = path.join(dataDir, 'etc');

    // Clean up vhosts.json
    const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
    let phpProfileId: string | undefined;
    if (await fs.pathExists(vhostsFile)) {
      try {
        const vhosts: any[] = await fs.readJson(vhostsFile);
        const match = vhosts.find((v) => v.name === name);
        phpProfileId = match?.phpProfileId;
        const remaining = vhosts.filter((v) => v.name !== name);
        await fs.writeJson(vhostsFile, remaining, { spaces: 2 });

        // If no other vhost uses this profile, stop the PHP-FPM
        if (phpProfileId && !remaining.some((v) => v.phpProfileId === phpProfileId)) {
          await this.phpFpmManager.stopProjectPhpFpm(phpProfileId).catch(() => {});
          // Clean up auto-generated profiles
          const profile = await this.phpProfileManager.get(phpProfileId);
          if (profile && !profile.isBuiltIn && profile.description?.includes('Auto-generated')) {
            await this.phpProfileManager.delete(phpProfileId).catch(() => {});
          }
        }
      } catch {
        // ignore
      }
    }

    const nginxConf = path.join(etcDir, 'nginx', 'sites-enabled', `${name}.conf`);
    const apacheConf = path.join(etcDir, 'apache2', 'sites-enabled', `${name}.conf`);
    await fs.remove(nginxConf).catch(() => {});
    await fs.remove(apacheConf).catch(() => {});

    if (this.certManager) {
      await this.certManager.removeDomainCert(hostname).catch(() => {});
    }

    await this.removeHostsEntry(hostname);
    this.onReloadWebserver?.();

    if (this.onVHostChange) {
      this.onVHostChange(await this.list());
    }
  }

  // ── Generate nginx.conf ───────────────────────────────────────────────────
  async generateNginxMainConf(pmaDir: string): Promise<void> {
    const { dataDir, wwwDir, httpPort, binDir } = this.settings;
    const nginxVersion = this.settings.nginxVersion || '1.28.0';
    const etcDir = path.join(dataDir, 'etc');
    const logsDir = path.join(dataDir, 'logs');

    await fs.ensureDir(path.join(logsDir, 'nginx'));
    await fs.ensureDir(path.join(dataDir, 'tmp'));

    // Copy mime.types from nginx install
    const nginxInstallDir = path.join(binDir, 'nginx', `nginx-${nginxVersion}`);
    let srcMimeTypes = path.join(nginxInstallDir, 'conf', 'mime.types');
    if (!fs.existsSync(srcMimeTypes)) {
      srcMimeTypes = path.join(nginxInstallDir, 'etc', 'nginx', 'mime.types');
    }
    const dstMimeTypes = path.join(etcDir, 'nginx', 'mime.types');
    if (await fs.pathExists(srcMimeTypes)) {
      await fs.copy(srcMimeTypes, dstMimeTypes, { overwrite: true });
    } else if (!await fs.pathExists(dstMimeTypes)) {
      await fs.writeFile(dstMimeTypes, MINIMAL_MIME_TYPES);
    }

    // Copy fastcgi_params
    let srcFcgi = path.join(nginxInstallDir, 'conf', 'fastcgi_params');
    if (!fs.existsSync(srcFcgi)) {
      srcFcgi = path.join(nginxInstallDir, 'etc', 'nginx', 'fastcgi_params');
    }
    const dstFcgi = path.join(etcDir, 'nginx', 'fastcgi_params');
    if (await fs.pathExists(srcFcgi) && !await fs.pathExists(dstFcgi)) {
      await fs.copy(srcFcgi, dstFcgi);
    } else if (!await fs.pathExists(dstFcgi)) {
      await fs.writeFile(dstFcgi, FASTCGI_PARAMS);
    }

    // Get the minimal profile port (used by the default server block)
    const minimalPort = this.phpFpmManager.getProfilePort('minimal');

    const content = NGINX_MAIN_TPL
      .replace(/<<LOGS_DIR>>/g, logsDir.replace(/\\/g, '/'))
      .replace(/<<DATA_DIR>>/g, dataDir.replace(/\\/g, '/'))
      .replace(/<<WWW_DIR>>/g, wwwDir.replace(/\\/g, '/'))
      .replace(/<<ETC_DIR>>/g, etcDir.replace(/\\/g, '/'))
      .replace(/<<PMA_DIR>>/g, pmaDir.replace(/\\/g, '/'))
      .replace(/<<HTTP_PORT>>/g, String(httpPort))
      .replace(/<<PHP_PORT>>/g, String(minimalPort))
      .replace(/<<PHP_VALUES>>/g, '');

    await fs.writeFile(path.join(etcDir, 'nginx', 'nginx.conf'), content);

    // Ensure static hosts entries exist
    await HostsEditor.add('127.0.0.1', 'localhost.test').catch(() => {});
    await HostsEditor.add('127.0.0.1', 'phpmyadmin.test').catch(() => {});

    await this.syncVHostSSL(etcDir, path.join(dataDir, 'etc', 'ssl'));
  }

  private async syncVHostSSL(etcDir: string, sslDir: string): Promise<void> {
    const webDir = this.settings.webserver === 'apache' ? 'apache2' : 'nginx';
    const sitesDir = path.join(etcDir, webDir, 'sites-enabled');
    if (!await fs.pathExists(sitesDir)) return;

    const files = await fs.readdir(sitesDir);
    for (const file of files) {
      if (!file.endsWith('.conf')) continue;
      const confPath = path.join(sitesDir, file);
      const content = await fs.readFile(confPath, 'utf-8');
      const hasSslBlock = content.includes('ssl_certificate') || content.includes('SSLEngine');
      const vhost = this.parseVHostConf(file, content);
      if (!vhost) continue;

      // Merge saved data
      const vhostsFile = path.join(this.settings.dataDir, 'vhosts.json');
      if (await fs.pathExists(vhostsFile)) {
        try {
          const saved: any[] = await fs.readJson(vhostsFile);
          const match = saved.find((s) => s.name === vhost.name);
          if (match) {
            vhost.phpSettings = match.phpSettings;
            vhost.cgiPort = match.cgiPort;
          }
        } catch { /* ignore */ }
      }

      let certFile = path.join(sslDir, `${vhost.hostname}.crt`);
      let keyFile = path.join(sslDir, `${vhost.hostname}.key`);
      let hasSSL = false;

      if (this.certManager) {
        try {
          const certs = await this.certManager.generateDomainCert(vhost.hostname);
          certFile = certs.certFile;
          keyFile = certs.keyFile;
          hasSSL = await fs.pathExists(certFile) && await fs.pathExists(keyFile);
        } catch { /* ignore */ }
      } else {
        hasSSL = await fs.pathExists(certFile) && await fs.pathExists(keyFile);
      }

      const phpValues = this.buildPhpValues(vhost.phpSettings);
      const cgiPort = vhost.cgiPort || 9099;

      if (hasSslBlock && !hasSSL) {
        const fixed = NGINX_SERVER_HTTP_TPL
          .replace(/<<HTTP_PORT>>/g, String(this.settings.httpPort))
          .replace(/<<PHP_VALUES>>/g, phpValues)
          .replace(/<<HOSTNAME>>/g, vhost.hostname)
          .replace(/<<PROJECT_DIR>>/g, vhost.projectDir.replace(/\\/g, '/'))
          .replace(/<<PHP_PORT>>/g, String(cgiPort));
        await fs.writeFile(confPath, fixed);
      } else if (!hasSslBlock && hasSSL) {
        const fixed = NGINX_SERVER_SSL_TPL
          .replace(/<<HTTP_PORT>>/g, String(this.settings.httpPort))
          .replace(/<<HTTPS_PORT>>/g, String(this.settings.httpsPort))
          .replace(/<<PHP_VALUES>>/g, phpValues)
          .replace(/<<HOSTNAME>>/g, vhost.hostname)
          .replace(/<<PROJECT_DIR>>/g, vhost.projectDir.replace(/\\/g, '/'))
          .replace(/<<PHP_PORT>>/g, String(cgiPort))
          .replace(/<<SSL_CERT>>/g, certFile.replace(/\\/g, '/'))
          .replace(/<<SSL_KEY>>/g, keyFile.replace(/\\/g, '/'));
        await fs.writeFile(confPath, fixed);
      }
    }
  }

  private buildPhpValues(phpSettings?: VHostPhpSettings): string {
    if (!phpSettings || Object.keys(phpSettings).length === 0) return '';
    const values = Object.entries(phpSettings)
      .map(([k, v]) => `${k}=${v}`)
      .join('\\n');
    return `        fastcgi_param PHP_VALUE "${values}";`;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────
  private async writeNginxConf(
    vhost: VHost,
    etcDir: string,
    sslDir: string,
    _logsDir: string,
  ): Promise<void> {
    let certFile = this.certManager ? this.certManager.getCertPath() : path.join(sslDir, 'lstack.crt');
    let keyFile = this.certManager ? this.certManager.getKeyPath() : path.join(sslDir, 'lstack.key');
    let hasSSL = false;

    const phpValues = this.buildPhpValues(vhost.phpSettings);

    if (this.certManager) {
      try {
        const certs = await this.certManager.generateDomainCert(vhost.hostname);
        certFile = certs.certFile;
        keyFile = certs.keyFile;
        hasSSL = await fs.pathExists(certFile) && await fs.pathExists(keyFile);
      } catch { /* ignore */ }
    } else {
      hasSSL = await fs.pathExists(certFile) && await fs.pathExists(keyFile);
    }

    const cgiPort = vhost.cgiPort || 9099;
    let content: string;
    if (hasSSL) {
      content = NGINX_SERVER_SSL_TPL
        .replace(/<<HTTP_PORT>>/g, String(vhost.port))
        .replace(/<<HTTPS_PORT>>/g, String(vhost.sslPort))
        .replace(/<<PHP_VALUES>>/g, phpValues)
        .replace(/<<HOSTNAME>>/g, vhost.hostname)
        .replace(/<<PROJECT_DIR>>/g, vhost.projectDir.replace(/\\/g, '/'))
        .replace(/<<PHP_PORT>>/g, String(cgiPort))
        .replace(/<<SSL_CERT>>/g, certFile.replace(/\\/g, '/'))
        .replace(/<<SSL_KEY>>/g, keyFile.replace(/\\/g, '/'));
    } else {
      content = NGINX_SERVER_HTTP_TPL
        .replace(/<<HTTP_PORT>>/g, String(vhost.port))
        .replace(/<<PHP_VALUES>>/g, phpValues)
        .replace(/<<HOSTNAME>>/g, vhost.hostname)
        .replace(/<<PROJECT_DIR>>/g, vhost.projectDir.replace(/\\/g, '/'))
        .replace(/<<PHP_PORT>>/g, String(cgiPort));
    }

    const sitesDir = path.join(etcDir, 'nginx', 'sites-enabled');
    await fs.ensureDir(sitesDir);
    const confFile = path.join(sitesDir, `${vhost.name}.conf`);
    await fs.writeFile(confFile, content);
  }

  private async writeApacheConf(
    vhost: VHost,
    etcDir: string,
    sslDir: string,
    logsDir: string,
  ): Promise<void> {
    let certFile = this.certManager ? this.certManager.getCertPath() : path.join(sslDir, 'lstack.crt');
    let keyFile = this.certManager ? this.certManager.getKeyPath() : path.join(sslDir, 'lstack.key');
    let hasSSL = false;

    const cgiPort = vhost.cgiPort || 9099;

    if (this.certManager) {
      try {
        const certs = await this.certManager.generateDomainCert(vhost.hostname);
        certFile = certs.certFile;
        keyFile = certs.keyFile;
        hasSSL = await fs.pathExists(certFile) && await fs.pathExists(keyFile);
      } catch { /* ignore */ }
    } else {
      hasSSL = await fs.pathExists(certFile) && await fs.pathExists(keyFile);
    }

    let content: string;
    if (hasSSL) {
      content = APACHE_VHOST_SSL_TPL
        .replace(/<<HTTP_PORT>>/g, String(vhost.port))
        .replace(/<<HTTPS_PORT>>/g, String(vhost.sslPort))
        .replace(/<<HOSTNAME>>/g, vhost.hostname)
        .replace(/<<PROJECT_DIR>>/g, vhost.projectDir.replace(/\\/g, '/'))
        .replace(/<<PHP_PORT>>/g, String(cgiPort))
        .replace(/<<LOGS_DIR>>/g, logsDir.replace(/\\/g, '/'))
        .replace(/<<SSL_CERT>>/g, certFile.replace(/\\/g, '/'))
        .replace(/<<SSL_KEY>>/g, keyFile.replace(/\\/g, '/'))
        .replace(/<<NAME>>/g, vhost.name);
    } else {
      content = APACHE_VHOST_TPL
        .replace(/<<HTTP_PORT>>/g, String(vhost.port))
        .replace(/<<HOSTNAME>>/g, vhost.hostname)
        .replace(/<<PROJECT_DIR>>/g, vhost.projectDir.replace(/\\/g, '/'))
        .replace(/<<PHP_PORT>>/g, String(cgiPort))
        .replace(/<<LOGS_DIR>>/g, logsDir.replace(/\\/g, '/'))
        .replace(/<<NAME>>/g, vhost.name);
    }

    const sitesDir = path.join(etcDir, 'apache2', 'sites-enabled');
    await fs.ensureDir(sitesDir);
    const confFile = path.join(sitesDir, `${vhost.name}.conf`);
    await fs.writeFile(confFile, content);
  }

  private parseVHostConf(filename: string, content: string): VHost | null {
    const name = filename.replace('.conf', '');
    const isApache = content.includes('<VirtualHost');

    let hostname = '';
    let projectDir = '';
    let ssl = false;

    if (isApache) {
      const hostMatch = content.match(/ServerName\s+([^\s]+)/i);
      const rootMatch = content.match(/DocumentRoot\s+"([^"]+)"/i);
      if (hostMatch) hostname = hostMatch[1];
      if (rootMatch) projectDir = rootMatch[1];
      ssl = content.includes('SSLEngine on');
    } else {
      const hostMatch = content.match(/server_name\s+([^\s;]+)/i);
      const rootMatch = content.match(/root\s+"([^"]+)"/i);
      if (hostMatch) hostname = hostMatch[1];
      if (rootMatch) projectDir = rootMatch[1];
      ssl = content.includes('ssl_certificate');
    }

    if (!hostname || !projectDir) return null;

    return {
      name,
      hostname,
      projectDir,
      port: this.settings.httpPort,
      sslPort: this.settings.httpsPort,
      ssl,
      webserver: this.settings.webserver,
      createdAt: new Date().toISOString(),
    };
  }

  private async addHostsEntry(hostname: string): Promise<void> {
    try {
      await HostsEditor.add('127.0.0.1', hostname);
    } catch {
      this.log('warn', `Could not add ${hostname} to hosts file (may need admin/sudo)`);
    }
  }

  private async removeHostsEntry(hostname: string): Promise<void> {
    try {
      await HostsEditor.remove(hostname);
    } catch {
      // ignore
    }
  }
}

// ─── Hosts File Editor ────────────────────────────────────────────────────────
class HostsEditor {
  private static hostsPath =
    process.platform === 'win32'
      ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
      : '/etc/hosts';

  static async add(ip: string, hostname: string): Promise<void> {
    const content = await fs.readFile(this.hostsPath, 'utf-8').catch(() => '');
    if (content.includes(hostname)) return;

    const entry = `\n${ip}\t${hostname}\t# LStack`;

    try {
      await fs.appendFile(this.hostsPath, entry);
      return;
    } catch { /* need elevation */ }

    if (process.platform === 'win32') {
      const line = `${ip}\\t${hostname}\\t# LStack`;
      const cmd = `Add-Content -Path '${this.hostsPath}' -Value '${line}' -Encoding UTF8`;
      await new Promise<void>((resolve, reject) => {
        const { spawn } = require('child_process');
        const proc = spawn(
          'powershell',
          ['-NoProfile', '-Command',
            `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -Command \\"${cmd}\\""`],
          { shell: false, windowsHide: true },
        );
        proc.on('exit', (code: number) => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
        proc.on('error', reject);
      });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const { spawn } = require('child_process');
      const proc = spawn(
        'sudo', ['tee', '-a', this.hostsPath],
        { stdio: ['pipe', 'ignore', 'ignore'] },
      );
      proc.stdin.write(entry);
      proc.stdin.end();
      proc.on('exit', (code: number) => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
      proc.on('error', reject);
    });
  }

  static async remove(hostname: string): Promise<void> {
    try {
      const content = await fs.readFile(this.hostsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => !line.includes(hostname));
      await fs.writeFile(this.hostsPath, lines.join('\n'));
    } catch { /* ignore */ }
  }
}

// ─── Fallback configs ─────────────────────────────────────────────────────────
const MINIMAL_MIME_TYPES = `types {
    text/html                             html htm shtml;
    text/css                              css;
    text/xml                              xml;
    image/gif                             gif;
    image/jpeg                            jpeg jpg;
    application/javascript                js;
    application/json                      json;
    image/png                             png;
    image/svg+xml                         svg svgz;
    image/webp                            webp;
    image/x-icon                          ico;
    font/woff                             woff;
    font/woff2                            woff2;
    application/pdf                       pdf;
    application/zip                       zip;
    application/octet-stream              bin exe dll;
    text/plain                            txt;
    video/mp4                             mp4;
    video/webm                            webm;
}
`;

const FASTCGI_PARAMS = `fastcgi_param  QUERY_STRING       $query_string;
fastcgi_param  REQUEST_METHOD     $request_method;
fastcgi_param  CONTENT_TYPE       $content_type;
fastcgi_param  CONTENT_LENGTH     $content_length;
fastcgi_param  SCRIPT_NAME        $fastcgi_script_name;
fastcgi_param  REQUEST_URI        $request_uri;
fastcgi_param  DOCUMENT_URI       $document_uri;
fastcgi_param  DOCUMENT_ROOT      $document_root;
fastcgi_param  SERVER_PROTOCOL    $server_protocol;
fastcgi_param  GATEWAY_INTERFACE  CGI/1.1;
fastcgi_param  SERVER_SOFTWARE    nginx/$nginx_version;
fastcgi_param  REMOTE_ADDR        $remote_addr;
fastcgi_param  REMOTE_PORT        $remote_port;
fastcgi_param  SERVER_ADDR        $server_addr;
fastcgi_param  SERVER_PORT        $server_port;
fastcgi_param  SERVER_NAME        $server_name;
fastcgi_param  REDIRECT_STATUS    200;
`;
