import { useEffect, useMemo, useState } from 'react';
import {
  Download, CheckCircle2, RefreshCw, Trash2, Terminal,
  Database, Globe, Code, Zap, Mail, LayoutDashboard,
  Server, Search, Play, Settings2, X, ChevronDown,
} from 'lucide-react';
import { usePackageStore, useSettingsStore, useServiceStore, useUIStore, useToastStore } from '../store';
import { useTranslation } from '../i18n';
import { InstallTerminal } from '../components/InstallTerminal';
import type { DownloadProgress, PackageVersion } from '../types';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  mariadb: <Database size={22} />,
  mysql: <Database size={22} />,
  postgresql: <Database size={22} />,
  nginx: <Globe size={22} />,
  apache: <Server size={22} />,
  php: <Code size={22} />,
  phpmyadmin: <LayoutDashboard size={22} />,
  redis: <Zap size={22} />,
  memcached: <Zap size={22} />,
  mailpit: <Mail size={22} />,
};

const SORT_ORDER = ['nginx', 'apache', 'php', 'mariadb', 'mysql', 'postgresql', 'redis', 'memcached', 'phpmyadmin', 'mailpit'];

export function Packages() {
  const { t } = useTranslation();
  const { addToast } = useToastStore();
  const { categories, downloads, setCategories, setDownload, setInstalledVersions } = usePackageStore();
  const { settings } = useSettingsStore();
  const { services } = useServiceStore();
  const { platform } = useUIStore();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [reconfiguring, setReconfiguring] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const hasActiveDownloads = Object.values(downloads).some(d => d.status === 'downloading' || d.status === 'extracting');

  const toggleCategory = (id: string) => {
    const next = new Set(expandedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedIds(next);
  };

  useEffect(() => {
    const unsub = window.lstack.package.onProgress((progress: DownloadProgress) => {
      setDownload(progress.packageId, progress);
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    loadPackages();
  }, [settings]);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const list = await window.lstack.package.list();
      setCategories(list);
      const installed = await window.lstack.package.getInstalled();
      setInstalledVersions(installed);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (categoryId: string, version: string) => {
    try {
      await window.lstack.package.install(categoryId, version);
      addToast({ type: 'success', message: t('packages.install.success', { category: categoryId, version }) });
      await loadPackages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', message: t('packages.install.error', { message: msg }) });
    }
  };

  const handleUninstall = async (categoryId: string, version: string) => {
    if (!confirm(t('packages.uninstall.confirm', { category: categoryId, version }))) return;
    try {
      await window.lstack.package.uninstall(categoryId, version);
      addToast({ type: 'success', message: t('packages.uninstall.success', { category: categoryId, version }) });
      await loadPackages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', message: t('packages.uninstall.error', { message: msg }) });
    }
  };

  const handleSwitch = async (categoryId: string, version: string) => {
    try {
      await window.lstack.package.switchVersion(categoryId, version);
      addToast({ type: 'success', message: t('packages.switch.success', { category: categoryId, version }) });
      await loadPackages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', message: t('packages.switch.error', { message: msg }) });
    }
  };

  const handleReconfigurePhp = async () => {
    setReconfiguring(true);
    try {
      await window.lstack.package.reconfigurePhp();
      addToast({ type: 'success', message: t('packages.reconfigure.success') });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      addToast({ type: 'error', message: t('packages.reconfigure.error', { message: msg }) });
    } finally {
      setReconfiguring(false);
    }
  };

  const sortedCategories = useMemo(() => {
    let filtered = [...categories];
    if (platform === 'win32') {
      filtered = filtered.filter(c => c.id !== 'openlitespeed');
    }

    const key = search.trim().toLowerCase();
    if (key) {
      filtered = filtered.filter((category) =>
        category.label.toLowerCase().includes(key)
        || category.id.toLowerCase().includes(key)
        || category.versions.some((v) =>
          v.label.toLowerCase().includes(key) || v.version.toLowerCase().includes(key),
        ),
      );
    }

    filtered.sort((a, b) => {
      const ai = SORT_ORDER.indexOf(a.id);
      const bi = SORT_ORDER.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return filtered;
  }, [categories, search, platform]);

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-800/50 bg-slate-900/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-lg bg-blue-600/10 border border-blue-500/20">
            <Download size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{t('packages.title')}</h1>
            <p className="text-xs text-slate-400">{t('packages.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 w-64 transition-colors focus-within:border-slate-700">
            <Search size={14} className="text-slate-500 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('packages.searchPlaceholder')}
              className="bg-transparent border-none outline-none text-sm text-slate-200 w-full placeholder:text-slate-600 focus:ring-0"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300 shrink-0">
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={handleReconfigurePhp}
            disabled={reconfiguring}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700/50 transition-colors disabled:opacity-50"
          >
            <Settings2 size={13} className={reconfiguring ? 'animate-spin' : ''} />
            <span className="font-medium">{t('packages.phpConfig')}</span>
          </button>
          <button
            onClick={loadPackages}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span className="font-medium">{t('packages.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Accordion Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-3">
          {sortedCategories.map((category) => {
            const isExpanded = expandedIds.has(category.id);
            const installedCount = category.versions.filter(v => v.isInstalled).length;
            const activeVer = category.versions.find(v => v.isActive);
            const svcName = category.id === 'php' ? 'php-fpm' : category.id;
            const svcInfo = services.find(s => s.name === svcName);
            const isRunning = svcInfo?.status === 'running';

            return (
              <div key={category.id} className="rounded-xl border border-slate-800/50 bg-slate-900/30 overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      {CATEGORY_ICONS[category.id] || <Server size={22} />}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white">{category.label}</h3>
                        {isRunning && (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-semibold text-emerald-400 uppercase">{t('packages.running')}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {activeVer ? (
                          <>Active: <span className="text-blue-400 font-mono font-medium">{activeVer.label}</span></>
                        ) : installedCount > 0 ? (
                          t('packages.versionsInstalled', { count: String(installedCount) })
                        ) : (
                          t('packages.noVersionsInstalled')
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                      {t('packages.versionCount', { count: String(category.versions.length) })}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Expanded Version List */}
                {isExpanded && (
                  <div className="border-t border-slate-800/50 bg-slate-950/30 divide-y divide-slate-800/30">
                    {category.versions.map((version) => (
                      <VersionRow
                        key={version.version}
                        categoryId={category.id}
                        version={version}
                        isRunning={isRunning}
                        downloadProgress={downloads[`${category.id}-${version.version}`]}
                        onInstall={() => handleInstall(category.id, version.version)}
                        onUninstall={() => handleUninstall(category.id, version.version)}
                        onSwitch={() => handleSwitch(category.id, version.version)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Install Output Terminal */}
      {hasActiveDownloads && (
        <div className="h-40 border-t border-slate-800/50 bg-slate-950 shrink-0 flex flex-col">
          <div className="px-4 py-1.5 bg-slate-900/50 border-b border-slate-800/50 text-xs font-medium text-slate-400 flex items-center gap-2 shrink-0">
            <Terminal size={12} /> {t('packages.installOutput')}
          </div>
          <div className="flex-1 min-h-0">
            <InstallTerminal type="package" />
          </div>
        </div>
      )}
    </div>
  );
}

function VersionRow({
  categoryId,
  version,
  isRunning,
  downloadProgress,
  onInstall,
  onUninstall,
  onSwitch,
}: {
  categoryId: string;
  version: PackageVersion;
  isRunning?: boolean;
  downloadProgress?: DownloadProgress;
  onInstall: () => Promise<void>;
  onUninstall: () => Promise<void>;
  onSwitch: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const isDownloading = downloadProgress?.status === 'downloading' || downloadProgress?.status === 'extracting';

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`px-5 py-3 flex items-center justify-between hover:bg-slate-800/20 transition-colors ${version.isActive ? 'bg-blue-600/5' : ''}`}>
      {/* Left: Version info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className={`font-mono font-semibold text-sm ${version.isActive ? 'text-blue-400' : 'text-slate-200'}`}>
          {version.label}
        </span>
        {version.lts && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            LTS
          </span>
        )}
        {version.isActive ? (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
            <CheckCircle2 size={11} className="text-blue-400" />
            <span className="text-[10px] font-semibold text-blue-400 uppercase">{t('packages.active')}</span>
          </span>
        ) : version.isInstalled ? (
          <span className="text-xs text-slate-500 font-medium">{t('packages.installed')}</span>
        ) : null}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {version.isInstalled ? (
          <>
            {!version.isActive && (
              <button
                onClick={() => run(onSwitch)}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
              >
                <Play size={12} /> {t('packages.activate')}
              </button>
            )}
            <button
              onClick={() => run(onUninstall)}
              disabled={busy || (version.isActive && isRunning)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                version.isActive && isRunning
                  ? 'opacity-30 cursor-not-allowed bg-slate-800 text-slate-600 border-slate-700/50'
                  : 'bg-slate-800/50 hover:bg-red-500/10 text-slate-400 hover:text-red-400 border-slate-700/50 hover:border-red-500/30'
              }`}
              title={version.isActive && isRunning ? t('packages.stopServiceFirst') : t('packages.remove')}
            >
              <Trash2 size={12} /> {t('packages.remove')}
            </button>
          </>
        ) : (
          <button
            onClick={() => run(onInstall)}
            disabled={busy || isDownloading}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors border ${
              isDownloading
                ? 'bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {isDownloading ? (
              <>
                <RefreshCw size={12} className="animate-spin" /> {t('packages.installing')}
              </>
            ) : (
              <>
                <Download size={12} /> {t('packages.install')}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
