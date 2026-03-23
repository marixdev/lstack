import { contextBridge, ipcRenderer } from 'electron';
import type {
  ServiceName,
  ServiceInfo,
  PackageCategory,
  Project,
  ProjectCreateOptions,
  VHost,
  LStackSettings,
  LogEntry,
  DownloadProgress,
  PhpProfile,
  PhpRuntimeStatus,
  CertStatus,
  AppInfo,
} from '../src/types';

// ─── Type-safe IPC bridge ─────────────────────────────────────────────────────
const api = {
  // ── Services ──────────────────────────────────────────────────────────────
  service: {
    start: (name: ServiceName) => ipcRenderer.invoke('service:start', name),
    stop: (name: ServiceName) => ipcRenderer.invoke('service:stop', name),
    restart: (name: ServiceName) => ipcRenderer.invoke('service:restart', name),
    showContextMenu: (name: ServiceName) => ipcRenderer.invoke('service:contextMenu', name),
    getStatuses: (): Promise<ServiceInfo[]> => ipcRenderer.invoke('service:status'),
    getProcessesOnPort: (port: number): Promise<Array<{ pid: string; name: string; port: number }>> =>
      ipcRenderer.invoke('service:getProcessesOnPort', port),
    killProcess: (pid: string): Promise<boolean> =>
      ipcRenderer.invoke('service:killProcess', pid),
    onLog: (cb: (entry: LogEntry) => void) => {
      const handler = (_: Electron.IpcRendererEvent, entry: LogEntry) => cb(entry);
      ipcRenderer.on('service:log', handler);
      return () => ipcRenderer.removeListener('service:log', handler);
    },
    onStatusUpdate: (cb: (statuses: ServiceInfo[]) => void) => {
      const handler = (_: Electron.IpcRendererEvent, statuses: ServiceInfo[]) => cb(statuses);
      ipcRenderer.on('service:statusUpdate', handler);
      return () => ipcRenderer.removeListener('service:statusUpdate', handler);
    },
  },

  // ── Packages ──────────────────────────────────────────────────────────────
  package: {
    list: (): Promise<PackageCategory[]> => ipcRenderer.invoke('package:list'),
    getInstalled: (): Promise<Record<string, string[]>> => ipcRenderer.invoke('package:getInstalled'),
    install: (id: string, version: string) => ipcRenderer.invoke('package:install', id, version),
    uninstall: (id: string, version: string) => ipcRenderer.invoke('package:uninstall', id, version),
    switchVersion: (category: string, version: string) =>
      ipcRenderer.invoke('package:switch', category, version),
    reconfigurePhp: () => ipcRenderer.invoke('php:reconfigure'),
    onProgress: (cb: (progress: DownloadProgress) => void) => {
      const handler = (_: Electron.IpcRendererEvent, p: DownloadProgress) => cb(p);
      ipcRenderer.on('package:progress', handler);
      return () => ipcRenderer.removeListener('package:progress', handler);
    },
    onInstallLog: (cb: (data: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: string) => cb(data);
      ipcRenderer.on('package:install:raw', handler);
      return () => ipcRenderer.removeListener('package:install:raw', handler);
    },
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  project: {
    list: (): Promise<Project[]> => ipcRenderer.invoke('project:list'),
    create: (name: string, template: string, options?: ProjectCreateOptions): Promise<Project> =>
      ipcRenderer.invoke('project:create', name, template, options),
    open: (dirPath: string) => ipcRenderer.invoke('project:open', dirPath),
    delete: (name: string) => ipcRenderer.invoke('project:delete', name),
    onInstallLog: (cb: (data: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: string) => cb(data);
      ipcRenderer.on('project:create:raw', handler);
      return () => ipcRenderer.removeListener('project:create:raw', handler);
    },
  },

  // ── VHosts ────────────────────────────────────────────────────────────────
  vhost: {
    list: (): Promise<VHost[]> => ipcRenderer.invoke('vhost:list'),
    add: (name: string, dir: string): Promise<VHost> =>
      ipcRenderer.invoke('vhost:add', name, dir),
    remove: (name: string) => ipcRenderer.invoke('vhost:remove', name),
    updatePhpSettings: (name: string, settings: Record<string, string | number>): Promise<VHost> =>
      ipcRenderer.invoke('vhost:updatePhpSettings', name, settings),
    updatePhpVersion: (name: string, phpVersion: string): Promise<VHost> =>
      ipcRenderer.invoke('vhost:updatePhpVersion', name, phpVersion),
    updatePhpProfile: (name: string, phpProfileId: string): Promise<VHost> =>
      ipcRenderer.invoke('vhost:updatePhpProfile', name, phpProfileId),
    updatePhpExtensions: (name: string, extensions: Record<string, boolean>): Promise<VHost> =>
      ipcRenderer.invoke('vhost:updatePhpExtensions', name, extensions),
    onUpdate: (cb: (vhosts: VHost[]) => void) => {
      const handler = (_: Electron.IpcRendererEvent, v: VHost[]) => cb(v);
      ipcRenderer.on('vhost:update', handler);
      return () => ipcRenderer.removeListener('vhost:update', handler);
    },
  },

  // ── PHP Profiles ──────────────────────────────────────────────────────────
  phpProfile: {
    list: (): Promise<PhpProfile[]> => ipcRenderer.invoke('php-profile:list'),
    listRuntimeStatuses: (): Promise<PhpRuntimeStatus[]> => ipcRenderer.invoke('php-profile:runtime-statuses'),
    listBuiltInExtensions: (phpVersion: string): Promise<string[]> => ipcRenderer.invoke('php-profile:built-in-extensions', phpVersion),
    restartRuntimes: (): Promise<void> => ipcRenderer.invoke('php-profile:restart-runtimes'),
    get: (id: string): Promise<PhpProfile | null> => ipcRenderer.invoke('php-profile:get', id),
    create: (profile: Omit<PhpProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<PhpProfile> =>
      ipcRenderer.invoke('php-profile:create', profile),
    update: (id: string, updates: Partial<PhpProfile>): Promise<PhpProfile> =>
      ipcRenderer.invoke('php-profile:update', id, updates),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('php-profile:delete', id),
  },

  // ── Cert ──────────────────────────────────────────────────────────────────
  cert: {
    status: (): Promise<CertStatus> =>
      ipcRenderer.invoke('cert:status'),
    install: () => ipcRenderer.invoke('cert:install'),
    getCACertPath: (): Promise<string> => ipcRenderer.invoke('cert:getCACertPath'),
  },

  // ── Terminal ──────────────────────────────────────────────────────────────
  terminal: {
    create: (id: string, cwd: string, projectName?: string) =>
      ipcRenderer.invoke('terminal:create', id, cwd, projectName),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    kill: (id: string) =>
      ipcRenderer.invoke('terminal:kill', id),
    isAlive: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('terminal:isAlive', id),
    onData: (cb: (id: string, data: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, id: string, data: string) => cb(id, data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onExit: (cb: (id: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, id: string) => cb(id);
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    },
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    get: (): Promise<LStackSettings> => ipcRenderer.invoke('settings:get'),
    set: (s: Partial<LStackSettings>) => ipcRenderer.invoke('settings:set', s),
  },

  // ── System ────────────────────────────────────────────────────────────────
  system: {
    openDir: (p: string) => ipcRenderer.invoke('system:openDir', p),
    openBrowser: (url: string) => ipcRenderer.invoke('system:openBrowser', url),
    getPlatform: (): Promise<'win32' | 'darwin' | 'linux'> =>
      ipcRenderer.invoke('system:getPlatform'),
    getDataDir: (): Promise<string> => ipcRenderer.invoke('system:getDataDir'),
    getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('system:getAppInfo'),
    selectDir: (): Promise<string | null> => ipcRenderer.invoke('system:selectDir'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  },
};

contextBridge.exposeInMainWorld('lstack', api);

// TypeScript type augmentation for window.lstack
export type LStackAPI = typeof api;
