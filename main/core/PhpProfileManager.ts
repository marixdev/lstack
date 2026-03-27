import path from 'path';
import fs from 'fs-extra';
import type { LStackSettings, PhpProfile, VHostPhpSettings } from '../../src/types';

// ─── Built-in PHP Profiles ──────────────────────────────────────────────────
// Only the "minimal" profile is built-in. It serves as the default PHP-FPM
// process for localhost.test, phpmyadmin.test, and new projects.
// Users create project-specific profiles from the UI.
export const BUILT_IN_PROFILES: PhpProfile[] = [
  {
    id: 'minimal',
    name: 'Default',
    description: 'Default PHP-FPM profile for all projects',
    isBuiltIn: true,
    phpVersion: '8.5.4',
    phpSettings: {
      memory_limit: '512M',
      max_execution_time: 120,
      max_input_time: 120,
      max_input_vars: 5000,
      upload_max_filesize: '128M',
      post_max_size: '128M',
    },
    phpExtensions: [
      'curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'mysqli', 'openssl',
      'pdo_mysql', 'pdo_sqlite', 'zip', 'sodium',
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

  async detectRecommendedProfile(_projectDir: string): Promise<string> {
    // All projects use the default (minimal) profile initially.
    // Users can create and assign a custom profile per project from the UI.
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
