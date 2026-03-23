# Changelog

All notable changes to LStack are documented in this file.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [Semantic Versioning](https://semver.org/)

Vietnamese version: [CHANGELOG.vi.md](CHANGELOG.vi.md)

---

## [1.0.0] - 2026-03-23

First stable release of LStack.

### Added

#### Application
- Desktop application built with **Electron 32**, **React 18**, **TypeScript 5**, **Vite 5**, and **Tailwind CSS 3**
- Bilingual interface — **English** and **Vietnamese** switchable at runtime via i18n system
- System tray support with quick service controls
- Auto-updater powered by `electron-updater`
- Custom frameless title bar with window controls
- Light-on-dark UI with Tailwind CSS and Lucide icons

#### Service Management
- One-click **start / stop / restart** for every managed service
- Real-time service status badges (running, stopped, starting, stopping, error)
- Services: **Nginx**, **Apache**, **MariaDB**, **PostgreSQL**, **PHP-FPM**, **Redis**, **Memcached**, **Mailpit**, **MongoDB**
- Auto-start services on app launch (configurable per service)
- Service port display and PID tracking in the dashboard
- Real-time service log viewer (tail stdout/stderr from the UI)

#### Virtual Hosts & Projects
- Automatic `.test` domain creation when a folder is added to the projects directory
- Support for both **Nginx** and **Apache** as the web server per project
- Virtual host config auto-generated and reloaded on project add/remove
- SSL virtual host blocks generated alongside HTTP blocks
- Project list with framework detection: **Laravel**, **WordPress**, **Symfony**, **CodeIgniter**
- Project metadata: git presence, `composer.json` presence, `package.json` presence
- Grid and list view modes for the project browser
- Project search / filter by name
- Context menu per project: open in browser, open folder, open terminal, delete vhost

#### SSL / HTTPS
- Local CA management via **mkcert**
- One-click CA trust installation from the Settings page
- Per-project SSL certificate generation (`*.test` domain signed by local CA)
- SSL trust status indicator per certificate and system-level trust check on Linux

#### PHP-FPM Profiles
- Per-project PHP-FPM: each profile runs as an **isolated process** with a hash-based port (range 9100–9600)
- Six **built-in profiles**: Minimal, WordPress, Laravel, Symfony, CodeIgniter, Full Stack
- **Custom profiles**: create, edit, and delete user-defined profiles with arbitrary `php.ini` overrides and extension lists
- PHP settings per profile: `memory_limit`, `max_execution_time`, `max_input_time`, `max_input_vars`, `upload_max_filesize`, `post_max_size`, `display_errors`, `date.timezone`
- Extension list per profile: enable/disable any PHP extension
- **Auto-profile detection** when opening an existing project (detects `artisan`, `wp-config.php`, `symfony.lock`, `spark`)
- Profile assignment shown and editable from the project card

#### Special Domains
- `localhost.test` — LStack dashboard / PHP info welcome page served by the `minimal` PHP-FPM profile
- `phpmyadmin.test` — phpMyAdmin served automatically; root auto-login with no password required
- Both entries added to the system `hosts` file automatically on first launch

#### Project Wizard (Templates)
- In-app project creation wizard with template selection and version picker
- Supported templates: **Blank PHP**, **Laravel** (8–12), **WordPress** (5.9–6.8/latest), **Symfony** (5.4–7.3), **CodeIgniter** (3.1–4.5), **Drupal** (10–11), **Joomla** (4–5), **PrestaShop** (1.7–8)
- Downloads and installs framework files automatically via Composer / direct archive
- Install progress shown in the in-app terminal panel

#### Package Manager
- Browse, download, and install service binaries from within the app — no system package manager needed
- Packages: Nginx, Apache, MariaDB, PHP (multiple versions), phpMyAdmin, Redis, Mailpit, PostgreSQL, MongoDB, Memcached
- Package registry loaded from a bundled `package-registry.json` with per-platform download URLs
- Installation state persisted; binary paths injected into service configs automatically
- Download progress bar with bytes transferred and percentage
- Installation log streamed to the in-app terminal

#### Terminal
- Full **xterm.js** terminal per project (node-pty backend)
- Terminal opens pre-`cd`'d to the project directory
- Multi-tab terminal panel; tabs closeable individually
- Fit addon for responsive resize

#### Logs
- Real-time log viewer for each service (stdout/stderr tail via chokidar)
- Log modal with auto-scroll and manual scroll-lock toggle
- Clear log button

#### Settings
- Configurable projects directory (default: `~/LStack/www/`)
- Web server selector (Nginx / Apache)
- Default PHP version for new profiles
- SSL provider status and CA installation
- Language toggle (English / Vietnamese)
- Auto-start services toggle
- Folder picker dialog for path fields

#### Data & Configuration
- All data stored in `~/.lstack/` — no system-wide service installs polluted
- Nginx and Apache configs, vhosts, MariaDB data, PostgreSQL data, Redis config, certificates, and downloaded binaries all under `~/.lstack/`
- `settings.json` and `php-profiles.json` in the data directory
- Graceful migration path from legacy `~/.devstack/` directory

#### Platforms
- **Windows x64** — NSIS installer (`LStack Setup 1.0.0.exe`)
- **Linux x64** — AppImage (`LStack-1.0.0.AppImage`) and `.deb` package
- Linux packages built and tested on Ubuntu/Debian via WSL or native Linux

### Notes

- macOS is not part of the v1.0.0 release scope
- MongoDB support is included in the package registry but considered optional; not auto-started
- PHP-FPM port 9100–9600 range is deterministic per profile name (hash-based); the `minimal` profile resolves to port 9105

