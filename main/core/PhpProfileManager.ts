import path from 'path';
import fs from 'fs-extra';
import type { LStackSettings, PhpProfile, VHostPhpSettings } from '../../src/types';

// ─── Built-in PHP Profiles ──────────────────────────────────────────────────
export const BUILT_IN_PROFILES: PhpProfile[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Core extensions for simple PHP apps',
    isBuiltIn: true,
    phpVersion: '8.5.4',
    phpSettings: {
      memory_limit: '256M',
      max_execution_time: 60,
      max_input_time: 60,
      max_input_vars: 5000,
      upload_max_filesize: '64M',
      post_max_size: '64M',
    },
    phpExtensions: ['curl', 'fileinfo', 'mbstring', 'openssl', 'pdo_mysql', 'zip'],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'Recommended for WordPress and common plugins',
    isBuiltIn: true,
    phpVersion: '8.5.4',
    phpSettings: {
      memory_limit: '512M',
      max_execution_time: 300,
      max_input_time: 300,
      max_input_vars: 10000,
      upload_max_filesize: '256M',
      post_max_size: '256M',
    },
    phpExtensions: ['curl', 'fileinfo', 'gd', 'mbstring', 'mysqli', 'openssl', 'pdo_mysql', 'zip', 'exif'],
  },
  {
    id: 'laravel',
    name: 'Laravel',
    description: 'Balanced profile for Laravel projects',
    isBuiltIn: true,
    phpVersion: '8.5.4',
    phpSettings: {
      memory_limit: '512M',
      max_execution_time: 120,
      max_input_time: 120,
      max_input_vars: 10000,
      upload_max_filesize: '128M',
      post_max_size: '128M',
    },
    phpExtensions: ['curl', 'fileinfo', 'gd', 'mbstring', 'openssl', 'pdo_mysql', 'pdo_sqlite', 'zip', 'intl', 'sodium'],
  },
  {
    id: 'symfony',
    name: 'Symfony',
    description: 'Recommended profile for Symfony applications',
    isBuiltIn: true,
    phpVersion: '8.5.4',
    phpSettings: {
      memory_limit: '512M',
      max_execution_time: 120,
      max_input_time: 120,
      max_input_vars: 10000,
      upload_max_filesize: '128M',
      post_max_size: '128M',
    },
    phpExtensions: ['curl', 'fileinfo', 'intl', 'mbstring', 'openssl', 'pdo_mysql', 'pdo_sqlite', 'xml', 'zip'],
  },
  {
    id: 'codeigniter',
    name: 'CodeIgniter',
    description: 'Balanced profile for CodeIgniter projects',
    isBuiltIn: true,
    phpVersion: '8.5.4',
    phpSettings: {
      memory_limit: '256M',
      max_execution_time: 120,
      max_input_time: 120,
      max_input_vars: 5000,
      upload_max_filesize: '64M',
      post_max_size: '64M',
    },
    phpExtensions: ['curl', 'fileinfo', 'intl', 'mbstring', 'mysqli', 'openssl', 'pdo_mysql', 'zip'],
  },
  {
    id: 'full',
    name: 'Full Stack',
    description: 'Broader extension set for complex apps',
    isBuiltIn: true,
    phpVersion: '8.5.4',
    phpSettings: {
      memory_limit: '1024M',
      max_execution_time: 300,
      max_input_time: 300,
      max_input_vars: 20000,
      upload_max_filesize: '512M',
      post_max_size: '512M',
    },
    phpExtensions: [
      'curl', 'fileinfo', 'gd', 'mbstring', 'mysqli', 'openssl',
      'pdo_mysql', 'pdo_sqlite', 'zip', 'exif', 'intl', 'soap', 'sodium', 'xsl',
    ],
  },
];

// ─── PhpProfileManager ─────────────────────────────────────────────────────
export class PhpProfileManager {
  private settings: LStackSettings;
  private profilesFile: string;

  constructor(settings: LStackSettings) {
    this.settings = settings;
    this.profilesFile = path.join(settings.dataDir, 'php-profiles.json');
  }

  updateSettings(settings: LStackSettings): void {
    this.settings = settings;
    this.profilesFile = path.join(settings.dataDir, 'php-profiles.json');
  }

