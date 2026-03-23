import { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, Network, X, Skull } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useToastStore } from '../store';

interface ProcessInfo {
  pid: string;
  name: string;
  port: number;
}

const QUICK_PORTS = [80, 443, 3000, 3306, 5432, 6379, 8080, 9000];

export function PortManager() {
  const { t } = useTranslation();
  const { addToast } = useToastStore();
  const [port, setPort] = useState('');
  const [results, setResults] = useState<ProcessInfo[]>([]);
  const [searching, setSearching] = useState(false);

  const searchPort = useCallback(async (portNumber: number) => {
    if (portNumber < 1 || portNumber > 65535) return;
    setSearching(true);
    try {
      const procs = await window.lstack.service.getProcessesOnPort(portNumber);
      setResults((prev) => {
        const existing = new Set(prev.map((p) => `${p.pid}:${p.port}`));
        const merged = [...prev];
        for (const proc of procs) {
          const key = `${proc.pid}:${proc.port}`;
          if (!existing.has(key)) merged.push(proc);
        }
        return merged;
      });
    } catch {
      // silently ignore
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearch = () => {
    const num = parseInt(port, 10);
    if (num >= 1 && num <= 65535) {
      searchPort(num);
    }
  };

  const handleScanCommon = async () => {
    setSearching(true);
    setResults([]);
    try {
      for (const p of QUICK_PORTS) {
        const procs = await window.lstack.service.getProcessesOnPort(p);
        if (procs.length > 0) {
          setResults((prev) => {
            const existing = new Set(prev.map((r) => `${r.pid}:${r.port}`));
            const merged = [...prev];
            for (const proc of procs) {
              const key = `${proc.pid}:${proc.port}`;
              if (!existing.has(key)) merged.push(proc);
            }
            return merged;
          });
        }
      }
    } finally {
      setSearching(false);
    }
  };

  const handleKill = async (pid: string) => {
    if (!confirm(t('portManager.killConfirm', { pid }))) return;
    try {
      await window.lstack.service.killProcess(pid);
      setResults((prev) => prev.filter((p) => p.pid !== pid));
      addToast({ type: 'success', message: t('portManager.killSuccess', { pid: String(pid) }) });
    } catch {
      addToast({ type: 'error', message: t('portManager.killError', { pid: String(pid) }) });
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 h-16 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900">
        <div className="flex items-center gap-3">
          <Network size={20} className="text-blue-400" />
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">{t('portManager.title')}</h1>
            <p className="text-xs text-slate-400">{t('portManager.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 flex-1 max-w-xs focus-within:border-slate-700 transition-colors">
            <Search size={14} className="text-slate-500 shrink-0" />
            <input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('portManager.portPlaceholder')}
              className="bg-transparent border-none outline-none text-sm text-slate-200 w-full placeholder:text-slate-600 focus:ring-0"
            />
            {port && (
              <button onClick={() => setPort('')} className="text-slate-500 hover:text-slate-300 shrink-0">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={!port || searching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md shadow-sm transition-colors disabled:opacity-50"
          >
            <Search size={14} />
            <span className="font-medium">{t('portManager.search')}</span>
          </button>
          <button
            onClick={handleScanCommon}
            disabled={searching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md border border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={searching ? 'animate-spin' : ''} />
            <span className="font-medium">{t('portManager.scanCommon')}</span>
          </button>
        </div>

        {/* Quick port buttons */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {QUICK_PORTS.map((p) => (
            <button
              key={p}
              onClick={() => { setPort(String(p)); searchPort(p); }}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors font-mono"
            >
              :{p}
            </button>
          ))}
        </div>
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-auto bg-slate-950">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-900/90 text-slate-400 text-xs uppercase font-semibold sticky top-0 z-10 backdrop-blur-sm shadow-sm">
            <tr>
              <th className="px-5 py-3 border-b border-slate-800 w-[15%]">PID</th>
              <th className="px-5 py-3 border-b border-slate-800 w-[35%]">{t('portManager.processName')}</th>
              <th className="px-5 py-3 border-b border-slate-800 w-[15%]">Port</th>
              <th className="px-5 py-3 border-b border-slate-800 w-[35%] text-right">{t('portManager.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {searching && results.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-slate-500">
                  <RefreshCw size={16} className="inline-block animate-spin mr-2" />
                  {t('portManager.searching')}
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-slate-500 italic">
                  {t('portManager.empty')}
                </td>
              </tr>
            ) : (
              results.map((proc, idx) => (
                <tr key={`${proc.pid}-${proc.port}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-3 text-sm font-mono text-slate-300">{proc.pid}</td>
                  <td className="px-5 py-3 text-sm text-slate-200">{proc.name}</td>
                  <td className="px-5 py-3 text-sm font-mono text-blue-400">{proc.port}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleKill(proc.pid)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-400 bg-slate-800/50 hover:bg-red-500/10 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded transition-colors"
                    >
                      <Skull size={12} />
                      {t('portManager.kill')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
