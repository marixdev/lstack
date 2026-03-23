import { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useUIStore } from '../store';
import { useTranslation } from '../i18n';
import type { AppInfo } from '../types';

export function AboutModal() {
  const { t } = useTranslation();
  const { showAboutModal, setShowAboutModal } = useUIStore();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    if (showAboutModal) {
      window.lstack.system.getAppInfo().then(setAppInfo).catch(() => {});
    }
  }, [showAboutModal]);

  if (!showAboutModal) return null;

  const info = {
    name: appInfo?.name || 'LStack',
    owner: appInfo?.owner || 'marixdev',
    version: appInfo?.version || '-',
    homepage: appInfo?.homepage || 'https://lstack.dev',
    repositoryUrl: appInfo?.repositoryUrl || 'https://github.com/marixdev/lstack',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setShowAboutModal(false)}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60">
          <h2 className="text-sm font-semibold text-slate-200">{t('settings.section.about')}</h2>
          <button
            onClick={() => setShowAboutModal(false)}
            className="text-slate-400 hover:text-slate-200 transition-colors rounded p-0.5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Logo + name */}
          <div className="flex items-center gap-3">
            <img src="./icon.png" alt="LStack" className="w-12 h-12 object-contain drop-shadow" />
            <div>
              <div className="text-lg font-bold text-slate-100">{info.name}</div>
              <div className="text-xs text-slate-400">v{info.version}</div>
            </div>
          </div>

          {/* Info rows */}
          <div className="space-y-2 text-sm">
            <InfoRow label={t('settings.about.owner')} value={info.owner} />
            <InfoRow label={t('settings.about.website')} value={info.homepage} />
            <InfoRow label={t('settings.about.repository')} value={info.repositoryUrl} />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => window.lstack.system.openBrowser(info.homepage)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors"
            >
              <ExternalLink size={12} />
              {t('settings.about.openWebsite')}
            </button>
            <button
              onClick={() => window.lstack.system.openBrowser(info.repositoryUrl)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors"
            >
              <ExternalLink size={12} />
              {t('settings.about.openRepository')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-slate-800/70 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 font-mono text-xs text-right break-all max-w-[200px] truncate">{value}</span>
    </div>
  );
}
