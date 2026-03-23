# LStack

> Local development environment for Windows and Linux.  
> A modern, Electron-based alternative to Laragon — manage PHP services, virtual hosts, databases, and projects from a clean GUI.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)](#installation)
[![Version](https://img.shields.io/badge/version-1.0.0-green)](CHANGELOG.md)

**Homepage:** https://lstack.dev  
**GitHub:** https://github.com/marixdev/lstack

---

## Overview

LStack is a desktop application that manages a full local PHP development stack — web servers, databases, caches, and mail — without any Docker or WSL dependency. Services run as native processes; projects are served over `.test` domains with optional SSL via mkcert.

Built with **Electron 32**, **React 18**, **TypeScript 5**, **Vite 5**, and **Tailwind CSS 3**.

---

## Features

- **One-click service management** — start, stop, and restart every service from the dashboard
- **Virtual hosts** — auto-create `.test` domains (e.g. `myapp.test`) with Nginx or Apache
- **SSL certificates** — trust a local CA with a single click; full HTTPS on every project
- **Per-project PHP profiles** — assign a dedicated PHP-FPM process with isolated `php.ini` settings and extensions per project
- **PHP extension control** — enable/disable extensions per profile; built-in profiles ship pre-configured for Laravel, WordPress, Symfony, and more
- **Project wizard** — scaffold new projects from a template with one click; installs CMS/framework files automatically
- **Framework detection** — automatically detects Laravel, WordPress, Symfony, and CodeIgniter in existing folders
- **phpMyAdmin** — accessible at `phpmyadmin.test` with auto-login (no password required for root)
- **Built-in terminal** — xterm.js-powered full terminal per project, opens directly in the project directory
- **Real-time logs** — tail live service and access logs from the UI
- **Package manager** — download and install service binaries (Nginx, Apache, MariaDB, PHP, Redis, etc.) directly from the app, no system-wide installs needed
- **Auto-updater** — built-in update checker via electron-updater
- **Bilingual UI** — full English and Vietnamese interface, switchable at runtime

---

## Services

| Service       | Default Port(s)         | Notes                                  |
|---------------|-------------------------|----------------------------------------|
| Nginx         | 80 (HTTP), 443 (HTTPS)  | Default web server                     |
| Apache        | 80 (HTTP), 443 (HTTPS)  | Optional alternative                   |
| MariaDB       | 3306                    | MySQL-compatible database              |
| PostgreSQL    | 5432                    | Alternative relational database        |
| PHP-FPM       | 9100–9600 (per profile) | Hash-based port per named profile      |
| Redis         | 6379                    | In-memory cache / message broker       |
| Memcached     | 11211                   | Lightweight memory cache               |
| Mailpit       | 1025 (SMTP), 8025 (UI)  | Local mail catcher; web UI at :8025    |
| MongoDB       | 27017                   | Document database (optional package)   |

---

## PHP Profiles

Each PHP-FPM profile runs as a separate process with its own port and `php.ini` overrides. Projects can be assigned any profile; multiple projects can share the same profile.

| Profile        | Memory  | Max Execution | Key Extensions                                              |
|----------------|---------|---------------|-------------------------------------------------------------|
| **Minimal**    | 256 MB  | 60 s          | curl, mbstring, openssl, pdo_mysql, zip                     |
| **WordPress**  | 512 MB  | 300 s         | + gd, mysqli, exif, fileinfo                                |
| **Laravel**    | 512 MB  | 120 s         | + gd, intl, pdo_sqlite, sodium                              |
| **Symfony**    | 512 MB  | 120 s         | + intl, xml, pdo_sqlite                                     |
| **CodeIgniter**| 256 MB  | 120 s         | + intl, mysqli                                              |
| **Full Stack** | 1024 MB | 300 s         | + gd, soap, sodium, xsl, exif, intl, and more               |
| **Custom**     | any     | any           | Create your own with any combination of settings            |

---

## Project Templates

When creating a new project, LStack can scaffold one of the following:

| Template     | Versions supported                          |
|--------------|---------------------------------------------|
| Blank PHP    | — (empty `index.php`)                       |
| Laravel      | 12, 11, 10, 9, 8                            |
| WordPress    | latest, 6.8, 6.7, 6.6, 6.5, 6.4, 5.9       |
| Symfony      | 7.3, 7.2, 6.4, 5.4                          |
| CodeIgniter  | 4.5, 4.4, 4.3, 3.1                          |
| Drupal       | 11, 10                                      |
| Joomla       | 5, 4                                        |
| PrestaShop   | 8, 1.7                                      |

---

## Special Domains

| Domain             | Purpose                                |
|--------------------|----------------------------------------|
| `localhost.test`   | LStack dashboard / welcome page        |
| `phpmyadmin.test`  | phpMyAdmin (auto-login as root)        |

Both entries are automatically added to the system `hosts` file on first launch.

---

## Installation

### Pre-built binaries

Download the latest release from the [Releases page](https://github.com/marixdev/lstack/releases) or from [lstack.dev](https://lstack.dev):

| Platform    | Installer                       |
|-------------|---------------------------------|
| Windows x64 | `LStack Setup 1.0.0.exe`        |
| Linux x64   | `LStack-1.0.0.AppImage`         |
| Linux x64   | `lstack_1.0.0_amd64.deb`        |
| Linux x64   | `lstack-1.0.0.x86_64.rpm`       |

**Windows** — run the NSIS installer and launch LStack from the Start Menu.

**Linux (AppImage):**

```bash
chmod +x LStack-1.0.0.AppImage
./LStack-1.0.0.AppImage
```

**Linux (.deb):**

```bash
sudo dpkg -i lstack_1.0.0_amd64.deb
lstack
```

**Linux (.rpm):**

```bash
sudo rpm -i lstack-1.0.0.x86_64.rpm
lstack
```

---

## Building from Source

### Prerequisites

- Node.js 20+
- npm 9+
- Git

### Steps

```bash
git clone https://github.com/marixdev/lstack.git
cd lstack
npm install
```

**Development (hot reload):**

```bash
npm run dev
```

**Production build:**

```bash
# Windows
npm run dist:win

# Linux (run on Linux or WSL)
npm run dist:linux
```

Output is placed in the `release/` directory.

---

## Data Directory

LStack stores all configuration, service data, certificates, and downloaded binaries under:

```
~/.lstack/
├── nginx/             # Nginx config & virtual hosts
├── apache/            # Apache config & virtual hosts
├── mariadb/           # MariaDB data files
├── postgresql/        # PostgreSQL data files
├── redis/             # Redis config & persistence
├── certs/             # mkcert CA and per-domain certificates
├── bins/              # Downloaded service binaries
├── php-profiles.json  # Custom PHP profiles
└── settings.json      # App settings
```

All data is self-contained — uninstalling LStack does not touch your databases or configuration unless you delete this directory manually.

---

## Settings

Configurable from the Settings page:

| Setting              | Description                                              |
|----------------------|----------------------------------------------------------|
| Projects directory   | Root folder scanned for projects (default: `~/LStack/www/`) |
| Web server           | Nginx or Apache                                          |
| PHP version          | Default PHP version for new profiles                     |
| SSL provider         | mkcert; install and trust the local CA from the UI       |
| Language             | English or Vietnamese                                    |
| Auto-start services  | Optionally start all enabled services on launch          |

---

## License

[GPL-3.0](LICENSE) © LStack — https://lstack.dev

