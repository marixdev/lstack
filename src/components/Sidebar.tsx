import {
  Package, FolderOpen, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, Power, RefreshCw, FileText, SlidersHorizontal,
  Cpu, Network,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePackageStore, useServiceStore, useSettingsStore, useUIStore } from '../store';
import { useTranslation } from '../i18n';
import type { ServiceInfo, ServiceName, PhpRuntimeStatus } from '../types';

const OPTIONAL_SERVICES = new Set<ServiceName>(['redis', 'memcached', 'mailpit', 'postgresql', 'mongodb']);

const SVC_TO_PKG: Partial<Record<ServiceName, string>> = {
  'php-fpm': 'php',
  mariadb: 'mariadb',
  nginx: 'nginx',
  apache: 'apache',
  redis: 'redis',
  memcached: 'memcached',
  mailpit: 'mailpit',
  postgresql: 'postgresql',
};

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Sidebar({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar, setLogModalService } = useUIStore();
  const { services, setServices, updateService } = useServiceStore();
  const { settings, setSettings } = useSettingsStore();
  const { installedVersions } = usePackageStore();
  const [reloading, setReloading] = useState(false);
  const [phpRuntimes, setPhpRuntimes] = useState<PhpRuntimeStatus[]>([]);
  const [restartingRuntimes, setRestartingRuntimes] = useState(false);

  const NAV_ITEMS = useMemo(() => [
    { id: 'projects', labelKey: 'nav.projects' as const, icon: FolderOpen },
    { id: 'packages', labelKey: 'nav.packages' as const, icon: Package },
    { id: 'php-profiles', labelKey: 'nav.phpProfiles' as const, icon: Cpu },
    { id: 'port-manager', labelKey: 'nav.portManager' as const, icon: Network },
    { id: 'settings', labelKey: 'nav.settings' as const, icon: SettingsIcon },
  ], []);

  const isPkgInstalled = (categoryId: string) => {
    const versions = installedVersions[categoryId];
    return Array.isArray(versions) && versions.length > 0;
  };

  const visibleServices = useMemo(() => {
    return services.filter((svc) => {
      // Hide php-fpm from services — it's managed in PHP Runtimes section
      if (svc.name === 'php-fpm') return false;
      if (svc.name === 'nginx' || svc.name === 'apache') {
        return svc.name === (settings?.webserver ?? 'nginx');
      }
      if (OPTIONAL_SERVICES.has(svc.name)) {
        return isPkgInstalled(SVC_TO_PKG[svc.name] ?? svc.name);
      }
      return true;
    });
  }, [services, settings?.webserver, installedVersions]);

  const loadPhpRuntimes = useCallback(async () => {
    try {
      const statuses = await window.lstack.phpProfile.listRuntimeStatuses();
      setPhpRuntimes(statuses);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadPhpRuntimes();
    const interval = setInterval(loadPhpRuntimes, 5000);
    return () => clearInterval(interval);
  }, [loadPhpRuntimes]);

  const handleToggleService = async (service: ServiceInfo) => {
    if (service.status === 'starting' || service.status === 'stopping') return;

    const catId = SVC_TO_PKG[service.name] ?? service.name;
    if ((service.name === 'php-fpm' || service.name === 'mariadb') && !isPkgInstalled(catId)) {
      onTabChange('packages');
      return;
    }

    const nextStatus = service.status === 'running' ? 'stopping' : 'starting';
    updateService(service.name, { status: nextStatus });
    try {
      if (service.status === 'running') {
        await window.lstack.service.stop(service.name);
      } else {
        await window.lstack.service.start(service.name);
      }
    } catch {
      updateService(service.name, { status: 'error' });
    }
  };

  const handleReloadServices = async () => {
    setReloading(true);
    try {
      const runningServices = visibleServices.filter((service) => service.status === 'running');

      for (const service of runningServices) {
        updateService(service.name, { status: 'stopping' });
        try {
          await window.lstack.service.restart(service.name);
        } catch {
          updateService(service.name, { status: 'error' });
        }
      }

      const statuses = await window.lstack.service.getStatuses();
      setServices(statuses);
    } finally {
      setReloading(false);
    }
  };

  const handleRestartRuntimes = async () => {
    setRestartingRuntimes(true);
    try {
      await window.lstack.phpProfile.restartRuntimes();
      await loadPhpRuntimes();
    } catch { /* ignore */ }
    finally {
      setRestartingRuntimes(false);
    }
  };

  return (
    <aside
      className={`flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-200 ${
        sidebarCollapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 h-14 border-b border-slate-800">
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
          <img src="./icon.png" alt="LStack" className="w-8 h-8 object-contain drop-shadow-md" />
        </div>
        {!sidebarCollapsed && (
          <span className="font-bold text-blue-400 text-lg tracking-wide">LStack</span>
        )}
      </div>

      {/* Nav + services */}
      <div className="flex-1 min-h-0 flex flex-col py-3 px-2 gap-3 overflow-hidden">
        <nav className="space-y-1">
        {NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            title={sidebarCollapsed ? t(labelKey) : undefined}
            className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <Icon size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>{t(labelKey)}</span>}
          </button>
        ))}
        </nav>

        {!sidebarCollapsed && (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('sidebar.services')}
              </p>
              <button
                onClick={handleReloadServices}
                disabled={reloading}
                title={t('sidebar.restartRunningServices')}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-60 transition-colors"
              >
                <RefreshCw size={13} className={reloading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="space-y-1">
              {visibleServices.map((service) => {
                const isRunning = service.status === 'running';
                return (
                  <div 
                    key={service.name} 
                    className="rounded-lg hover:bg-slate-800 transition-colors"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      window.lstack.service.showContextMenu(service.name);
                    }}
                  >
                    <div className="flex items-center justify-between px-2 py-1.5 min-w-0">
                      <button
                        onClick={() => handleToggleService(service)}
                        disabled={service.status === 'starting' || service.status === 'stopping'}
                        className="flex-1 flex items-center gap-2 text-sm text-slate-300 disabled:opacity-60 hover:text-white transition-colors truncate text-left"
                        title={isRunning ? t('sidebar.stopService') : t('sidebar.startService')}
                      >
                        <span className={`shrink-0 w-2 h-2 rounded-full ${
                          isRunning ? 'bg-green-500' : service.status === 'error' ? 'bg-red-500' : 'bg-slate-500'
                        }`} />
                        <span className="truncate">{service.label}</span>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0 ml-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.lstack.service.showContextMenu(service.name);
                          }}
                          className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700/50 rounded transition-colors"
                          title={t('sidebar.configureService', { service: service.label })}
                        >
                          <SlidersHorizontal size={14} />
                        </button>
                        <button
                          onClick={() => setLogModalService(service.name)}
                          className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700/50 rounded transition-colors"
                          title={t('sidebar.viewLogs')}
                        >
                          <FileText size={14} />
                        </button>
                        <button
                          onClick={() => handleToggleService(service)}
                          disabled={service.status === 'starting' || service.status === 'stopping'}
                          className="p-1.5 rounded transition-colors disabled:opacity-60 hover:bg-slate-700/50"
                          title={isRunning ? t('sidebar.stopService') : t('sidebar.startService')}
                        >
                          <Power size={14} className={isRunning ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PHP Runtimes Section */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between px-2 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t('sidebar.phpRuntimes')}
                </p>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setLogModalService('php-fpm')}
                    title={t('sidebar.viewPhpRuntimeLogs')}
                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    <FileText size={13} />
                  </button>
                  <button
                    onClick={handleRestartRuntimes}
                    disabled={restartingRuntimes}
                    title={t('sidebar.restartPhpRuntimes')}
                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-60 transition-colors"
                  >
                    <RefreshCw size={13} className={restartingRuntimes ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              {phpRuntimes.length === 0 ? (
                <p className="px-2 text-[11px] text-slate-600 italic">{t('sidebar.noPhpRuntimeProjects')}</p>
              ) : (
                <div className="space-y-1">
                  {phpRuntimes.map((rt) => (
                    <button
                      key={rt.profileId}
                      onClick={() => onTabChange('php-profiles')}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors group"
                      title={t('sidebar.openPhpProfiles', { profile: rt.profileName })}
                    >
                      <span className={`shrink-0 w-2 h-2 rounded-full ${rt.running ? 'bg-green-500' : 'bg-slate-500'}`} />
                      <div className="truncate flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{rt.profileName}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          PHP {rt.phpVersion} · :{rt.port} · {t('sidebar.projectsCount', { count: String(rt.projectCount) })}
                        </div>
                      </div>
                      {rt.pid && (
                        <span className="text-[10px] text-slate-600 font-mono shrink-0">PID {rt.pid}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
      >
        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
