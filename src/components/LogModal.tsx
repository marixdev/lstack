import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useServiceStore, useUIStore } from '../store';
import { useTranslation } from '../i18n';
import { LogViewer } from './LogViewer';

export function LogModal() {
  const { logModalService, setLogModalService } = useUIStore();
  const { logs, clearLogs } = useServiceStore();
  const { t } = useTranslation();

  const serviceLogs = useMemo(() => {
    if (!logModalService) return [];
    return logs.filter((l) => l.service === logModalService);
  }, [logs, logModalService]);

  if (!logModalService) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-slate-950/80 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-4xl bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {t('logs.modalTitle', { service: logModalService })}
          </h2>
          <button
            onClick={() => setLogModalService(null)}
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 bg-slate-950/[0.3]">
          <LogViewer
            logs={serviceLogs}
            onClear={() => clearLogs(logModalService as any)}
            maxHeight="60vh"
          />
        </div>
      </div>
    </div>
  );
}
