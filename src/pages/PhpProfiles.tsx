import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, RefreshCw, Trash2, Save, Cpu, ChevronRight, Shield,
  AlertCircle, Puzzle,
} from 'lucide-react';
import { usePackageStore, useToastStore } from '../store';
import { useTranslation } from '../i18n';
import type { PhpProfile, VHostPhpSettings } from '../types';

const DEFAULT_PHP_SETTINGS: VHostPhpSettings = {
  memory_limit: '256M',
  upload_max_filesize: '64M',
  post_max_size: '64M',
  max_execution_time: 300,
  max_input_time: 300,
  max_input_vars: 5000,
};

const PHP_SETTING_LABELS: Record<string, string> = {
  memory_limit: 'memory_limit',
  upload_max_filesize: 'upload_max_filesize',
  post_max_size: 'post_max_size',
  max_execution_time: 'max_execution_time',
  max_input_time: 'max_input_time',
  max_input_vars: 'max_input_vars',
};

export function PhpProfiles() {
  const { t } = useTranslation();
  const { addToast } = useToastStore();
  const { installedVersions } = usePackageStore();
  const phpVersions = installedVersions['php'] ?? [];

  const [profiles, setProfiles] = useState<PhpProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [builtInExts, setBuiltInExts] = useState<string[]>([]);

  // Editor state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPhpVersion, setEditPhpVersion] = useState('');
  const [editSettings, setEditSettings] = useState<VHostPhpSettings>({ ...DEFAULT_PHP_SETTINGS });
  const [editExtensions, setEditExtensions] = useState('');

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.lstack.phpProfile.list();
      setProfiles(list);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
    } catch (err: any) {
      addToast({ type: 'error', message: t('phpProfiles.load.error', { message: err?.message ?? String(err) }) });
    } finally {
      setLoading(false);
    }
  }, [selectedId, addToast, t]);

  const loadBuiltInExtensions = useCallback(async (phpVersion: string) => {
    if (!phpVersion) { setBuiltInExts([]); return; }
    try {
      const exts = await window.lstack.phpProfile.listBuiltInExtensions(phpVersion);
      setBuiltInExts(exts);
    } catch {
      setBuiltInExts([]);
    }
  }, []);

  const fillEditor = useCallback((profile: PhpProfile | null) => {
    if (!profile) {
      setEditName('');
      setEditDescription('');
      setEditPhpVersion(phpVersions[0] ?? '');
      setEditSettings({ ...DEFAULT_PHP_SETTINGS });
      setEditExtensions('');
      setBuiltInExts([]);
      return;
    }
    setEditName(profile.name);
    setEditDescription(profile.description);
    setEditPhpVersion(profile.phpVersion);
    setEditSettings({ ...DEFAULT_PHP_SETTINGS, ...profile.phpSettings });
    setEditExtensions((profile.phpExtensions ?? []).join(', '));
    loadBuiltInExtensions(profile.phpVersion);
  }, [phpVersions, loadBuiltInExtensions]);

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => { loadProfiles(); }, []);

  useEffect(() => {
    fillEditor(selectedProfile);
  }, [selectedProfile, fillEditor]);

  useEffect(() => {
    if (editPhpVersion) loadBuiltInExtensions(editPhpVersion);
  }, [editPhpVersion, loadBuiltInExtensions]);

  // ─── Create new (select virtual "new" entry) ─────────────────────────────
  const handleNew = () => {
    setSelectedId('__new__');
    setEditName('');
    setEditDescription('');
    setEditPhpVersion(phpVersions[0] ?? '');
    setEditSettings({ ...DEFAULT_PHP_SETTINGS });
    setEditExtensions('');
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editName.trim()) {
      addToast({ type: 'warning', message: t('phpProfiles.nameRequired') });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editName.trim(),
        description: editDescription.trim(),
        phpVersion: editPhpVersion,
        isBuiltIn: false,
        phpSettings: editSettings,
        phpExtensions: editExtensions
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
      };

      if (selectedId && selectedId !== '__new__' && !selectedProfile?.isBuiltIn) {
        await window.lstack.phpProfile.update(selectedId, payload);
        addToast({ type: 'success', message: t('phpProfiles.save.updated') });
      } else {
        const created = await window.lstack.phpProfile.create(payload);
        addToast({ type: 'success', message: t('phpProfiles.save.created') });
        await loadProfiles();
        setSelectedId(created.id);
        return;
      }
      await loadProfiles();
    } catch (err: any) {
      addToast({ type: 'error', message: t('phpProfiles.save.error', { message: err?.message ?? String(err) }) });
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedId || selectedId === '__new__' || selectedProfile?.isBuiltIn) return;
    try {
      await window.lstack.phpProfile.delete(selectedId);
      addToast({ type: 'success', message: t('phpProfiles.delete.success') });
      setSelectedId(null);
      await loadProfiles();
    } catch (err: any) {
      addToast({ type: 'error', message: t('phpProfiles.delete.error', { message: err?.message ?? String(err) }) });
    }
  };

  const updateSetting = (key: keyof VHostPhpSettings, value: string | number) => {
    setEditSettings((prev) => ({ ...prev, [key]: value }));
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 h-16 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900">
        <div className="flex items-center gap-3">
          <Cpu size={20} className="text-blue-400" />
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">{t('phpProfiles.title')}</h1>
            <p className="text-xs text-slate-400">{t('phpProfiles.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span className="font-medium">{t('phpProfiles.new')}</span>
          </button>
          <button
            onClick={loadProfiles}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md border border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="font-medium">{t('phpProfiles.reload')}</span>
          </button>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Profile list */}
        <div className="w-[280px] shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
          <div className="p-3 space-y-1">
            {profiles.map((profile) => {
              const isSelected = selectedId === profile.id;
              return (
                <button
                  key={profile.id}
                  onClick={() => setSelectedId(profile.id)}
                  className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-md transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded ${isSelected ? 'bg-blue-500' : 'bg-slate-800 text-slate-400'}`}>
                      <Cpu size={14} />
                    </div>
                    <div className="truncate">
                      <div className="font-medium text-sm truncate">{profile.name}</div>
                      <div className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                        PHP {profile.phpVersion}
                        {profile.isBuiltIn && (
                          <span className="ml-1.5 text-[10px] opacity-70">({t('phpProfiles.builtIn')})</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={14} className={isSelected ? 'text-blue-200' : 'text-slate-600'} />
                </button>
              );
            })}

            {selectedId === '__new__' && (
              <button
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md bg-blue-600 text-white shadow-sm"
              >
                <div className="p-1.5 rounded bg-blue-500">
                  <Plus size={14} />
                </div>
                <span className="font-medium text-sm">{t('phpProfiles.newTitle')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="flex-1 overflow-y-auto bg-slate-950 p-6">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full text-slate-500 gap-2">
              <AlertCircle size={20} />
              <span>{t('phpProfiles.title')}</span>
            </div>
          ) : (
            <div className="max-w-2xl space-y-6">
              {/* Hint banner */}
              {selectedProfile?.isBuiltIn && (
                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
                  <Shield size={16} className="shrink-0 mt-0.5" />
                  <span>{t('phpProfiles.builtInHint')}</span>
                </div>
              )}
              {!selectedProfile?.isBuiltIn && selectedId !== '__new__' && (
                <div className="text-xs text-slate-500">{t('phpProfiles.customHint')}</div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('phpProfiles.profileName')}</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* PHP Version */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('phpProfiles.phpVersion')}</label>
                <select
                  value={editPhpVersion}
                  onChange={(e) => setEditPhpVersion(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {phpVersions.map((v) => (
                    <option key={v} value={v}>PHP {v}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('phpProfiles.description')}</label>
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* PHP Settings */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">{t('phpProfiles.phpSettings')}</label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(PHP_SETTING_LABELS).map(([key, label]) => {
                    const val = editSettings[key as keyof VHostPhpSettings];
                    const isNumeric = typeof DEFAULT_PHP_SETTINGS[key as keyof VHostPhpSettings] === 'number';
                    return (
                      <div key={key}>
                        <label className="block text-xs text-slate-500 mb-1 font-mono">{label}</label>
                        <input
                          value={val ?? ''}
                          onChange={(e) =>
                            updateSetting(
                              key as keyof VHostPhpSettings,
                              isNumeric ? Number(e.target.value) || 0 : e.target.value,
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom extensions */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('phpProfiles.customExtensions')}</label>
                <textarea
                  value={editExtensions}
                  onChange={(e) => setEditExtensions(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder="e.g. redis, imagick, xdebug"
                />
              </div>

              {/* Built-in extensions */}
              {builtInExts.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                    <Puzzle size={14} className="text-slate-400" />
                    {t('phpProfiles.alwaysEnabled')}
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">{t('phpProfiles.alwaysEnabledHint')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {builtInExts.map((ext) => (
                      <span
                        key={ext}
                        className="px-2 py-0.5 text-[11px] rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono"
                      >
                        {ext}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  <Save size={14} />
                  {saving
                    ? t('common.saving')
                    : selectedProfile?.isBuiltIn
                      ? t('phpProfiles.saveAsCustom')
                      : t('phpProfiles.saveProfile')}
                </button>

                {selectedId && selectedId !== '__new__' && !selectedProfile?.isBuiltIn && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-red-500/10 hover:text-red-400 text-slate-400 text-sm rounded-md border border-slate-700 hover:border-red-500/30 transition-colors"
                  >
                    <Trash2 size={14} />
                    {t('phpProfiles.delete')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
