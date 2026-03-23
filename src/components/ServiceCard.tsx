import { useEffect, useState } from 'react';
import { RotateCcw, Play, Square, Globe, Database, Code, Zap, Mail, PackagePlus, Server, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from '../i18n';
import type { ServiceInfo, ServiceName } from '../types';

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  nginx:      <Globe size={20} />,
  apache:     <Server size={20} />,
  mariadb:    <Database size={20} />,
  'php-fpm':  <Code size={20} />,
  redis:      <Zap size={20} />,
  memcached:  <Zap size={20} />,
  mailpit:    <Mail size={20} />,
  postgresql: <Database size={20} />,
};

const STATUS_COLORS: Record<string, string> = {
  running:  'text-green-400',
  stopped:  'text-slate-500',
  starting: 'text-yellow-400',
  stopping: 'text-orange-400',
  error:    'text-red-400',
};

const STATUS_LABELS_KEYS: Record<string, string> = {
  running:  'serviceCard.status.running',
  stopped:  'serviceCard.status.stopped',
  starting: 'serviceCard.status.starting',
  stopping: 'serviceCard.status.stopping',
  error:    'serviceCard.status.error',
};

interface Props {
  service: ServiceInfo;
  onStart: (name: ServiceName) => void;
  onStop: (name: ServiceName) => void;
  onRestart: (name: ServiceName) => void;
  onSwitchVersion?: (name: ServiceName, version: string) => void;
  availableVersions?: string[];
  loading?: boolean;
  /** True when the package isn't installed — shows "go to Packages" instead of start/stop */
  notInstalled?: boolean;
  onInstall?: (name: ServiceName) => void;
}

export function ServiceCard({ service, onStart, onStop, onRestart, onSwitchVersion, availableVersions, loading, notInstalled, onInstall }: Props) {
  const { t } = useTranslation();
  const { name, label, version, status, port } = service;
  const isRunning = status === 'running';
  const isBusy = status === 'starting' || status === 'stopping' || loading;
  const versions = [...(availableVersions || [])];
  const [selectedVersion, setSelectedVersion] = useState(version);

  useEffect(() => {
    setSelectedVersion(version);
  }, [version]);

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        window.lstack.service.showContextMenu(service.name);
      }}
      className={`bg-slate-800 border rounded-xl p-4 transition-all ${
        notInstalled
          ? 'border-slate-700 opacity-80'
          : isRunning
          ? 'border-green-500/30'
          : 'border-slate-700'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              notInstalled
                ? 'bg-slate-700/60 text-slate-500'
                : isRunning
                ? 'bg-green-500/20 text-green-400'
                : 'bg-slate-700 text-slate-400'
            }`}
          >
            {SERVICE_ICONS[name] || <Globe size={20} />}
          </div>
          <div>
            <div className="font-semibold text-slate-100 text-sm">{label}</div>
            <div className="text-xs text-slate-500">v{version}</div>
          </div>
        </div>

        {/* Status / not-installed badge */}
        {notInstalled ? (
          <span className="text-xs text-slate-500 bg-slate-700/60 px-2 py-0.5 rounded-full">
            {t('serviceCard.notInstalled')}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className={`text-xs font-medium ${STATUS_COLORS[status]}`}>
              {t(STATUS_LABELS_KEYS[status] as any) || status}
            </span>
          </div>
        )}
      </div>

      {/* Port (only when running) */}
      {isRunning && !notInstalled && (
        <div className="text-xs text-slate-500 mb-3 font-mono">
          127.0.0.1:<span className="text-blue-400">{port}</span>
        </div>
      )}

      {!notInstalled && versions.length > 1 && (
        <div className="mb-3 flex gap-2">
          <select
            value={selectedVersion}
            onChange={(e) => {
              setSelectedVersion(e.target.value);
              onSwitchVersion?.(name, e.target.value);
            }}
            disabled={isBusy}
            className="flex-1 bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 outline-none disabled:opacity-50"
          >
            {versions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => onSwitchVersion?.(name, selectedVersion)}
            disabled={isBusy || selectedVersion === version}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
            title={isRunning ? t('serviceCard.restart') : t('serviceCard.switchVersion')}
          >
            {t('serviceCard.switch')}
          </button>
        </div>
      )}

      {/* Actions */}
      {notInstalled ? (
        <button
          onClick={() => onInstall?.(name)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-700 hover:bg-blue-600 text-slate-400 hover:text-white text-xs font-medium rounded-lg transition-colors"
        >
          <PackagePlus size={13} />
          {t('serviceCard.goToPackages')}
        </button>
      ) : (
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={() => onStart(name)}
              disabled={isBusy}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Play size={13} />
              {t('serviceCard.start')}
            </button>
          ) : (
            <button
              onClick={() => onStop(name)}
              disabled={isBusy}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Square size={13} />
              {t('serviceCard.stop')}
            </button>
          )}

          <button
            onClick={() => onRestart(name)}
            disabled={isBusy || !isRunning}
            title={t('serviceCard.restart')}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 rounded-lg transition-colors flex justify-center items-center"
          >
            <RotateCcw size={13} className={isBusy ? 'animate-spin' : ''} />
          </button>

          {(name === 'php-fpm' || name === 'nginx' || name === 'apache') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.lstack.service.showContextMenu(name);
              }}
              title={t('sidebar.configureService', { service: label })}
              className="px-3 py-1.5 bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white rounded-lg transition-colors flex justify-center items-center"
            >
              <SlidersHorizontal size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
