import { Menu, BrowserWindow, MenuItemConstructorOptions, shell } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import type { LStackSettings } from '../../src/types';

export async function showApacheContextMenu(
  window: BrowserWindow | null,
  settings: LStackSettings
) {
  if (!window) return;

  const etcDir = path.join(settings.dataDir, 'etc', 'apache2');
  const logsDir = path.join(settings.dataDir, 'logs', 'apache2');
  const sitesDir = path.join(etcDir, 'sites-enabled');

  const confPath = path.join(etcDir, 'httpd.conf');

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
          label: 'httpd.conf',
          click: () => fs.pathExists(confPath).then(e => { if (e) shell.openPath(confPath) })
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

export async function showMariaDBContextMenu(
  window: BrowserWindow | null,
  settings: LStackSettings
) {
  if (!window) return;

  const dataDir = path.join(settings.dataDir, 'data', 'mariadb');
  const myIni = path.join(dataDir, 'my.ini'); 

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Open Data Directory',
      click: () => fs.ensureDir(dataDir).then(() => shell.openPath(dataDir))
    },
    {
      label: 'Edit my.ini (if exists)',
        click: () => fs.pathExists(myIni).then(e => { if (e) shell.openPath(myIni) })
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window });
}

export async function showPostgreSqlContextMenu(
  window: BrowserWindow | null,
  settings: LStackSettings
) {
  if (!window) return;

  const dataDir = path.join(settings.dataDir, 'data', 'postgresql');
  const confPath = path.join(dataDir, 'postgresql.conf');
  const hbaPath = path.join(dataDir, 'pg_hba.conf');

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Open Data Directory',
      click: () => fs.ensureDir(dataDir).then(() => shell.openPath(dataDir))
    },
    { type: 'separator' },
    {
      label: 'Edit Configuration',
      submenu: [
        {
          label: 'postgresql.conf',
            click: () => fs.pathExists(confPath).then(e => { if (e) shell.openPath(confPath) })
        },
        {
          label: 'pg_hba.conf',
            click: () => fs.pathExists(hbaPath).then(e => { if (e) shell.openPath(hbaPath) })
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window });
}

export async function showRedisContextMenu(
  window: BrowserWindow | null,
  settings: LStackSettings
) {
  if (!window) return;

  const redisVer = settings.redisVersion || '7.2.4';
  const redisPath = path.join(settings.binDir, 'redis', `redis-${redisVer}`);
  const confPath = path.join(redisPath, 'redis.conf');

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Edit redis.conf',
        click: () => fs.pathExists(confPath).then(e => { if (e) shell.openPath(confPath) })
    },
    {
      label: 'Open Redis Directory',
      click: () => fs.ensureDir(redisPath).then(() => shell.openPath(redisPath))
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window });
}

export async function showMailpitContextMenu(
  window: BrowserWindow | null,
  settings: LStackSettings
) {
  if (!window) return;

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Open Web UI (Port 8025)',
      click: () => shell.openExternal('http://127.0.0.1:8025')
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window });
}

export async function showMemcachedContextMenu(
  window: BrowserWindow | null,
  settings: LStackSettings
) {
  if (!window) return;

  const memVer = settings.memcachedVersion || '1.6.22';
  const memPath = path.join(settings.binDir, 'memcached', `memcached-${memVer}`);

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Open Memcached Directory',
      click: () => fs.ensureDir(memPath).then(() => shell.openPath(memPath))
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window });
}

