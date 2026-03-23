import { create } from 'zustand';
import type {
  ServiceInfo,
  ServiceName,
  PackageCategory,
  Project,
  VHost,
  LStackSettings,
  LogEntry,
  DownloadProgress,
} from '../types';

interface ServiceStore {
  services: ServiceInfo[];
  logs: LogEntry[];
  setServices: (s: ServiceInfo[]) => void;
  updateService: (name: ServiceName, patch: Partial<ServiceInfo>) => void;
  addLog: (entry: LogEntry) => void;
  clearLogs: (service?: ServiceName | 'lstack') => void;
}

interface PackageStore {
  categories: PackageCategory[];
  downloads: Record<string, DownloadProgress>;
  installedVersions: Record<string, string[]>;
  setCategories: (c: PackageCategory[]) => void;
  setDownload: (id: string, progress: DownloadProgress) => void;
  clearDownload: (id: string) => void;
  setInstalledVersions: (v: Record<string, string[]>) => void;
}

interface ProjectStore {
  projects: Project[];
  vhosts: VHost[];
  setProjects: (p: Project[]) => void;
  setVHosts: (v: VHost[]) => void;
}

interface SettingsStore {
  settings: LStackSettings | null;
  setSettings: (s: LStackSettings) => void;
}

interface UIStore {
  activeTab: string;
  sidebarCollapsed: boolean;
  logModalService: string | null;
  showAboutModal: boolean;
  platform: 'win32' | 'darwin' | 'linux';
  setActiveTab: (tab: string) => void;
  toggleSidebar: () => void;
  setLogModalService: (service: string | null) => void;
  setShowAboutModal: (show: boolean) => void;
  setPlatform: (platform: 'win32' | 'darwin' | 'linux') => void;
}

// Default settings
const defaultSettings: LStackSettings = {
  wwwDir: '',
  dataDir: '',
  logsDir: '',
  binDir: '',
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

export const useServiceStore = create<ServiceStore>((set) => ({
  services: [],
  logs: [],
  setServices: (services) => set({ services }),
  updateService: (name, patch) =>
    set((state) => ({
      services: state.services.map((s) => (s.name === name ? { ...s, ...patch } : s)),
    })),
  addLog: (entry) =>
    set((state) => ({
      // Keep last 500 log entries
      logs: [...state.logs.slice(-499), entry],
    })),
  clearLogs: (service) =>
    set((state) => ({
      logs: service ? state.logs.filter((l) => l.service !== service) : [],
    })),
}));

export const usePackageStore = create<PackageStore>((set) => ({
  categories: [],
  downloads: {},
  installedVersions: {},
  setCategories: (categories) => set({ categories }),
  setDownload: (id, progress) =>
    set((state) => ({ downloads: { ...state.downloads, [id]: progress } })),
  clearDownload: (id) =>
    set((state) => {
      const d = { ...state.downloads };
      delete d[id];
      return { downloads: d };
    }),
  setInstalledVersions: (installedVersions) => set({ installedVersions }),
}));

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  vhosts: [],
  setProjects: (projects) => set({ projects }),
  setVHosts: (vhosts) => set({ vhosts }),
}));

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: defaultSettings,
  setSettings: (settings) => set({ settings }),
}));

export const useUIStore = create<UIStore>((set) => ({
  activeTab: 'projects',
  sidebarCollapsed: false,
  logModalService: null,
  showAboutModal: false,
  platform: 'win32', // Default, updated on mount
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setLogModalService: (service) => set({ logModalService: service }),
  setShowAboutModal: (show) => set({ showAboutModal: show }),
  setPlatform: (platform) => set({ platform }),
}));

// ─── Terminal Store ───────────────────────────────────────────────────────────
export interface TerminalTabInfo {
  id: string;           // = project.name
  projectName: string;
  cwd: string;
}

interface TerminalStore {
  tabs: TerminalTabInfo[];
  activeId: string | null;
  openTerminal: (info: TerminalTabInfo) => void;
  closeTerminal: (id: string) => void;
  setActiveId: (id: string | null) => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeId: null,
  openTerminal: (info) => set((state) => {
    const exists = state.tabs.find((t) => t.id === info.id);
    return {
      tabs: exists ? state.tabs : [...state.tabs, info],
      activeId: info.id,
    };
  }),
  closeTerminal: (id) => set((state) => {
    const remaining = state.tabs.filter((t) => t.id !== id);
    return {
      tabs: remaining,
      activeId: state.activeId === id
        ? (remaining[remaining.length - 1]?.id ?? null)
        : state.activeId,
    };
  }),
  setActiveId: (id) => set({ activeId: id }),
}));

// ─── Toast Store ──────────────────────────────────────────────────────────────
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
