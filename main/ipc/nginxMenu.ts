import { Menu, BrowserWindow, MenuItemConstructorOptions, shell } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import type { LStackSettings } from '../../src/types';

export async function showNginxContextMenu(
  window: BrowserWindow | null,
  settings: LStackSettings
) {
  if (!window) return;

  const etcDir = path.join(settings.dataDir, 'etc', 'nginx');
  const logsDir = path.join(settings.dataDir, 'logs', 'nginx');
  const sitesDir = path.join(etcDir, 'sites-enabled');

  const confPath = path.join(etcDir, 'nginx.conf');
  const mimePath = path.join(etcDir, 'mime.types');
  const fcgiPath = path.join(etcDir, 'fastcgi_params');

  let vhostItems: MenuItemConstructorOptions[] = [];
  try {
    if (await fs.pathExists(sitesDir)) {
      const files = await fs.readdir(sitesDir);
      for (const file of files) {
        if (file.endsWith('.conf')) {
          vhostItems.push({
            label: file,
            click: () => shell.openPath(path.join(sitesDir, file))
          });
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  if (vhostItems.length > 0) {
    vhostItems.push({ type: 'separator' });
  }
  vhostItems.push({
    label: 'Open sites-enabled directory',
    click: () => fs.ensureDir(sitesDir).then(() => shell.openPath(sitesDir))
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Edit Configuration',
      submenu: [
        {
          label: 'nginx.conf',
          click: () => fs.pathExists(confPath).then(e => { if (e) shell.openPath(confPath); })
        },
        {
          label: 'mime.types',
          click: () => fs.pathExists(mimePath).then(e => { if (e) shell.openPath(mimePath); })
        },
        {
          label: 'fastcgi_params',
          click: () => fs.pathExists(fcgiPath).then(e => { if (e) shell.openPath(fcgiPath); })
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Virtual Hosts',
      submenu: vhostItems
    },
    { type: 'separator' },
    {
      label: 'Logs',
      submenu: [
        {
          label: 'access.log',
          click: () => {
            const p = path.join(logsDir, 'access.log');
            fs.pathExists(p).then(e => { if (e) shell.openPath(p) });
          }
        },
        {
          label: 'error.log',
          click: () => {
            const p = path.join(logsDir, 'error.log');
            fs.pathExists(p).then(e => { if (e) shell.openPath(p) });
          }
        },
        {
          label: 'Open Logs directory',
          click: () => fs.ensureDir(logsDir).then(() => shell.openPath(logsDir))
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window });
}
