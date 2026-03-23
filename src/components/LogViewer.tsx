import { useEffect, useRef, useState } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { useTranslation } from '../i18n';
import type { LogEntry, ServiceName } from '../types';

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-slate-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-slate-500',
};

interface Props {
  logs: LogEntry[];
  onClear: (service?: ServiceName | 'lstack') => void;
  maxHeight?: string;
}

export function LogViewer({ logs, onClear, maxHeight = '220px' }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);

  return (
    <div className="flex flex-col bg-slate-950 rounded-xl border border-slate-800">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          {t('logs.title')}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3 h-3"
            />
            {t('logs.autoScroll')}
          </label>
          <button
            onClick={() => onClear()}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-0.5 rounded hover:bg-slate-800"
          >
            <Trash2 size={11} />
            {t('logs.clear')}
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        className="overflow-y-auto font-mono text-xs p-2 space-y-0.5"
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 py-4 text-center">{t('logs.empty')}</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-2 leading-5">
              <span className="text-slate-600 shrink-0 w-20 truncate">
                {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
              </span>
              <span className={`shrink-0 w-32 text-right ${LEVEL_COLORS[log.level]}`}>
                [{log.service}]
              </span>
              <span className={LEVEL_COLORS[log.level]}>{log.message}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
