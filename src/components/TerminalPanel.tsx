import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X, Minus, ChevronDown, TerminalSquare } from 'lucide-react';
import { useTranslation } from '../i18n';
import '@xterm/xterm/css/xterm.css';

export interface TerminalTab {
  id: string;
  projectName: string;
  cwd: string;
}

interface TerminalPanelProps {
  tabs: TerminalTab[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: () => void;
  height?: number;
}

// ─── Single xterm.js instance ────────────────────────────────────────────────
interface XTermInstanceProps {
  id: string;
  cwd: string;
  projectName: string;
  visible: boolean;
}

function XTermInstance({ id, cwd, projectName, visible }: XTermInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const unsubExitRef = useRef<(() => void) | null>(null);
  const initializedRef = useRef(false);

  const fit = useCallback(() => {
    if (fitRef.current && termRef.current && containerRef.current) {
      try {
        fitRef.current.fit();
        const { cols, rows } = termRef.current;
        window.lstack.terminal.resize(id, cols, rows);
      } catch {
        // ignore during unmount
      }
    }
  }, [id]);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f7840',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current = fitAddon;

    // Fit after a tick so the container has its dimensions
    setTimeout(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      // Create PTY session in main process
      window.lstack.terminal.create(id, cwd, projectName).then(() => {
        window.lstack.terminal.resize(id, cols, rows);
      });
    }, 50);

    // Forward user keystrokes to PTY
    term.onData((data) => {
      window.lstack.terminal.write(id, data);
    });

    // Receive PTY output
    const unsubData = window.lstack.terminal.onData((termId: string, data: string) => {
      if (termId === id) {
        term.write(data);
      }
    });
    unsubRef.current = unsubData;

    // Handle PTY exit
    const unsubExit = window.lstack.terminal.onExit((termId: string) => {
      if (termId === id) {
        term.write('\r\n\x1b[2m[Process exited — press any key to restart]\x1b[0m');
        // Re-create on any key
        const disposable = term.onData(() => {
          disposable.dispose();
          term.reset();
          window.lstack.terminal.create(id, cwd, projectName).then(() => {
            if (fitRef.current) {
              fitRef.current.fit();
              window.lstack.terminal.resize(id, term.cols, term.rows);
            }
          });
        });
      }
    });
    unsubExitRef.current = unsubExit;

    // ResizeObserver to keep terminal sized to container
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => { fit(); });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      unsubRef.current?.();
      unsubExitRef.current?.();
      term.dispose();
      // Kill the PTY process — critical for React StrictMode which runs
      // effects twice in dev (mount → cleanup → mount). Without this, the
      // second mount calls terminal:create which kills the running session,
      // triggering onExit and showing "[Process exited]" immediately.
      window.lstack.terminal.kill(id);
      termRef.current = null;
      fitRef.current = null;
      initializedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit when panel becomes visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => { fit(); });
    }
  }, [visible, fit]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
}

// ─── TerminalPanel ────────────────────────────────────────────────────────────
export function TerminalPanel({
  tabs,
  activeId,
  onActivate,
  onClose,
  onMinimize,
  height = 300,
}: TerminalPanelProps) {
  const { t } = useTranslation();

  if (tabs.length === 0) return null;

  return (
    <div
      className="flex flex-col border-t border-slate-700 bg-[#0d1117]"
      style={{ height }}
    >
      {/* Tab bar */}
      <div className="flex items-center bg-slate-900 border-b border-slate-700 min-h-[36px] shrink-0">
        <div className="flex items-center gap-0.5 px-2 flex-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onActivate(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t whitespace-nowrap transition-colors group/tab ${
                activeId === tab.id
                  ? 'bg-[#0d1117] text-slate-100 border-t-2 border-t-blue-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <TerminalSquare size={11} className="shrink-0" />
              {tab.projectName}
              <span
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className="ml-1 p-0.5 rounded opacity-0 group-hover/tab:opacity-100 hover:bg-red-600 hover:text-white transition-all cursor-pointer"
              >
                <X size={10} />
              </span>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button
            onClick={onMinimize}
            title={t('terminal.minimize')}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Terminal content area */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0 p-1"
            style={{ display: activeId === tab.id ? 'block' : 'none' }}
          >
            <XTermInstance
              id={tab.id}
              cwd={tab.cwd}
              projectName={tab.projectName}
              visible={activeId === tab.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