  async ensureInitialized(): Promise<void> {
    if (!await fs.pathExists(this.profilesFile)) {
      await fs.writeJson(this.profilesFile, [], { spaces: 2 });
    }
  }

  slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  generateUniqueId(name: string, existingIds: Set<string>): string {
    const base = this.slugify(name) || `profile-${Date.now()}`;
    let id = base;
    let counter = 2;
    while (existingIds.has(id)) {
      id = `${base}-${counter}`;
      counter += 1;
    }
    return id;
  }

  async readCustomProfiles(): Promise<PhpProfile[]> {
    await this.ensureInitialized();
    const raw: PhpProfile[] = await fs.readJson(this.profilesFile).catch(() => []);

    // Ensure no ID collision with built-in profiles and no duplicates
    const builtInIds = new Set(BUILT_IN_PROFILES.map((p) => p.id));
    const allIds = new Set(builtInIds);
    let changed = false;

    const profiles = raw.map((p) => {
      const profile: PhpProfile = { ...p, isBuiltIn: false };
      if (!profile.id || !allIds.has(profile.id) === false) {
        // ID collision, regenerate
      }
      if (!profile.id || allIds.has(profile.id)) {
        profile.id = this.generateUniqueId(profile.name || 'profile', allIds);
        profile.updatedAt = new Date().toISOString();
        changed = true;
      }
      allIds.add(profile.id);
      return profile;
    });

    if (changed) {
      await fs.writeJson(this.profilesFile, profiles, { spaces: 2 });
    }

    return profiles;
  }

  async list(): Promise<PhpProfile[]> {
    const custom = await this.readCustomProfiles();
    return [
      ...BUILT_IN_PROFILES.map((p) => ({
        ...p,
        phpVersion: p.phpVersion || this.settings.phpVersion,
      })),
      ...custom,
    ];
  }

  async get(id: string): Promise<PhpProfile | null> {
    const all = await this.list();
    return all.find((p) => p.id === id) || null;
  }

  async create(data: Omit<PhpProfile, 'id'>): Promise<PhpProfile> {
    const custom = await this.readCustomProfiles();
    const now = new Date().toISOString();
    const existingIds = new Set([
      ...BUILT_IN_PROFILES.map((p) => p.id),
      ...custom.map((p) => p.id),
    ]);
    const id = this.generateUniqueId(data.name, existingIds);
    const profile: PhpProfile = {
      ...data,
      id,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };
    custom.push(profile);
    await fs.writeJson(this.profilesFile, custom, { spaces: 2 });
    return profile;
  }

  async update(id: string, patch: Partial<PhpProfile>): Promise<PhpProfile> {
    const custom = await this.readCustomProfiles();
    const idx = custom.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Custom PHP profile not found: ${id}`);

    custom[idx] = {
      ...custom[idx],
      ...patch,
      id: custom[idx].id, // preserve original id
      isBuiltIn: false,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeJson(this.profilesFile, custom, { spaces: 2 });
    return custom[idx];
  }

  async delete(id: string): Promise<void> {
    const custom = await this.readCustomProfiles();
    const filtered = custom.filter((p) => p.id !== id);
    await fs.writeJson(this.profilesFile, filtered, { spaces: 2 });
  }

  async detectRecommendedProfile(projectDir: string): Promise<string> {
    if (
      await fs.pathExists(path.join(projectDir, 'wp-config.php')) ||
      await fs.pathExists(path.join(projectDir, 'wp-login.php'))
    ) {
      return 'wordpress';
    }
    if (await fs.pathExists(path.join(projectDir, 'artisan'))) {
      return 'laravel';
    }
    if (await fs.pathExists(path.join(projectDir, 'symfony.lock'))) {
      return 'symfony';
    }
    if (await fs.pathExists(path.join(projectDir, 'spark'))) {
      return 'codeigniter';
    }
    return 'minimal';
  }

  async getPortForProfile(profileId: string): Promise<number> {
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
      hash = (hash << 5) - hash + profileId.charCodeAt(i);
      hash |= 0;
    }
    return 9100 + Math.abs(hash) % 500;
  }
}
