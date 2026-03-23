// ============================================================
// Shared types between Electron main process and React renderer
// ============================================================

export type Platform = 'win32' | 'darwin' | 'linux';

export type ServiceName = 'nginx' | 'apache' | 'mariadb' | 'php-fpm' | 'redis' | 'memcached' | 'mailpit' | 'postgresql' | 'mongodb';

export type ServiceStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error';

export interface ServiceInfo {
  name: ServiceName;
  label: string;
  version: string;
  status: ServiceStatus;
  port: number;
  pid?: number;
  enabled: boolean;
}

export interface PackageEntry {
  id: string;
  name: string;
  version: string;
  category: 'webserver' | 'database' | 'php' | 'nodejs' | 'tools';
  platform: Platform;
  url: string;
  size?: number;           // bytes
  checksum?: string;       // sha256
  installedAt?: string;    // ISO date
}

export interface PackageCategory {
  id: string;
  label: string;
  icon: string;
  versions: PackageVersion[];
}

export interface PackageVersion {
  version: string;
  label: string;
  lts?: boolean;
  downloads: Partial<Record<Platform, string>>;
  installedPath?: string;
  isInstalled?: boolean;
  isActive?: boolean;
}

export interface VHostPhpSettings {
  memory_limit?: string;
  max_execution_time?: number;
  max_input_time?: number;
  max_input_vars?: number;
  upload_max_filesize?: string;
  post_max_size?: string;
  display_errors?: string;
  date_timezone?: string;
}

export interface PhpExtension {
  name: string;
  enabled: boolean;
  builtIn?: boolean;
  description?: string;
}

export interface PhpProfile {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  phpVersion: string;
  phpSettings: VHostPhpSettings;
  phpExtensions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PhpRuntimeStatus {
  profileId: string;
  profileName: string;
  phpVersion: string;
  port: number;
  running: boolean;
  pid?: number;
  projectCount: number;
  isBuiltIn: boolean;
}

export interface VHost {
  name: string;
  hostname: string;        // e.g. myapp.test
  projectDir: string;
  port: number;
  sslPort: number;
  ssl: boolean;
  webserver: 'nginx' | 'apache';
  createdAt: string;
  phpVersion?: string;     // legacy / fallback
  phpProfileId?: string;
  phpSettings?: VHostPhpSettings;
  phpExtensions?: Record<string, boolean>;  // legacy migration only
  cgiPort?: number;        // PHP runtime port
}

export interface Project {
  name: string;
  path: string;
  hostname?: string;
  vhost?: VHost;
  hasGit: boolean;
  hasComposer: boolean;
  hasPackageJson: boolean;
  framework?: 'laravel' | 'wordpress' | 'symfony' | 'codeigniter' | 'generic';
}

export interface ProjectCreateOptions {
  frameworkVersion?: string;
  phpVersion?: string;
  phpProfileId?: string;
  autoInstallPhp?: boolean;
  skipPhpInstallPrompt?: boolean;
}

export type AppLanguage = 'vi' | 'en';

export interface LStackSettings {
  wwwDir: string;
  dataDir: string;
  logsDir: string;
  binDir: string;
  domain: string;          // default: 'test'
  webserver: 'nginx' | 'apache';
  phpVersion: string;
  mariadbVersion: string;
  nginxVersion: string;
  apacheVersion?: string;
  openlitespeedVersion?: string;
  redisVersion?: string;
  memcachedVersion?: string;
  mailpitVersion?: string;
  postgresqlVersion?: string;
  phpmyadminVersion?: string;
  mongodbVersion?: string;
  httpPort: number;
  httpsPort: number;
  mariadbPort: number;
  postgresPort?: number;
  mongodbPort?: number;
  autoVirtualHost: boolean;
  autoStartServices: boolean;
  language: AppLanguage;
  theme: 'dark' | 'light';
}

export interface LogEntry {
  service: ServiceName | 'lstack';
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
}

export interface DownloadProgress {
  packageId: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  speed: number;           // bytes/sec
  status: 'downloading' | 'extracting' | 'done' | 'error';
  error?: string;
}

export interface SslProviderStatus {
  id: string;
  label: string;
  supported: boolean;
  ready: boolean | null;
  state: 'ready' | 'missing' | 'unsupported';
  message: string;
  warnings?: string[];
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export interface CertStatus {
  mkcertReady: boolean;
  caExists: boolean;
  warnings: string[];
  providers: SslProviderStatus[];
}

export interface AppInfo {
  name: string;
  version: string;
  owner: string;
  homepage: string;
  repositoryUrl: string;
}

export interface IpcChannels {
  // Services
  'service:start': (name: ServiceName) => Promise<void>;
  'service:stop': (name: ServiceName) => Promise<void>;
  'service:restart': (name: ServiceName) => Promise<void>;
  'service:status': () => Promise<ServiceInfo[]>;

  // Packages
  'package:list': () => Promise<PackageCategory[]>;
  'package:install': (id: string, version: string) => Promise<void>;
  'package:uninstall': (id: string, version: string) => Promise<void>;
  'package:switch': (category: string, version: string) => Promise<void>;

  // Projects
  'project:list': () => Promise<Project[]>;
  'project:create': (name: string, template: string) => Promise<Project>;
  'project:open': (path: string) => Promise<void>;
  'project:delete': (name: string) => Promise<void>;

  // VHosts
  'vhost:list': () => Promise<VHost[]>;
  'vhost:add': (name: string, dir: string) => Promise<VHost>;
  'vhost:remove': (name: string) => Promise<void>;

  // Settings
  'settings:get': () => Promise<LStackSettings>;
  'settings:set': (settings: Partial<LStackSettings>) => Promise<void>;

  // System
  'system:openDir': (path: string) => Promise<void>;
  'system:openBrowser': (url: string) => Promise<void>;
  'system:getDataDir': () => Promise<string>;
  'system:getPlatform': () => Promise<Platform>;
  'system:getAppInfo': () => Promise<AppInfo>;
}

// Phpmyadmin config helper
// Backward compatibility alias
export type DevStackSettings = LStackSettings;

export interface PhpMyAdminConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  webPath: string;        // e.g. /phpmyadmin
}


