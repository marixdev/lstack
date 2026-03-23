import type { IPty } from 'node-pty';

// node-pty is a native module — require() to ensure it's loaded at runtime, not bundled
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodePty = require('node-pty') as typeof import('node-pty');

export interface TerminalSession {
  id: string;
  projectName: string;
  cwd: string;
  pty: IPty;
}

export class TerminalManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private onData: (id: string, data: string) => void;
  private onExit: (id: string) => void;

  constructor(
    onData: (id: string, data: string) => void,
    onExit: (id: string) => void = () => {},
  ) {
    this.onData = onData;
    this.onExit = onExit;
  }

  create(id: string, cwd: string, projectName = id): void {
    // Kill existing session with same id if any
    if (this.sessions.has(id)) {
      this.kill(id);
    }

    const shell = process.platform === 'win32'
      ? (process.env.ComSpec || 'cmd.exe')
      : (process.env.SHELL || '/bin/bash');

    const pty = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: process.env as Record<string, string>,
    });

    pty.onData((data: string) => {
      this.onData(id, data);
    });

    pty.onExit(() => {
      this.sessions.delete(id);
      this.onExit(id);
    });

    this.sessions.set(id, { id, projectName, cwd, pty });
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) session.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session) session.pty.resize(cols, rows);
  }

  kill(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      try { session.pty.kill(); } catch { /* ignore */ }
      this.sessions.delete(id);
    }
  }

  killAll(): void {
    for (const id of this.sessions.keys()) {
      this.kill(id);
    }
  }

  isAlive(id: string): boolean {
    return this.sessions.has(id);
  }
}
