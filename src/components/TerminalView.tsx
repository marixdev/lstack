/**
 * TerminalView — full-screen terminal with global Map persistence.
 *
 * Uses a module-level Map (outside React) to keep xterm instances alive
 * across React StrictMode double-invocations, tab switches, and re-renders.
 * Pattern adapted from marix (Terminal.tsx).
 */
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTerminalStore } from '../store';
import { useTranslation } from '../i18n';
import '@xterm/xterm/css/xterm.css';

interface TerminalEntry {
  xterm: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  unsubData: () => void;
  unsubExit: () => void;
}

// ─── Global registry — persists across React lifecycle ────────────────────────
const terminalRegistry = new Map<string, TerminalEntry>();

export function disposeTerminal(id: string) {
  const entry = terminalRegistry.get(id);
  if (entry) {
    entry.unsubData();
    entry.unsubExit();
    entry.xterm.dispose();
    if (entry.container.parentElement) {
      entry.container.parentElement.removeChild(entry.container);
    }
    terminalRegistry.delete(id);
  }
  window.lstack.terminal.kill(id);
}

// ─── Single terminal instance ─────────────────────────────────────────────────
interface Props {
  id: string;
  cwd: string;
  projectName: string;
}

export function TerminalInstance({ id, cwd, projectName }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const existing = terminalRegistry.get(id);

    if (existing) {
      // Reattach — just move the container DOM node back in
      mountRef.current.appendChild(existing.container);
      setTimeout(() => {
        existing.fitAddon.fit();
        window.lstack.terminal.resize(id, existing.xterm.cols, existing.xterm.rows);
      }, 50);

      return () => {
        // Detach but keep alive (same pattern as marix)
        if (existing.container.parentElement) {
          existing.container.parentElement.removeChild(existing.container);
        }
      };
    }

    // ── Create new xterm instance ──────────────────────────────────────────
    const xterm = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f7840',
        black: '#484f58', red: '#ff7b72', green: '#3fb950',
        yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
        cyan: '#39c5cf', white: '#b1bac4',
        brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
        brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // Create a persistent container div (lives outside React tree)
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    mountRef.current.appendChild(container);
    xterm.open(container);

    // Forward user input to PTY
    xterm.onData((data) => {
      window.lstack.terminal.write(id, data);
    });

    // Receive PTY output
    const unsubData = window.lstack.terminal.onData((termId: string, data: string) => {
      if (termId === id) xterm.write(data);
    });

    // Handle PTY exit — offer restart on any key
    const unsubExit = window.lstack.terminal.onExit((termId: string) => {
      if (termId === id) {
        xterm.write('\r\n\x1b[2m[Process exited — press any key to restart]\x1b[0m');
        const disposable = xterm.onData(() => {
          disposable.dispose();
          xterm.reset();
          window.lstack.terminal.create(id, cwd, projectName).then(() => {
            fitAddon.fit();
            window.lstack.terminal.resize(id, xterm.cols, xterm.rows);
          });
        });
      }
    });

    // Start the PTY
    setTimeout(() => {
      fitAddon.fit();
      window.lstack.terminal.create(id, cwd, projectName).then(() => {
        window.lstack.terminal.resize(id, xterm.cols, xterm.rows);
      });
    }, 50);

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        window.lstack.terminal.resize(id, xterm.cols, xterm.rows);
      });
    });
    observer.observe(container);

    terminalRegistry.set(id, { xterm, fitAddon, container, unsubData, unsubExit });

    return () => {
      observer.disconnect();
      // Detach but keep alive — the PTY keeps running in main process
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mountRef} className="w-full h-full" />;
}

// ─── TerminalView — renders all open terminal tabs, shows the active one ──────
export function TerminalView() {
  const { tabs, activeId } = useTerminalStore();
  const { t } = useTranslation();

  return (
    <div className="flex-1 bg-[#0d1117] overflow-hidden relative">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="absolute inset-0"
          style={{ display: activeId === tab.id ? 'block' : 'none' }}
        >
          <TerminalInstance id={tab.id} cwd={tab.cwd} projectName={tab.projectName} />
        </div>
      ))}
      {tabs.length === 0 && (
        <div className="flex items-center justify-center h-full text-slate-600 text-sm">
          {t('terminal.empty')}
        </div>
      )}
    </div>
  );
}
