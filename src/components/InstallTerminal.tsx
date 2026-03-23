import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function InstallTerminal({ type = 'project' }: { type?: 'project' | 'package' }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const xterm = new Terminal({
      theme: { background: '#0d1117', foreground: '#c9d1d9' },
      fontFamily: 'Consolas, monospace',
      fontSize: 12,
      convertEol: true,
      disableStdin: true
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(mountRef.current);

    setTimeout(() => fitAddon.fit(), 50);

    const handler = (data: string) => xterm.write(data);
    let unsub = () => {};

    if (type === 'project') {
      unsub = window.lstack.project.onInstallLog(handler);
    } else if (type === 'package') {
      unsub = window.lstack.package.onInstallLog(handler);
    }

    return () => {
      unsub();
      xterm.dispose();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full p-2" />;
}