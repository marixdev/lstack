import { IpcMain, Shell, Dialog, BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import axios from 'axios';
import extractZip from 'extract-zip';
import { showPhpContextMenu } from './phpMenu';
import { showNginxContextMenu } from './nginxMenu';
import {
  showApacheContextMenu,
  showMariaDBContextMenu,
  showPostgreSqlContextMenu,
  showRedisContextMenu,
  showMemcachedContextMenu,
  showMailpitContextMenu,
} from './serviceMenus';
import type { ServiceManager } from '../core/ServiceManager';
import type { PackageManager } from '../core/PackageManager';
import type { VHostManager } from '../core/VHostManager';
import type { CertManager } from '../core/CertManager';
import type { TerminalManager } from '../core/TerminalManager';
import type { LStackSettings, ServiceName } from '../../src/types';

interface IpcContext {
  ipcMain: IpcMain;
  settings: LStackSettings;
  saveSettings: (s: LStackSettings) => Promise<void>;
  serviceManager: ServiceManager;
  packageManager: PackageManager;
  vhostManager: VHostManager;
  certManager: CertManager;
  terminalManager: TerminalManager;
  shell: Shell;
  dialog: Dialog;
  mainWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(ctx: IpcContext) {
  const {
    ipcMain, serviceManager, packageManager, vhostManager,
    certManager, terminalManager, shell, dialog,
  } = ctx;
  let settings = ctx.settings;

  const activeVersionForCategory = (categoryId: string): string | undefined => {
    if (categoryId === 'php') return settings.phpVersion;
    if (categoryId === 'mariadb' || categoryId === 'mysql') return settings.mariadbVersion;
    if (categoryId === 'nginx') return settings.nginxVersion;
    if (categoryId === 'apache') return settings.apacheVersion;
    if (categoryId === 'redis') return settings.redisVersion;
    if (categoryId === 'memcached') return settings.memcachedVersion;
    if (categoryId === 'mailpit') return settings.mailpitVersion;
    if (categoryId === 'postgresql') return settings.postgresqlVersion;
    if (categoryId === 'phpmyadmin') return settings.phpmyadminVersion;
    return undefined;
  };

  // ── Services ──────────────────────────────────────────────────────────────

  ipcMain.handle('service:start', async (_, name: ServiceName) => {
    await serviceManager.start(name);
  });

  ipcMain.handle('service:stop', async (_, name: ServiceName) => {
    await serviceManager.stop(name);
  });

  ipcMain.handle('service:restart', async (_, name: ServiceName) => {
    await serviceManager.restart(name);
  });

  ipcMain.handle('service:contextMenu', async (_, name: ServiceName) => {
    if (name === 'php-fpm') {
      await showPhpContextMenu(ctx.mainWindow(), settings, serviceManager, vhostManager);
    } else if (name === 'nginx') {
      await showNginxContextMenu(ctx.mainWindow(), settings);
    } else if (name === 'apache') {
      await showApacheContextMenu(ctx.mainWindow(), settings);
    } else if (name === 'mariadb') {
      await showMariaDBContextMenu(ctx.mainWindow(), settings);
    } else if (name === 'postgresql') {
      await showPostgreSqlContextMenu(ctx.mainWindow(), settings);
    } else if (name === 'redis') {
      await showRedisContextMenu(ctx.mainWindow(), settings);
    } else if (name === 'memcached') {
      await showMemcachedContextMenu(ctx.mainWindow(), settings);
    } else if (name === 'mailpit') {
      await showMailpitContextMenu(ctx.mainWindow(), settings);
    }
  });

  ipcMain.handle('service:status', async () => serviceManager.getStatuses());

  ipcMain.handle('service:getProcessesOnPort', async (_, port: number) =>
    serviceManager.getProcessesOnPort(port));

  ipcMain.handle('service:killProcess', async (_, pid: string) =>
    serviceManager.killProcess(pid));

  // ── Packages ──────────────────────────────────────────────────────────────

  ipcMain.handle('package:list', async () => {
    return packageManager.getCategories().map((cat) => {
      const activeVersion = activeVersionForCategory(cat.id);
      return {
        ...cat,
        versions: cat.versions.map((v) => ({
          ...v,
          isActive: activeVersion === v.version,
        })),
      };
    });
  });

  ipcMain.handle('package:getInstalled', async () => packageManager.getInstalledVersions());

  ipcMain.handle('package:install', async (_, categoryId: string, version: string) => {
    await packageManager.install(categoryId, version);

    const shouldAutoSwitch =
      (categoryId === 'php' && settings.phpVersion !== version) ||
      (categoryId === 'mariadb' && settings.mariadbVersion !== version) ||
      (categoryId === 'nginx' && settings.nginxVersion !== version) ||
      (categoryId === 'apache' && settings.apacheVersion !== version) ||
      (categoryId === 'redis' && settings.redisVersion !== version) ||
      (categoryId === 'memcached' && settings.memcachedVersion !== version) ||
      (categoryId === 'mailpit' && settings.mailpitVersion !== version) ||
      (categoryId === 'postgresql' && settings.postgresqlVersion !== version);

    if (shouldAutoSwitch) {
      if (categoryId === 'php') settings = { ...settings, phpVersion: version };
      if (categoryId === 'mariadb') settings = { ...settings, mariadbVersion: version };
      if (categoryId === 'nginx') settings = { ...settings, nginxVersion: version };
      if (categoryId === 'apache') settings.apacheVersion = version;
      if (categoryId === 'redis') settings.redisVersion = version;
      if (categoryId === 'memcached') settings.memcachedVersion = version;
      if (categoryId === 'mailpit') settings.mailpitVersion = version;
      if (categoryId === 'postgresql') settings.postgresqlVersion = version;
      await ctx.saveSettings(settings);
      serviceManager.updateSettings(settings);
    }

    if (categoryId === 'phpmyadmin') {
      const pmaDir = packageManager.getInstallPath('phpmyadmin', version);
      await vhostManager.generateNginxMainConf(pmaDir);
    }
  });

  ipcMain.handle('package:uninstall', async (_, categoryId: string, version: string) => {
    const currentActive = activeVersionForCategory(categoryId);
    if (currentActive === version) {
      let svcName: ServiceName | null = null;
      if (categoryId === 'php') svcName = 'php-fpm';
      else if (categoryId === 'mariadb') svcName = 'mariadb';
      else if (categoryId === 'nginx') svcName = 'nginx';
      else if (categoryId === 'apache') svcName = 'apache';
      else if (categoryId === 'redis') svcName = 'redis';
      else if (categoryId === 'memcached') svcName = 'memcached';
      else if (categoryId === 'mailpit') svcName = 'mailpit';
      else if (categoryId === 'postgresql') svcName = 'postgresql';

      if (svcName) await serviceManager.stop(svcName).catch(() => {});

      if (categoryId === 'php') settings = { ...settings, phpVersion: '' };
      else if (categoryId === 'mariadb') settings = { ...settings, mariadbVersion: '' };
      else if (categoryId === 'nginx') settings = { ...settings, nginxVersion: '' };
      else if (categoryId === 'apache') settings = { ...settings, apacheVersion: '' };
      else if (categoryId === 'redis') settings = { ...settings, redisVersion: '' };
      else if (categoryId === 'memcached') settings = { ...settings, memcachedVersion: '' };
      else if (categoryId === 'mailpit') settings = { ...settings, mailpitVersion: '' };
      else if (categoryId === 'postgresql') settings = { ...settings, postgresqlVersion: '' };

      await ctx.saveSettings(settings);
      serviceManager.updateSettings(settings);
    }
    await packageManager.uninstall(categoryId, version);
  });

  ipcMain.handle('package:switch', async (_, category: string, version: string) => {
    const previousVersion = activeVersionForCategory(category);
    if (previousVersion === version) return;

    if (category === 'php') settings = { ...settings, phpVersion: version };
    else if (category === 'mariadb') settings = { ...settings, mariadbVersion: version };
    else if (category === 'nginx') settings = { ...settings, nginxVersion: version };
    else if (category === 'apache') settings = { ...settings, apacheVersion: version };
    else if (category === 'redis') settings = { ...settings, redisVersion: version };
    else if (category === 'memcached') settings = { ...settings, memcachedVersion: version };
    else if (category === 'mailpit') settings = { ...settings, mailpitVersion: version };
    else if (category === 'postgresql') settings = { ...settings, postgresqlVersion: version };

    await ctx.saveSettings(settings);
    serviceManager.updateSettings(settings);

    const serviceMap: Record<string, ServiceName> = {
      php: 'php-fpm', mariadb: 'mariadb', nginx: 'nginx', apache: 'apache',
      redis: 'redis', memcached: 'memcached', mailpit: 'mailpit', postgresql: 'postgresql',
    };
    const svc = serviceMap[category];
    if (svc) {
      const current = serviceManager.getStatuses().find((s) => s.name === svc);
      if (current?.status === 'running') {
        await serviceManager.restart(svc).catch(() => {});
      }
    }
  });

  // ── Projects ──────────────────────────────────────────────────────────────

  ipcMain.handle('project:list', async () => {
    const wwwDir = settings.wwwDir;
    if (!await fs.pathExists(wwwDir)) return [];

    const entries = await fs.readdir(wwwDir, { withFileTypes: true });
    const projects = [];

    // Load vhost data for profile/port info
    const vhostList = await vhostManager.list().catch(() => [] as any[]);
    const vhostMap = new Map(vhostList.map((v: any) => [v.name, v]));

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(wwwDir, entry.name);

      const hasGit = await fs.pathExists(path.join(dirPath, '.git'));
      const hasComposer = await fs.pathExists(path.join(dirPath, 'composer.json'));
      const hasPackageJson = await fs.pathExists(path.join(dirPath, 'package.json'));

      let framework: string | undefined;
      if (await fs.pathExists(path.join(dirPath, 'artisan'))) {
        framework = 'laravel';
      } else if (
        await fs.pathExists(path.join(dirPath, 'wp-config.php')) ||
        await fs.pathExists(path.join(dirPath, 'wp-login.php'))
      ) {
        framework = 'wordpress';
      } else if (await fs.pathExists(path.join(dirPath, 'symfony.lock'))) {
        framework = 'symfony';
      } else if (await fs.pathExists(path.join(dirPath, 'spark'))) {
        framework = 'codeigniter';
      } else if (await fs.pathExists(path.join(dirPath, 'core/lib/Drupal.php'))) {
        framework = 'drupal';
      } else if (
        await fs.pathExists(path.join(dirPath, 'administrator/index.php')) &&
        await fs.pathExists(path.join(dirPath, 'libraries/src/Version.php'))
      ) {
        framework = 'joomla';
      } else if (
        await fs.pathExists(path.join(dirPath, 'config/defines.inc.php')) ||
        await fs.pathExists(path.join(dirPath, 'app/config/parameters.php'))
      ) {
        framework = 'prestashop';
      }

      projects.push({
        name: entry.name,
        path: dirPath,
        hostname: `${entry.name}.${settings.domain}`,
        hasGit,
        hasComposer,
        hasPackageJson,
        framework,
        vhost: vhostMap.get(entry.name) ?? undefined,
      });
    }
    return projects;
  });

  // ─── Project create helpers ───────────────────────────────────────────────

  const compareVersions = (a: string, b: string): number => {
    const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  const getDefaultProfileForFramework = (fw: string): string =>
    fw === 'wordpress' ? 'wordpress'
      : fw === 'laravel' ? 'laravel'
      : fw === 'symfony' ? 'symfony'
      : fw === 'codeigniter' ? 'codeigniter'
      : 'minimal';

  const getPhpVersionForFramework = (fw: string, fwVersion?: string): string => {
    if (fw === 'laravel') {
      if (fwVersion === '12' || fwVersion === '11') return '8.2.27';
      if (fwVersion === '10') return '8.1.31';
      if (fwVersion === '9') return '8.2.27';
      if (fwVersion === '8') return '8.1.31';
    }
    if (fw === 'symfony') {
      if (fwVersion === '7.3' || fwVersion === '7.2') return '8.2.27';
      if (fwVersion === '6.4') return '8.1.31';
      if (fwVersion === '5.4') return '7.4.33';
    }
    if (fw === 'codeigniter') {
      return fwVersion === '3.1' ? '7.4.33' : '8.1.31';
    }
    if (fw === 'wordpress') {
      if (fwVersion && fwVersion !== 'latest' && compareVersions(fwVersion, '6.7') >= 0) return '8.1.31';
      if (fwVersion && fwVersion !== 'latest' && (compareVersions(fwVersion, '6.0') >= 0 || compareVersions(fwVersion, '5.0') >= 0)) return '7.4.33';
      return '8.1.31';
    }
    return settings.phpVersion;
  };

  const isFrameworkRequiringPhp = (fw: string): boolean =>
    ['wordpress', 'laravel', 'symfony', 'codeigniter'].includes(fw);

  const createAutoProfile = async (
    fw: string,
    fwVersion: string | undefined,
    phpVer: string,
    profileIdOverride?: string,
  ): Promise<string> => {
    const baseId = profileIdOverride || getDefaultProfileForFramework(fw);
    const baseProfile = await vhostManager.getPhpProfile(baseId);
    if (!baseProfile) return baseId;

    if (baseProfile.phpVersion === phpVer) return baseProfile.id;

    const allProfiles = await vhostManager.listPhpProfiles();
    const autoName = fwVersion
      ? `${baseProfile.name} ${fwVersion} (PHP ${phpVer})`
      : `${baseProfile.name} (PHP ${phpVer})`;
    const existing = allProfiles.find((p) => !p.isBuiltIn && p.name === autoName);
    if (existing) return existing.id;

    const created = await vhostManager.createPhpProfile({
      name: autoName,
      description: `${baseProfile.description} · Auto-generated for ${fw}${fwVersion ? ` ${fwVersion}` : ''}`,
      isBuiltIn: false,
      phpVersion: phpVer,
      phpSettings: { ...baseProfile.phpSettings },
      phpExtensions: [...baseProfile.phpExtensions],
    });
    return created.id;
  };

  ipcMain.handle(
    'project:create',
    async (_, name: string, template: string, opts?: {
      frameworkVersion?: string;
      phpVersion?: string;
      phpProfileId?: string;
      autoInstallPhp?: boolean;
      skipPhpInstallPrompt?: boolean;
    }) => {
      const projectDir = path.join(settings.wwwDir, name);
      const fwVersion = opts?.frameworkVersion;
      const phpVer = opts?.phpVersion || getPhpVersionForFramework(template, fwVersion);
      const profileId = isFrameworkRequiringPhp(template)
        ? await createAutoProfile(template, fwVersion, phpVer, opts?.phpProfileId)
        : (opts?.phpProfileId || getDefaultProfileForFramework(template));

      const log = (msg: string, level = 'info') =>
        ctx.mainWindow()?.webContents.send('service:log', {
          service: 'devstack', level, message: `[project] ${msg}`,
          timestamp: new Date().toISOString(),
        });

      const rawLog = (data: Buffer | string) => {
        ctx.mainWindow()?.webContents.send('project:create:raw', data.toString());
      };

      try {
        // Auto-install PHP if needed
        const installedPhpVersions = (await packageManager.getInstalledVersions()).php || [];
        if (phpVer && isFrameworkRequiringPhp(template) && !installedPhpVersions.includes(phpVer)) {
          let doInstall = opts?.autoInstallPhp === true;
          if (!doInstall && !opts?.skipPhpInstallPrompt) {
            const fwLabel = fwVersion ? `${template} ${fwVersion}` : template;
            const win = ctx.mainWindow();
            const msgOpts = {
              type: 'question' as const,
              buttons: ['Cài PHP', 'Hủy'],
              defaultId: 0,
              cancelId: 1,
              noLink: true,
              title: 'Thiếu phiên bản PHP phù hợp',
              message: `Project ${fwLabel} cần PHP ${phpVer}.`,
              detail: `Hiện hệ thống chưa có PHP ${phpVer}. Bạn có muốn cài ngay để tiếp tục tạo project không?`,
            };
            const result = win
              ? await dialog.showMessageBox(win, msgOpts)
              : await dialog.showMessageBox(msgOpts);
            doInstall = result.response === 0;
          }
          if (!doInstall) throw new Error(`Đã hủy vì chưa cài PHP ${phpVer}.`);
          log(`Đang cài PHP ${phpVer} theo yêu cầu của ${template} ${fwVersion || ''}...`);
          rawLog(`\x1b[36mĐang cài PHP ${phpVer}...\x1b[0m\r\n`);
          await packageManager.install('php', phpVer);
        }

        if (template === 'blank') {
          await fs.ensureDir(projectDir);
          await fs.writeFile(path.join(projectDir, 'index.php'), blankTemplate(name));

        } else if (template === 'wordpress') {
          const tmpFile = path.join(settings.dataDir, '.tmp', 'wordpress-latest.zip');
          const tmpExtract = path.join(settings.dataDir, '.tmp', 'wp-extract');
          await fs.ensureDir(path.dirname(tmpFile));
          log('Đang tải WordPress từ wordpress.org...');
          rawLog('\x1b[36mĐang tải WordPress từ wordpress.org...\x1b[0m\r\n');
          const wpTag = fwVersion && fwVersion !== 'latest' ? fwVersion : 'latest';
          const wpUrl = wpTag === 'latest'
            ? 'https://wordpress.org/latest.zip'
            : `https://wordpress.org/wordpress-${wpTag}.zip`;
          await downloadFile(wpUrl, tmpFile, log, rawLog);
          log('Đang giải nén WordPress...');
          rawLog('\x1b[36mĐang giải nén WordPress...\x1b[0m\r\n');
          await fs.ensureDir(tmpExtract);
          await extractZip(tmpFile, { dir: tmpExtract });
          const wpSrc = path.join(tmpExtract, 'wordpress');
          if (await fs.pathExists(wpSrc)) {
            await fs.move(wpSrc, projectDir, { overwrite: true });
          } else {
            await fs.move(tmpExtract, projectDir, { overwrite: true });
          }
          await fs.remove(tmpFile).catch(() => {});
          await fs.remove(tmpExtract).catch(() => {});
          log('WordPress đã được cài đặt thành công!');
          rawLog('\x1b[32m✔ WordPress đã được cài đặt thành công!\x1b[0m\r\n');

        } else if (['drupal', 'joomla', 'prestashop'].includes(template)) {
          const downloadConfigs: Record<string, { url: string; extractDir?: string }> = {
            drupal: {
              url: 'https://ftp.drupal.org/files/projects/drupal-11.0.0.zip',
              extractDir: 'drupal-11.0.0',
            },
            joomla: {
              url: 'https://downloads.joomla.org/cms/joomla5/5-2-2/Joomla_5-2-2-Stable-Full_Package.zip',
            },
            prestashop: {
              url: 'https://github.com/PrestaShop/PrestaShop/releases/download/8.1.7/prestashop_8.1.7.zip',
            },
          };
          const { url, extractDir } = downloadConfigs[template];
          const tmpFile = path.join(settings.dataDir, '.tmp', `${template}-latest.zip`);
          const tmpExtract = path.join(settings.dataDir, '.tmp', `${template}-extract`);
          await fs.ensureDir(path.dirname(tmpFile));
          log(`Đang tải ${template} từ ${url}...`);
          rawLog(`\x1b[36mĐang tải ${template}...\x1b[0m\r\n`);
          await downloadFile(url, tmpFile, log, rawLog);
          log(`Đang giải nén ${template}...`);
          rawLog(`\x1b[36mĐang giải nén ${template}...\x1b[0m\r\n`);
          await fs.ensureDir(tmpExtract);
          await extractZip(tmpFile, { dir: tmpExtract });
          const src = extractDir ? path.join(tmpExtract, extractDir) : tmpExtract;
          if (await fs.pathExists(src)) {
            await fs.move(src, projectDir, { overwrite: true });
          } else {
            await fs.move(tmpExtract, projectDir, { overwrite: true });
          }
          await fs.remove(tmpFile).catch(() => {});
          await fs.remove(tmpExtract).catch(() => {});
          log(`${template} đã được cài đặt thành công!`);
          rawLog(`\x1b[32m✔ ${template} đã được cài đặt thành công!\x1b[0m\r\n`);

        } else if (['laravel', 'symfony', 'codeigniter'].includes(template)) {
          await fs.ensureDir(projectDir);

          const pkgMap: Record<string, string> = {
            laravel: 'laravel/laravel',
            symfony: 'symfony/skeleton',
            codeigniter: 'codeigniter4/appstarter',
          };

          log(`Đang tạo project ${template} bằng Composer...`);
          rawLog(`\x1b[36mĐang tạo project ${template} bằng Composer...\x1b[0m\r\n`);

          const composerArgs: string[] = ['create-project'];

          if (template === 'laravel' && fwVersion) {
            composerArgs.push(pkgMap[template], '.', `^${fwVersion}.0`, '--prefer-dist', '--no-interaction');
          } else if (template === 'symfony' && fwVersion) {
            composerArgs.push(`${pkgMap[template]}:${fwVersion}.*`, '.', '--prefer-dist', '--no-interaction');
          } else if (template === 'codeigniter' && fwVersion === '3.1') {
            // CodeIgniter 3 — download zip instead of composer
            await downloadFile(
              'https://github.com/bcit-ci/CodeIgniter/archive/refs/tags/3.1.13.zip',
              path.join(settings.dataDir, '.tmp', 'codeigniter-3.zip'),
              log, rawLog,
            );
            await fs.ensureDir(path.join(settings.dataDir, '.tmp', 'codeigniter-3-extract'));
            await extractZip(
              path.join(settings.dataDir, '.tmp', 'codeigniter-3.zip'),
              { dir: path.join(settings.dataDir, '.tmp', 'codeigniter-3-extract') },
            );
            const ci3Src = path.join(settings.dataDir, '.tmp', 'codeigniter-3-extract', 'CodeIgniter-3.1.13');
            await fs.move(ci3Src, projectDir, { overwrite: true });
            await fs.remove(path.join(settings.dataDir, '.tmp', 'codeigniter-3.zip')).catch(() => {});
            await fs.remove(path.join(settings.dataDir, '.tmp', 'codeigniter-3-extract')).catch(() => {});
            log(`${template} project đã được tạo thành công!`);
            rawLog(`\x1b[32m✔ ${template} project đã được tạo thành công!\x1b[0m\r\n`);
          } else if (template === 'codeigniter' && fwVersion) {
            composerArgs.push(`${pkgMap[template]}:${fwVersion}.*`, '.', '--prefer-dist', '--no-interaction');
          } else {
            composerArgs.push(pkgMap[template], '.', '--prefer-dist', '--no-interaction');
          }

          // Only run composer if NOT CI3 zip method
          if (!(template === 'codeigniter' && fwVersion === '3.1')) {
            await runComposer(composerArgs, projectDir, log, {
              binDir: settings.binDir,
              phpVersion: phpVer,
            }, rawLog);
            log(`${template} project đã được tạo thành công!`);
            rawLog(`\x1b[32m✔ ${template} project đã được tạo thành công!\x1b[0m\r\n`);
          }
        } else {
          await fs.ensureDir(projectDir);
        }
      } catch (err: unknown) {
        await fs.remove(projectDir).catch(() => {});
        throw err;
      }

      // Auto-create database + write config file for frameworks that need DB
      if (isFrameworkRequiringDb(template)) {
        const dbName = name.replace(/[^a-zA-Z0-9_]/g, '_');
        try {
          await createDatabase(dbName, settings, serviceManager, log, rawLog);
          await writeDbConfig(template, projectDir, dbName, name, settings, log, rawLog);
        } catch (dbErr: unknown) {
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
          log(`Cảnh báo: không thể tự tạo database/config: ${msg}`, 'warn');
          rawLog(`\x1b[33m⚠ Không thể tự tạo database: ${msg}\x1b[0m\r\n`);
        }
      }

      // Create virtual host + hosts entry
      await vhostManager.add(name, projectDir).catch((e: Error) => {
        log(`Cảnh báo: không thể tạo virtual host tự động: ${e.message}`, 'warn');
      });

      // Assign PHP profile
      await vhostManager.updatePhpProfile(name, profileId);

      return {
        name,
        path: projectDir,
        hostname: `${name}.${settings.domain}`,
        hasGit: await fs.pathExists(path.join(projectDir, '.git')),
        hasComposer: await fs.pathExists(path.join(projectDir, 'composer.json')),
        hasPackageJson: await fs.pathExists(path.join(projectDir, 'package.json')),
        framework: template !== 'blank' ? template : undefined,
      };
    },
  );

  ipcMain.handle('project:open', async (_, dirPath: string) => {
    await shell.openPath(dirPath);
  });

  ipcMain.handle('project:delete', async (_, name: string) => {
    const projectDir = path.join(settings.wwwDir, name);
    await fs.remove(projectDir);
    await vhostManager.remove(name);
  });

  // ── VHosts ────────────────────────────────────────────────────────────────

  ipcMain.handle('vhost:list', async () => vhostManager.list());

  ipcMain.handle('vhost:add', async (_, name: string, dir: string) =>
    vhostManager.add(name, dir));

  ipcMain.handle('vhost:remove', async (_, name: string) => {
    await vhostManager.remove(name);
  });

  ipcMain.handle('vhost:updatePhpSettings', async (_, name: string, phpSettings: Record<string, string>) =>
    vhostManager.updatePhpSettings(name, phpSettings));

  ipcMain.handle('vhost:updatePhpVersion', async (_, name: string, version: string) =>
    vhostManager.updatePhpVersion(name, version));

  ipcMain.handle('vhost:updatePhpProfile', async (_, name: string, profileId: string) =>
    vhostManager.updatePhpProfile(name, profileId));

  ipcMain.handle('vhost:updatePhpExtensions', async (_, name: string, exts: Record<string, boolean>) =>
    vhostManager.updatePhpExtensions(name, exts));

  // ── PHP Profiles ──────────────────────────────────────────────────────────

  ipcMain.handle('php-profile:list', async () => vhostManager.listPhpProfiles());

  ipcMain.handle('php-profile:runtime-statuses', async () =>
    vhostManager.listPhpRuntimeStatuses());

  ipcMain.handle('php-profile:built-in-extensions', async (_, phpVersion?: string) =>
    vhostManager.getBuiltInPhpExtensions(phpVersion || settings.phpVersion));

  ipcMain.handle('php-profile:restart-runtimes', async () =>
    vhostManager.restartAllPhpRuntimes());

  ipcMain.handle('php-profile:get', async (_, id: string) =>
    vhostManager.getPhpProfile(id));

  ipcMain.handle('php-profile:create', async (_, data: unknown) =>
    vhostManager.createPhpProfile(data as Parameters<typeof vhostManager.createPhpProfile>[0]));

  ipcMain.handle('php-profile:update', async (_, id: string, data: unknown) =>
    vhostManager.updatePhpProfileDefinition(id, data as Parameters<typeof vhostManager.updatePhpProfileDefinition>[1]));

  ipcMain.handle('php-profile:delete', async (_, id: string) =>
    vhostManager.deletePhpProfileDefinition(id));

  // ── Settings ──────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', async () => settings);

  ipcMain.handle('settings:set', async (_, patch: Partial<LStackSettings>) => {
    const oldWebserver = settings.webserver;
    const oldDomain = settings.domain;
    const backup = { ...settings };

    const merged: LStackSettings = { ...settings, ...patch };
    const webserverChanged = patch.webserver !== undefined && patch.webserver !== oldWebserver;
    const domainChanged = patch.domain !== undefined && patch.domain !== oldDomain;

    const regenerateNginxConf = async (s: LStackSettings) => {
      let pmaDir: string = s.wwwDir;
      for (const ver of ['6.0-snapshot', '5.2.3', '5.2.2']) {
        const candidate = packageManager.getInstallPath('phpmyadmin', ver);
        if (await fs.pathExists(candidate)) {
          pmaDir = candidate;
          break;
        }
      }
      await vhostManager.generateNginxMainConf(pmaDir);
    };

    settings = merged;
    await ctx.saveSettings(settings);
    serviceManager.updateSettings(settings);
    vhostManager.updateSettings(settings);

    try {
      if (webserverChanged) {
        if (oldWebserver) await serviceManager.stop(oldWebserver).catch(() => {});
        await serviceManager.stop(merged.webserver).catch(() => {});
        await serviceManager.ensurePortsReleased([merged.httpPort, merged.httpsPort]).catch(() => {});
      }

      if (webserverChanged || domainChanged) {
        await regenerateNginxConf(merged).catch(() => {});
        await vhostManager.regenerateAll(oldDomain).catch(() => {});
      } else {
        await regenerateNginxConf(merged).catch(() => {});
      }

      if (webserverChanged) {
        await serviceManager.start(merged.webserver).catch(() => {});
      }
    } catch (err) {
      // Roll back on failure
      settings = backup;
      await ctx.saveSettings(settings).catch(() => {});
      serviceManager.updateSettings(settings);
      vhostManager.updateSettings(settings);
      throw err;
    }
  });

  ipcMain.handle('php:reconfigure', async () => {
    await packageManager.reconfigureAllPhpInis();
    await vhostManager.restartAllPhpRuntimes().catch(() => {});
  });

  // ── System ────────────────────────────────────────────────────────────────

  ipcMain.handle('system:openDir', async (_, dirPath: string) => {
    await shell.openPath(dirPath);
  });

  ipcMain.handle('system:openBrowser', async (_, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('system:getPlatform', () => process.platform);

  ipcMain.handle('system:getDataDir', () => settings.dataDir);

  ipcMain.handle('system:getAppInfo', () => ({
    name: app.getName(),
    version: app.getVersion(),
    owner: 'marixdev',
    homepage: 'https://lstack.dev',
    repositoryUrl: 'https://github.com/marixdev/lstack',
  }));

  ipcMain.handle('system:selectDir', async () => {
    const result = await dialog.showOpenDialog(ctx.mainWindow()!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── Window controls ───────────────────────────────────────────────────────

  ipcMain.handle('window:minimize', () => ctx.mainWindow()?.minimize());
  ipcMain.handle('window:maximize', () => {
    const win = ctx.mainWindow();
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize();
  });
  ipcMain.handle('window:close', () => ctx.mainWindow()?.close());
  ipcMain.handle('window:isMaximized', () => ctx.mainWindow()?.isMaximized() ?? false);

  // ── Certificates ──────────────────────────────────────────────────────────

  ipcMain.handle('cert:status', async () => certManager.getStatus());

  ipcMain.handle('cert:install', async () => {
    const log = (msg: string) =>
      ctx.mainWindow()?.webContents.send('service:log', {
        service: 'devstack', level: 'info',
        message: `[ssl] ${msg}`,
        timestamp: new Date().toISOString(),
      });
    await certManager.installCA(log);

    // Regenerate nginx configs so new cert is picked up
    for (const ver of ['6.0-snapshot', '5.2.3', '5.2.2']) {
      const pmaDir = packageManager.getInstallPath('phpmyadmin', ver);
      if (await fs.pathExists(pmaDir)) {
        await vhostManager.generateNginxMainConf(pmaDir);
        break;
      }
    }
    const svc = settings.webserver === 'apache' ? 'apache' : 'nginx';
    await serviceManager.reloadConfig(svc).catch(() => {});
  });

  ipcMain.handle('cert:getCACertPath', () => certManager.getCACertPath());

  // ── Terminal ──────────────────────────────────────────────────────────────

  ipcMain.handle('terminal:create', (_, id: string, cwd: string, projectName?: string) => {
    terminalManager.create(id, cwd, projectName);
  });

  ipcMain.handle('terminal:write', (_, id: string, data: string) => {
    terminalManager.write(id, data);
  });

  ipcMain.handle('terminal:resize', (_, id: string, cols: number, rows: number) => {
    terminalManager.resize(id, cols, rows);
  });

  ipcMain.handle('terminal:kill', (_, id: string) => {
    terminalManager.kill(id);
  });

  ipcMain.handle('terminal:isAlive', (_, id: string) =>
    terminalManager.isAlive(id));
}

// ─── Project creation helpers ─────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error';
export type RawLog = (data: Buffer | string) => void;

/** Stream-download a file with progress logging */
async function downloadFile(
  url: string,
  dest: string,
  log: (msg: string, level?: LogLevel) => void,
  rawLog?: RawLog,
): Promise<void> {
  const response = await axios({
    method: 'GET', url,
    responseType: 'stream',
    timeout: 600_000,
    maxRedirects: 10,
    headers: { 'User-Agent': 'Mozilla/5.0 LStack/0.1.0', Accept: '*/*' },
  });

  const total = parseInt(response.headers['content-length'] ?? '0', 10);
  let downloaded = 0;
  let lastLog = Date.now();

  response.data.on('data', (chunk: Buffer) => {
    downloaded += chunk.length;
    if (Date.now() - lastLog < 300) return;
    lastLog = Date.now();
    const mb = (downloaded / 1024 / 1024).toFixed(1);
    const pct = total > 0 ? ` (${Math.round((downloaded / total) * 100)}%)` : '';
    if (rawLog) {
      rawLog(`\r\x1b[K\x1b[36mĐang tải...\x1b[0m ${mb} MB${pct}`);
    } else {
      log(`Đang tải... ${mb} MB${pct}`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    const writer = createWriteStream(dest);
    response.data.on('error', (e: Error) => { writer.destroy(e); reject(e); });
    writer.on('error', reject);
    writer.on('finish', () => {
      if (rawLog) rawLog('\r\n\x1b[32m✔ Tải xong!\x1b[0m\r\n');
      resolve();
    });
    response.data.pipe(writer);
  });
}

/** Run `composer <args>` in cwd. Auto-installs composer.phar if not found. */
async function runComposer(
  args: string[],
  cwd: string,
  log: (msg: string, level?: LogLevel) => void,
  opts: { binDir: string; phpVersion?: string },
  rawLog?: RawLog,
): Promise<void> {
  const isWin = process.platform === 'win32';

  // 1. Try system composer first
  const hasSystemComposer = await new Promise<boolean>((resolve) => {
    const p = spawn(isWin ? 'composer.bat' : 'composer', ['--version'], {
      stdio: 'ignore', shell: true,
    });
    p.on('error', () => resolve(false));
    p.on('exit', (c) => resolve(c === 0));
  });

  if (hasSystemComposer) {
    if (rawLog) rawLog(`\x1b[32m[LStack] Sử dụng system composer\x1b[0m\r\n`);
    await spawnComposer(isWin ? 'composer.bat' : 'composer', args, cwd, log, isWin, rawLog);
    return;
  }

  // 2. Find or auto-download composer.phar
  const composerDir = path.join(opts.binDir, 'composer');
  const composerPhar = path.join(composerDir, 'composer.phar');

  if (!await fs.pathExists(composerPhar)) {
    if (rawLog) rawLog(`\x1b[33m[LStack] Không tìm thấy Composer. Đang tải Composer tự động...\x1b[0m\r\n`);
    log('Không tìm thấy Composer. Đang tải Composer tự động...');
    await fs.ensureDir(composerDir);
    await downloadFile('https://getcomposer.org/composer.phar', composerPhar, log, rawLog);
    if (rawLog) rawLog(`\x1b[32m[LStack] Composer đã được tải về thành công.\x1b[0m\r\n`);
    log('Composer đã được tải về thành công.');
  }

  // 3. Find PHP binary
  const phpExe = await findPhpBinary(opts.binDir, opts.phpVersion);
  if (!phpExe) {
    throw new Error(
      'Không tìm thấy PHP. Vui lòng cài đặt PHP trong LStack trước khi tạo project này.',
    );
  }
  log(`Sử dụng PHP: ${phpExe}`);
  if (rawLog) rawLog(`\x1b[32m[LStack] Sử dụng PHP: ${phpExe}\x1b[0m\r\n`);

  await spawnComposer(phpExe, [composerPhar, ...args], cwd, log, false, rawLog);
}

/** Find a PHP binary in LStack's bin dir. */
async function findPhpBinary(binDir: string, phpVersion?: string): Promise<string | null> {
  const isWin = process.platform === 'win32';
  const phpBase = path.join(binDir, 'php');

  const ensureChmod = async (p: string) => {
    if (!isWin) {
      try { await fs.chmod(p, 0o755); } catch { /* ignore */ }
    }
  };

  const tryExe = async (dir: string): Promise<string | null> => {
    const candidates = isWin ? ['php.exe'] : ['bin/php', 'php', 'usr/bin/php', 'sbin/php'];
    for (const name of candidates) {
      const p = path.join(dir, name);
      if (await fs.pathExists(p)) {
        await ensureChmod(p);
        return p;
      }
    }
    return null;
  };

  if (phpVersion) {
    const preferred = path.join(phpBase, `php-${phpVersion}`);
    const exe = await tryExe(preferred);
    if (exe) return exe;
  }

  if (!await fs.pathExists(phpBase)) return null;
  const dirs = await fs.readdir(phpBase);
  for (const dir of dirs.sort().reverse()) {
    const exe = await tryExe(path.join(phpBase, dir));
    if (exe) return exe;
  }

  return null;
}

/** Spawn composer and stream output. */
async function spawnComposer(
  executable: string,
  args: string[],
  cwd: string,
  log: (msg: string, level?: LogLevel) => void,
  useShell: boolean,
  rawLog?: RawLog,
): Promise<void> {
  const doRun = async () => {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(executable, args, { cwd, stdio: 'pipe', shell: useShell });
      proc.stdout?.on('data', (d: Buffer) => {
        if (rawLog) rawLog(d);
        const line = d.toString().trim();
        if (line && !rawLog) log(line);
      });
      proc.stderr?.on('data', (d: Buffer) => {
        if (rawLog) rawLog(d);
        const line = d.toString().trim();
        if (line && !rawLog) log(line, 'warn');
      });
      proc.on('error', reject);
      proc.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Composer exited with code ${code}`)));
    });
  };

  try {
    await doRun();
  } catch (err: unknown) {
    if (process.platform !== 'win32' && (err as NodeJS.ErrnoException)?.code === 'EACCES') {
      try {
        await fs.chmod(executable, 0o755);
        rawLog?.(`\x1b[33m[LStack] Cấp lại quyền execute cho PHP rồi thử lại...\x1b[0m\r\n`);
        await doRun();
        return;
      } catch { /* fall through */ }
    }
    throw err;
  }
}

/** index.php template for blank projects */
function blankTemplate(name: string): string {
  return `<?php
$name = '${name}';
$phpV = PHP_VERSION;
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= htmlspecialchars($name) ?></title>
<style>
:root{--bg:#0f172a;--bg-soft:#172554;--card:rgba(30,41,59,.88);--border:rgba(71,85,105,.55);--text:#f1f5f9;--muted:#94a3b8;--blue:#60a5fa;--shadow:0 24px 60px rgba(2,6,23,.5)}
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at top,var(--bg-soft) 0,var(--bg) 28%,var(--bg) 100%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
body:before{content:'';position:fixed;inset:0;background:linear-gradient(180deg,rgba(96,165,250,.08),transparent 24%,transparent);pointer-events:none}
.card{position:relative;overflow:hidden;max-width:560px;width:100%;padding:32px;border-radius:28px;background:var(--card);border:1px solid var(--border);box-shadow:var(--shadow);backdrop-filter:blur(12px)}
.card:before{content:'';position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,rgba(96,165,250,.34),transparent)}
.hero{display:flex;align-items:flex-start;gap:16px;margin-bottom:28px}
.icon{width:64px;height:64px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0;background:linear-gradient(135deg,rgba(59,130,246,.22),rgba(14,165,233,.1));border:1px solid rgba(96,165,250,.18);box-shadow:0 12px 30px rgba(37,99,235,.2)}
.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(15,23,42,.75);border:1px solid rgba(71,85,105,.45);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.dot{width:8px;height:8px;border-radius:999px;background:#22c55e;box-shadow:0 0 10px rgba(34,197,94,.8)}
h1{font-size:30px;font-weight:800;letter-spacing:-.03em;margin-bottom:10px}
.lead{color:var(--muted);font-size:15px;line-height:1.7;max-width:420px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:24px}
.panel{padding:16px;border-radius:20px;background:rgba(15,23,42,.58);border:1px solid rgba(71,85,105,.4)}
.panel-label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.panel-value{font-size:15px;font-weight:700}
.panel-sub{font-size:13px;color:var(--muted);margin-top:6px;line-height:1.6}
.badge{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(37,99,235,.16);border:1px solid rgba(59,130,246,.34);color:#bfdbfe;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin-top:18px}
</style>
</head>
<body>
<div class="card">
  <div class="hero">
    <div class="icon">🚀</div>
    <div>
      <div class="eyebrow"><span class="dot"></span>Running</div>
      <h1><?= htmlspecialchars($name) ?></h1>
      <p class="lead">Bắt đầu xây dựng ứng dụng của bạn. Đặt file vào thư mục này để bắt đầu.</p>
    </div>
  </div>
  <div class="grid">
    <div class="panel">
      <div class="panel-label">Runtime</div>
      <div class="panel-value">PHP <?= $phpV ?></div>
      <div class="panel-sub"><?= PHP_INT_SIZE === 8 ? '64-bit' : '32-bit' ?> · NTS</div>
    </div>
    <div class="panel">
      <div class="panel-label">Server</div>
      <div class="panel-value"><?= htmlspecialchars(strtok($_SERVER['SERVER_SOFTWARE'] ?? 'nginx', '/')) ?></div>
      <div class="panel-sub"><?= htmlspecialchars($_SERVER['SERVER_SOFTWARE'] ?? '') ?></div>
    </div>
  </div>
  <div class="badge">Powered by LStack</div>
</div>
</body></html>
`;
}

// ─── Database auto-creation helpers ──────────────────────────────────────────

type LogFn = (msg: string, level?: string) => void;
type RawLogFn = (data: string) => void;

/** Frameworks that need a MySQL database */
function isFrameworkRequiringDb(fw: string): boolean {
  return ['wordpress', 'laravel', 'symfony', 'codeigniter', 'drupal', 'joomla', 'prestashop'].includes(fw);
}

/** Find the mysql/mariadb client binary from LStack bins */
async function findMysqlClient(binDir: string, mariadbVersion: string): Promise<string | null> {
  const isWin = process.platform === 'win32';
  const exe = isWin ? '.exe' : '';

  // 1. Check in the active MariaDB version dir
  const mariaBase = path.join(binDir, 'mariadb', `mariadb-${mariadbVersion}`, 'bin');
  for (const name of [`mariadb${exe}`, `mysql${exe}`]) {
    const p = path.join(mariaBase, name);
    if (await fs.pathExists(p)) return p;
  }

  // 2. Scan any installed MariaDB version
  const mariaDir = path.join(binDir, 'mariadb');
  if (await fs.pathExists(mariaDir)) {
    const dirs = await fs.readdir(mariaDir);
    for (const d of dirs) {
      for (const name of [`mariadb${exe}`, `mysql${exe}`]) {
        const p = path.join(mariaDir, d, 'bin', name);
        if (await fs.pathExists(p)) return p;
      }
    }
  }

  // 3. Try system mysql/mariadb
  const systemCheck = (cmd: string) =>
    new Promise<boolean>((resolve) => {
      const p = spawn(cmd, ['--version'], { stdio: 'ignore', shell: true });
      p.on('error', () => resolve(false));
      p.on('exit', (c) => resolve(c === 0));
    });
  if (await systemCheck('mariadb')) return 'mariadb';
  if (await systemCheck('mysql')) return 'mysql';

  return null;
}

/** Create a MySQL database using the client binary, auto-starting MariaDB if needed */
async function createDatabase(
  dbName: string,
  settings: LStackSettings,
  svcManager: ServiceManager,
  log: LogFn,
  rawLog: RawLogFn,
): Promise<void> {
  const client = await findMysqlClient(settings.binDir, settings.mariadbVersion);
  if (!client) {
    log('Không tìm thấy mysql client, bỏ qua tạo database tự động.', 'warn');
    rawLog('\x1b[33m⚠ Không tìm thấy mysql client, bỏ qua tạo database.\x1b[0m\r\n');
    return;
  }

  // Ensure MariaDB is running before creating the database
  const mariaStatus = svcManager.getStatuses().find((s) => s.name === 'mariadb');
  if (!mariaStatus || mariaStatus.status !== 'running') {
    log('MariaDB chưa chạy, đang khởi động...');
    rawLog('\x1b[36mMariaDB chưa chạy, đang khởi động...\x1b[0m\r\n');
    try {
      await svcManager.start('mariadb' as import('../../src/types').ServiceName);
      // Wait a moment for MariaDB to accept connections
      await new Promise((r) => setTimeout(r, 2000));
      log('MariaDB đã khởi động.');
      rawLog('\x1b[32m✔ MariaDB đã khởi động.\x1b[0m\r\n');
    } catch (startErr: unknown) {
      const msg = startErr instanceof Error ? startErr.message : String(startErr);
      log(`Không thể khởi động MariaDB: ${msg}`, 'warn');
      rawLog(`\x1b[33m⚠ Không thể khởi động MariaDB: ${msg}\x1b[0m\r\n`);
      return;
    }
  }

  log(`Đang tạo database "${dbName}"...`);
  rawLog(`\x1b[36mĐang tạo database "${dbName}"...\x1b[0m\r\n`);

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-u', 'root',
      '-h', '127.0.0.1',
      '-P', String(settings.mariadbPort),
      '-e', `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    ];
    const proc = spawn(client, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (e) => reject(new Error(`Không thể chạy mysql client: ${e.message}`)));
    proc.on('exit', (code) => {
      if (code === 0) {
        log(`Database "${dbName}" đã được tạo thành công.`);
        rawLog(`\x1b[32m✔ Database "${dbName}" đã được tạo.\x1b[0m\r\n`);
        resolve();
      } else {
        reject(new Error(`mysql client exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

/** Write database config file for each framework */
async function writeDbConfig(
  template: string,
  projectDir: string,
  dbName: string,
  projectName: string,
  settings: LStackSettings,
  log: LogFn,
  rawLog: RawLogFn,
): Promise<void> {
  const host = '127.0.0.1';
  const port = String(settings.mariadbPort);
  const user = 'root';
  const pass = '';

  switch (template) {
    case 'wordpress': {
      // Create wp-config.php from wp-config-sample.php
      const samplePath = path.join(projectDir, 'wp-config-sample.php');
      const configPath = path.join(projectDir, 'wp-config.php');
      if (await fs.pathExists(samplePath)) {
        let content = await fs.readFile(samplePath, 'utf8');
        content = content
          .replace("define( 'DB_NAME', 'database_name_here' );", `define( 'DB_NAME', '${dbName}' );`)
          .replace("define( 'DB_USER', 'username_here' );", `define( 'DB_USER', '${user}' );`)
          .replace("define( 'DB_PASSWORD', 'password_here' );", `define( 'DB_PASSWORD', '${pass}' );`)
          .replace("define( 'DB_HOST', 'localhost' );", `define( 'DB_HOST', '${host}:${port}' );`);
        // Generate unique salts
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?/~`';
        const genSalt = () => Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const saltKeys = ['AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY',
          'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT'];
        for (const key of saltKeys) {
          content = content.replace(
            new RegExp(`define\\(\\s*'${key}',\\s*'put your unique phrase here'\\s*\\);`),
            `define( '${key}', '${genSalt()}' );`,
          );
        }
        await fs.writeFile(configPath, content, 'utf8');
        log('wp-config.php đã được tạo với thông tin database.');
        rawLog('\x1b[32m✔ wp-config.php đã được cấu hình tự động.\x1b[0m\r\n');
      }
      break;
    }
    case 'laravel': {
      const envPath = path.join(projectDir, '.env');
      if (await fs.pathExists(envPath)) {
        let content = await fs.readFile(envPath, 'utf8');
        content = content
          .replace(/^DB_CONNECTION=.*/m, 'DB_CONNECTION=mysql')
          .replace(/^DB_HOST=.*/m, `DB_HOST=${host}`)
          .replace(/^DB_PORT=.*/m, `DB_PORT=${port}`)
          .replace(/^DB_DATABASE=.*/m, `DB_DATABASE=${dbName}`)
          .replace(/^DB_USERNAME=.*/m, `DB_USERNAME=${user}`)
          .replace(/^DB_PASSWORD=.*/m, `DB_PASSWORD=${pass}`)
          .replace(/^# DB_HOST=.*/m, `DB_HOST=${host}`)
          .replace(/^# DB_PORT=.*/m, `DB_PORT=${port}`)
          .replace(/^# DB_DATABASE=.*/m, `DB_DATABASE=${dbName}`)
          .replace(/^# DB_USERNAME=.*/m, `DB_USERNAME=${user}`)
          .replace(/^# DB_PASSWORD=.*/m, `DB_PASSWORD=`);
        content = content
          .replace(/^APP_URL=.*/m, `APP_URL=http://${projectName}.${settings.domain}`);
        await fs.writeFile(envPath, content, 'utf8');
        log('.env đã được cấu hình database.');
        rawLog('\x1b[32m✔ .env đã được cấu hình database tự động.\x1b[0m\r\n');
      }
      break;
    }
    case 'symfony': {
      const envPath = path.join(projectDir, '.env');
      if (await fs.pathExists(envPath)) {
        let content = await fs.readFile(envPath, 'utf8');
        const dsn = `mysql://${user}:${pass}@${host}:${port}/${dbName}?serverVersion=mariadb-${settings.mariadbVersion}&charset=utf8mb4`;
        // Replace existing DATABASE_URL or append
        if (content.includes('DATABASE_URL=')) {
          content = content.replace(/^DATABASE_URL=.*/m, `DATABASE_URL="${dsn}"`);
          content = content.replace(/^# DATABASE_URL=.*/m, `DATABASE_URL="${dsn}"`);
        } else {
          content += `\nDATABASE_URL="${dsn}"\n`;
        }
        await fs.writeFile(envPath, content, 'utf8');
        log('.env đã được cấu hình DATABASE_URL.');
        rawLog('\x1b[32m✔ Symfony .env đã được cấu hình database tự động.\x1b[0m\r\n');
      }
      break;
    }
    case 'codeigniter': {
      // CI4: app/Config/Database.php or .env
      const envPath = path.join(projectDir, '.env');
      const envSample = path.join(projectDir, 'env');
      // CI4 ships an `env` file (no dot); copy to `.env` if needed
      if (!await fs.pathExists(envPath) && await fs.pathExists(envSample)) {
        await fs.copy(envSample, envPath);
      }
      if (await fs.pathExists(envPath)) {
        let content = await fs.readFile(envPath, 'utf8');
        // Uncomment and set DB lines
        content = content
          .replace(/^#?\s*database\.default\.hostname\s*=.*/m, `database.default.hostname = ${host}`)
          .replace(/^#?\s*database\.default\.database\s*=.*/m, `database.default.database = ${dbName}`)
          .replace(/^#?\s*database\.default\.username\s*=.*/m, `database.default.username = ${user}`)
          .replace(/^#?\s*database\.default\.password\s*=.*/m, `database.default.password = ${pass}`)
          .replace(/^#?\s*database\.default\.DBDriver\s*=.*/m, 'database.default.DBDriver = MySQLi')
          .replace(/^#?\s*database\.default\.port\s*=.*/m, `database.default.port = ${port}`);
        await fs.writeFile(envPath, content, 'utf8');
        log('.env đã được cấu hình database cho CodeIgniter.');
        rawLog('\x1b[32m✔ CodeIgniter .env đã được cấu hình database tự động.\x1b[0m\r\n');
      }
      break;
    }
    case 'drupal': {
      // Drupal: create sites/default/settings.local.php
      const sitesDefault = path.join(projectDir, 'sites', 'default');
      if (await fs.pathExists(sitesDefault)) {
        const localSettings = path.join(sitesDefault, 'settings.local.php');
        const dbConfig = `<?php
/**
 * Auto-generated by LStack.
 */
$databases['default']['default'] = [
  'database' => '${dbName}',
  'username' => '${user}',
  'password' => '${pass}',
  'host' => '${host}',
  'port' => '${port}',
  'driver' => 'mysql',
  'prefix' => '',
  'collation' => 'utf8mb4_unicode_ci',
];
`;
        await fs.writeFile(localSettings, dbConfig, 'utf8');
        // Ensure settings.php includes settings.local.php
        const settingsPhp = path.join(sitesDefault, 'settings.php');
        const defaultSettings = path.join(sitesDefault, 'default.settings.php');
        if (!await fs.pathExists(settingsPhp) && await fs.pathExists(defaultSettings)) {
          await fs.copy(defaultSettings, settingsPhp);
        }
        if (await fs.pathExists(settingsPhp)) {
          let content = await fs.readFile(settingsPhp, 'utf8');
          const includeSnippet = `\nif (file_exists(\$app_root . '/' . \$site_path . '/settings.local.php')) {\n  include \$app_root . '/' . \$site_path . '/settings.local.php';\n}\n`;
          if (!content.includes('settings.local.php')) {
            content += includeSnippet;
            await fs.writeFile(settingsPhp, content, 'utf8');
          }
        }
        log('Drupal settings.local.php đã được tạo.');
        rawLog('\x1b[32m✔ Drupal database config đã được cấu hình tự động.\x1b[0m\r\n');
      }
      break;
    }
    case 'joomla': {
      // Joomla 4/5: create a configuration.php
      const configPath = path.join(projectDir, 'configuration.php');
      const config = `<?php
/**
 * Auto-generated by LStack. Complete Joomla installation via browser.
 */
class JConfig {
  public $dbtype = 'mysqli';
  public $host = '${host}:${port}';
  public $user = '${user}';
  public $password = '${pass}';
  public $db = '${dbName}';
  public $dbprefix = 'jml_';
  public $dbencryption = 0;
  public $sitename = '${projectName}';
  public $tmp_path = '${projectDir.replace(/\\/g, '/')}/tmp';
  public $log_path = '${projectDir.replace(/\\/g, '/')}/administrator/logs';
  public $secret = '${Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')}';
}
`;
      await fs.writeFile(configPath, config, 'utf8');
      log('Joomla configuration.php đã được tạo.');
      rawLog('\x1b[32m✔ Joomla configuration.php đã được cấu hình tự động.\x1b[0m\r\n');
      break;
    }
    case 'prestashop': {
      // PrestaShop: create app/config/parameters.php
      const paramsDir = path.join(projectDir, 'app', 'config');
      if (await fs.pathExists(path.join(projectDir, 'app'))) {
        await fs.ensureDir(paramsDir);
        const paramsPath = path.join(paramsDir, 'parameters.php');
        const params = `<?php
/**
 * Auto-generated by LStack. Complete PrestaShop installation via browser.
 */
return [
  'parameters' => [
    'database_host' => '${host}',
    'database_port' => '${port}',
    'database_name' => '${dbName}',
    'database_user' => '${user}',
    'database_password' => '${pass}',
    'database_prefix' => 'ps_',
    'database_engine' => 'InnoDB',
  ],
];
`;
        await fs.writeFile(paramsPath, params, 'utf8');
        log('PrestaShop parameters.php đã được tạo.');
        rawLog('\x1b[32m✔ PrestaShop database config đã được cấu hình tự động.\x1b[0m\r\n');
      }
      break;
    }
  }
}
