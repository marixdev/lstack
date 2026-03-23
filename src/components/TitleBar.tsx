import { useEffect, useState } from 'react';
import { TerminalSquare, X, Minus, Maximize2, Minimize2, Globe, Sun, Moon } from 'lucide-react';
import { useTerminalStore, useUIStore, useSettingsStore } from '../store';
import { useTranslation } from '../i18n';

export function TitleBar() {
  const { t, language } = useTranslation();
  const { tabs, activeId, setActiveId, closeTerminal } = useTerminalStore();
  const { activeTab, setActiveTab } = useUIStore();
  const { settings, setSettings } = useSettingsStore();
  const { setShowAboutModal } = useUIStore();
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState<string>('win32');

  const toggleLanguage = async () => {
    const next = language === 'vi' ? 'en' : 'vi';
    const updated = { ...settings!, language: next as 'vi' | 'en' };
    setSettings(updated);
    await window.lstack.settings.set(updated);
  };

  const toggleTheme = async () => {
    const next = settings?.theme === 'light' ? 'dark' : 'light';
    const updated = { ...settings!, theme: next as 'dark' | 'light' };
    setSettings(updated);
    await window.lstack.settings.set(updated);
  };

  useEffect(() => {
    window.lstack.system.getPlatform().then(setPlatform);
    window.lstack.system.isMaximized().then(setIsMaximized);
  }, []);

  // Listen for maximize/unmaximize to update button state
  useEffect(() => {
    const interval = setInterval(async () => {
      const maximized = await window.lstack.system.isMaximized();
      setIsMaximized(maximized);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTabClick = (id: string) => {
    setActiveId(id);
    // Switch main content to show terminal
    setActiveTab('__terminal__');
  };

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeTerminal(id);
    // Navigation back to projects (when last tab closed) is handled in App.tsx
  };

  return (
    <div
      className="flex items-center h-10 bg-slate-900 border-b border-slate-700/80 select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* macOS traffic lights spacer */}
      {platform === 'darwin' && (
        <div className="w-[72px] shrink-0" />
      )}

      {/* App logo + name — click to open About */}
      <button
        onClick={() => setShowAboutModal(true)}
        className="flex items-center gap-2 px-3 h-full border-r border-slate-700/60 shrink-0 hover:bg-slate-800/60 transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <img src="./icon.png" alt="LStack" className="w-5 h-5 object-contain drop-shadow" />
        <span className="text-sm font-semibold text-slate-200">LStack</span>
      </button>

      {/* Terminal tabs */}
      <div
        className="flex items-center h-full overflow-x-auto"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {tabs.map((tab) => {
          const isActive = activeId === tab.id && activeTab === '__terminal__';
          return (
            <div
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`group flex items-center gap-1.5 px-3 h-full border-r border-slate-700/60 cursor-pointer transition-colors text-xs whitespace-nowrap ${
                isActive
                  ? 'bg-slate-950 text-slate-100 border-t-2 border-t-blue-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center shrink-0">
                <TerminalSquare size={10} className="text-blue-400" />
              </div>
              <span className="font-medium max-w-[100px] truncate">{tab.projectName}</span>
              <button
                onClick={(e) => handleCloseTab(e, tab.id)}
                className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-red-400 transition-all rounded p-0.5"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Draggable spacer */}
      <div
        className="flex-1 h-full"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Theme & Language toggles */}
      <div
        className="flex items-center h-full shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={toggleTheme}
          className="h-full flex items-center gap-1.5 px-3 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors text-xs"
          title={settings?.theme === 'light' ? t('titlebar.theme.dark') : t('titlebar.theme.light')}
        >
          {settings?.theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
        </button>
        <button
          onClick={toggleLanguage}
          className="h-full flex items-center gap-1.5 px-3 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors text-xs"
          title={t('titlebar.language')}
        >
          <Globe size={13} />
          <span className="font-medium">{language.toUpperCase()}</span>
        </button>
      </div>

      {/* Windows window controls */}
      {platform !== 'darwin' && (
        <div
          className="flex items-center h-full shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => window.lstack.system.minimize()}
            className="w-11 h-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
            title={t('titlebar.minimize')}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => window.lstack.system.maximize()}
            className="w-11 h-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
            title={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}
          >
            {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => window.lstack.system.closeWindow()}
            className="w-11 h-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600 transition-colors"
            title={t('titlebar.close')}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
