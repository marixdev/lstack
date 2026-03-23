import { Menu, BrowserWindow, MenuItemConstructorOptions, shell } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import type { LStackSettings } from '../../src/types';
import type { ServiceManager } from '../core/ServiceManager';
import type { VHostManager } from '../core/VHostManager';

export async function showPhpContextMenu(
  window: BrowserWindow | null,
  settings: LStackSettings,
  serviceManager: ServiceManager,
  vhostManager: VHostManager,
) {
  if (!window) return;

  const version = settings.phpVersion;
  if (!version) return;

  const phpDir = path.join(settings.binDir, 'php', `php-${version}`);
  const iniPath = path.join(phpDir, 'php.ini');

  if (!await fs.pathExists(iniPath)) return;

  let iniContent = await fs.readFile(iniPath, 'utf8');

  // Helper to test if a string matches
  const hasExt = (ext: string): boolean => {
    const rx = new RegExp(`^extension\\s*=\\s*(?:php_)?${ext}(?:\\.dll)?\\s*$`, 'm');
    return rx.test(iniContent);
  };
  
  const hasZendExt = (ext: string): boolean => {
    const rx = new RegExp(`^zend_extension\\s*=\\s*${ext}\\s*$`, 'm');
    return rx.test(iniContent);
  };

  const getVal = (key: string): string | null => {
    const rx = new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm');
    const m = iniContent.match(rx);
    return m ? m[1].trim() : null;
  };

  const toggleExt = async (ext: string, isZend = false) => {
    const prefix = isZend ? 'zend_extension' : 'extension';
    const rxSearch = new RegExp(`^;?\\s*${prefix}\\s*=\\s*(?:php_)?${ext}(?:\\.dll)?\\s*$`, 'm');
    
    // Check if currently enabled
    const rxEnabled = new RegExp(`^${prefix}\\s*=\\s*(?:php_)?${ext}(?:\\.dll)?\\s*$`, 'm');
    const isEnabled = rxEnabled.test(iniContent);

    if (isEnabled) {
      // Disable
      iniContent = iniContent.replace(rxSearch, `;${prefix}=${ext}`);
    } else {
      // Enable
      iniContent = iniContent.replace(rxSearch, `${prefix}=${ext}`);
      // If it wasn't in the file at all, append it
      if (!rxSearch.test(iniContent)) {
        iniContent += `\n${prefix}=${ext}\n`;
      }
    }
    
    await fs.writeFile(iniPath, iniContent);
    await vhostManager.restartAllPhpRuntimes().catch(() => serviceManager.restart('php-fpm'));
  };

  const setVal = async (key: string, val: string) => {
    const rx = new RegExp(`^;?\\s*${key}\\s*=.*$`, 'm');
    if (rx.test(iniContent)) {
      iniContent = iniContent.replace(rx, `${key} = ${val}`);
    } else {
      iniContent += `\n${key} = ${val}\n`;
    }
    await fs.writeFile(iniPath, iniContent);
    await vhostManager.restartAllPhpRuntimes().catch(() => serviceManager.restart('php-fpm'));
  };

  const buildSubMenuVal = (key: string, opts: string[]): MenuItemConstructorOptions[] => {
    const current = getVal(key);
    return opts.map(opt => ({
      label: opt,
      type: 'radio',
      checked: current === opt,
      click: () => setVal(key, opt)
    }));
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'xdebug',
      type: 'checkbox',
      checked: hasZendExt('xdebug') || hasExt('xdebug'),
      click: () => toggleExt('xdebug', true) // assuming zend_extension for xdebug
    },
    { type: 'separator' },
    {
      label: 'max_execution_time',
      submenu: buildSubMenuVal('max_execution_time', ['30', '60', '120', '300', '600', '36000'])
    },
    {
      label: 'upload_max_filesize',
      submenu: buildSubMenuVal('upload_max_filesize', ['2M', '10M', '32M', '64M', '128M', '256M', '512M', '1G', '2G'])
    },
    {
      label: 'post_max_size',
      submenu: buildSubMenuVal('post_max_size', ['8M', '16M', '32M', '64M', '128M', '256M', '512M', '1G', '2G'])
    },
    {
      label: 'memory_limit',
      submenu: buildSubMenuVal('memory_limit', ['128M', '256M', '512M', '1G', '2G', '-1'])
    },
    { type: 'separator' },
    {
      label: 'PHP Extensions',
      submenu: [
        'bz2', 'curl', 'com_dotnet', 'dba', 'enchant', 'exif', 'ffi', 'fileinfo',
        'ftp', 'gd', 'gettext', 'gmp', 'imap', 'intl', 'ldap', 'mbstring',
        'mysqli', 'oci8_12c', 'oci8_19', 'odbc', 'opcache', 'openssl', 'pdo_firebird',
        'pdo_mysql', 'pdo_oci', 'pdo_odbc', 'pdo_pgsql', 'pdo_sqlite', 'pgsql',
        'shmop', 'snmp', 'soap', 'sockets', 'sodium', 'sqlite3', 'sysvdir',
        'tidy', 'xmlrpc', 'xsl', 'zip'
      ].map(ext => ({
        label: ext,
        type: 'checkbox',
        checked: hasExt(ext),
        click: () => toggleExt(ext)
      }))
    },
    { type: 'separator' },
    {
      label: 'Edit php.ini',
      click: () => {
        shell.openPath(iniPath);
      }
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window });
}
