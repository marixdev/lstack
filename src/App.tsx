import { useEffect, useRef, useState } from 'react';
import { Packages } from './pages/Packages';
import { Projects } from './pages/Projects';
import { Settings } from './pages/Settings';
import { PhpProfiles } from './pages/PhpProfiles';
import { PortManager } from './pages/PortManager';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { TerminalView, disposeTerminal } from './components/TerminalView';
import { LogModal } from './components/LogModal';
import { AboutModal } from './components/AboutModal';
import { ToastContainer } from './components/Toast';
import { useUIStore, useServiceStore, useSettingsStore, usePackageStore, useTerminalStore } from './store';
import { useTranslation } from './i18n';

type Tab = 'packages' | 'projects' | 'settings' | 'php-profiles' | 'port-manager';

export default function App() {
    const { t } = useTranslation();
    const { activeTab, setActiveTab, setPlatform } = useUIStore();
    const { setServices, addLog } = useServiceStore();
    const { settings, setSettings } = useSettingsStore();
    const { setInstalledVersions } = usePackageStore();
    const { tabs: terminalTabs } = useTerminalStore();
    const [ready, setReady] = useState(false);
    const prevTabsRef = useRef(terminalTabs);

    // Apply theme class on <html> whenever settings change
    useEffect(() => {
      const root = document.documentElement;
      if (settings?.theme === 'light') {
        root.classList.add('light');
      } else {
        root.classList.remove('light');
      }
    }, [settings?.theme]);

    useEffect(() => {
      const api = window.lstack;

      Promise.all([
        api.service.getStatuses(),
        api.settings.get(),
        api.package.getInstalled(),
        api.system.getPlatform(),
      ]).then(([statuses, settings, installed, platform]) => {
        setServices(statuses);
        setSettings(settings);
        setInstalledVersions(installed);
        setPlatform(platform);
        setReady(true);
    });

    const unsubLog = api.service.onLog(addLog);
    const unsubStatus = api.service.onStatusUpdate(setServices);

    return () => {
      unsubLog();
      unsubStatus();
    };
  }, []);

  // When all terminal tabs are closed, go back to Projects
  useEffect(() => {
    if (terminalTabs.length === 0 && activeTab === '__terminal__') {
      setActiveTab('projects');
    }
  }, [terminalTabs, activeTab]);

  // Dispose terminal PTY + xterm when a tab is closed via the store
  useEffect(() => {
    const prev = prevTabsRef.current;
    const removed = prev.filter((t) => !terminalTabs.find((t2) => t2.id === t.id));
    removed.forEach((t) => disposeTerminal(t.id));
    prevTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  const renderPage = () => {
    switch (activeTab as Tab) {
      case 'packages': return <Packages />;
      case 'projects': return <Projects />;
      case 'settings': return <Settings />;
      case 'php-profiles': return <PhpProfiles />;
      case 'port-manager': return <PortManager />;
      default: return <Projects />;
    }
  };

  if (!ready) {
    return (
      <div className="flex flex-col h-screen bg-slate-950">
        <div className="h-10 bg-slate-900 border-b border-slate-700/80" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">{t('app.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  const isTerminalActive = activeTab === '__terminal__';

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Custom title bar with terminal tabs */}
      <TitleBar />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — always visible */}
        <Sidebar activeTab={isTerminalActive ? '' : activeTab} onTabChange={setActiveTab} />

        {/* Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {isTerminalActive ? (
            <TerminalView />
          ) : (
            <div className="flex-1 overflow-auto">
              {renderPage()}
            </div>
          )}
        </main>
      </div>

      {/* Global Modals */}
      <LogModal />
      <AboutModal />
      <ToastContainer />
    </div>
  );
}
