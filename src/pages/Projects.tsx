import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  FolderOpen, Globe, ExternalLink, GitBranch,
  Plus, Trash2, RefreshCw, Code, Package, TerminalSquare, Database,
  Search, ChevronRight, ChevronDown, MoreVertical, LayoutGrid, List, Cpu, Zap, Settings2, X
} from 'lucide-react';
import {
  useProjectStore,
  usePackageStore,
  useSettingsStore,
  useTerminalStore,
  useServiceStore,
  useUIStore,
  useToastStore,
} from '../store';
import { useTranslation } from '../i18n';
import { InstallTerminal } from '../components/InstallTerminal';
import type { Project, PhpProfile, VHostPhpSettings } from '../types';

const TEMPLATES = [
  { 
    id: 'blank',
    icon: (
      <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ), 
    label: 'Blank PHP',   
    note: 'Empty directory with index.php',
    versions: [] as string[],
  },
  { 
    id: 'laravel',     
    icon: <img src="./icons/laravel.svg" alt="Laravel" className="w-6 h-6 object-contain" />, 
    label: 'Laravel',     
    note: 'Modern full-stack PHP framework',
    versions: ['12', '11', '10', '9', '8'],
  },
  { 
    id: 'wordpress',   
    icon: <img src="./icons/wordpress.svg" alt="WordPress" className="w-6 h-6 object-contain" />, 
    label: 'WordPress',   
    note: 'Classic CMS platform',
    versions: ['latest', '6.8', '6.7', '6.6', '6.5', '6.4', '5.9'],
  },
  { 
    id: 'symfony',     
    icon: <img src="./icons/symfony.svg" alt="Symfony" className="w-6 h-6 object-contain" />, 
    label: 'Symfony',     
    note: 'High performance PHP framework',
    versions: ['7.3', '7.2', '6.4', '5.4'],
  },
  { 
    id: 'codeigniter', 
    icon: <img src="./icons/codeigniter.svg" alt="CodeIgniter" className="w-6 h-6 object-contain" />, 
    label: 'CodeIgniter', 
    note: 'Lightweight PHP framework',
    versions: ['4.5', '4.4', '4.3', '3.1'],
  },
  {
    id: 'drupal',
    icon: <img src="./icons/drupal.svg" alt="Drupal" className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />,
    label: 'Drupal',
    note: 'Enterprise CMS',
    versions: ['11', '10'],
  },
  {
    id: 'joomla',
    icon: <img src="./icons/joomla.svg" alt="Joomla" className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />,
    label: 'Joomla',
    note: 'Flexible CMS platform',
    versions: ['5', '4'],
  },
  {
    id: 'prestashop',
    icon: <img src="./icons/prestashop.svg" alt="PrestaShop" className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />,
    label: 'PrestaShop',
    note: 'E-commerce platform',
    versions: ['8', '1.7'],
  },
];

const FRAMEWORK_COLORS: Record<string, string> = {
  laravel: 'bg-red-500/10 text-red-400 border-red-500/20',
  wordpress: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  symfony: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  codeigniter: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  generic: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const FRAMEWORK_LABELS: Record<string, string> = {
  laravel: 'Laravel',
  wordpress: 'WordPress',
  symfony: 'Symfony',
  codeigniter: 'CodeIgniter',
};

export function Projects() {
  const { t } = useTranslation();
  const { projects, setProjects } = useProjectStore();
  const { installedVersions } = usePackageStore();
  const pmaVersions = installedVersions['phpmyadmin'] || [];
  const { settings } = useSettingsStore();
  const { openTerminal } = useTerminalStore();
  const { setActiveTab } = useUIStore();
  const { addToast } = useToastStore();
  
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTemplate, setNewTemplate] = useState('blank');
  const [newFrameworkVersion, setNewFrameworkVersion] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  
  const { clearLogs } = useServiceStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // PHP config modal state
  const [phpModalProject, setPhpModalProject] = useState<Project | null>(null);
  const [phpProfiles, setPhpProfiles] = useState<PhpProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState(false);

  const selectedTemplateObj = useMemo(
    () => TEMPLATES.find((t) => t.id === newTemplate),
    [newTemplate],
  );

  useEffect(() => {
    if (showCreate) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [showCreate]);

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const list = await window.lstack.project.list();
      setProjects(list);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    clearLogs('lstack');
    try {
      await window.lstack.project.create(newName.trim(), newTemplate, {
        frameworkVersion: newFrameworkVersion || undefined,
      });
      addToast({ type: 'success', message: t('projects.create.success', { name: newName.trim() }) });
      setNewName('');
      setNewTemplate('blank');
      setNewFrameworkVersion('');
      setShowCreate(false);
      await loadProjects();
    } catch (err: any) {
      addToast({ type: 'error', message: t('projects.create.error', { message: err?.message ?? String(err) }) });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    setConfirmDelete(null);
    try {
      await window.lstack.project.delete(name);
      addToast({ type: 'success', message: t('projects.delete.success', { name }) });
      await loadProjects();
    } catch (err: any) {
      addToast({ type: 'error', message: t('projects.delete.error', { message: err?.message ?? String(err) }) });
    }
  };

  const handleOpenTerminal = (project: Project) => {
    openTerminal({ id: project.name, projectName: project.name, cwd: project.path });
    setActiveTab('__terminal__');
  };

  // ─── PHP config modal ──────────────────────────────────────────────────
  const openPhpModal = useCallback(async (project: Project) => {
    setPhpModalProject(project);
    try {
      const profiles = await window.lstack.phpProfile.list();
      setPhpProfiles(profiles);
      setSelectedProfileId(project.vhost?.phpProfileId ?? '');
    } catch { /* ignore */ }
  }, []);

  const handleSavePhpProfile = async () => {
    if (!phpModalProject || !selectedProfileId) return;
    setSavingProfile(true);
    try {
      await window.lstack.vhost.updatePhpProfile(phpModalProject.name, selectedProfileId);
      addToast({ type: 'success', message: t('projects.modal.updateProfileSuccess') });
      setPhpModalProject(null);
      await loadProjects();
    } catch (err: any) {
      addToast({ type: 'error', message: t('projects.modal.genericError', { message: err?.message ?? String(err) }) });
    } finally {
      setSavingProfile(false);
    }
  };

  const selectedModalProfile = useMemo(
    () => phpProfiles.find((p) => p.id === selectedProfileId) ?? null,
    [phpProfiles, selectedProfileId],
  );

  const filteredProjects = useMemo(() => {
    return projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                               (p.framework && p.framework.toLowerCase().includes(searchQuery.toLowerCase())));
  }, [projects, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Top Action Bar - Modern & Sticky */}
      <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100 tracking-tight flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              {t('projects.workspace')}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {t('projects.workspaceSummary', { count: String(projects.length) })}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
              <input
                type="text"
                placeholder={t('projects.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-48 md:w-64 bg-slate-800/50 border border-slate-700 rounded-full py-1.5 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
            </div>
            
            {/* View Mode controls */}
            <div className="flex bg-slate-800/50 rounded-full p-0.5 border border-slate-700 hidden sm:flex shrink-0">
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-full transition-colors ${viewMode === 'list' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-slate-700 hidden sm:block mx-1 shrink-0"></div>

            <button
              onClick={loadProjects}
              className="p-2 rounded-full bg-slate-800/50 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors group shrink-0"
              title={t('projects.reload')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            </button>

            {pmaVersions.length > 0 && (
              pmaVersions.length === 1 ? (
                <button
                  onClick={() => window.lstack.system.openBrowser(`http://phpmyadmin.test:${settings?.httpPort || 80}`)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-slate-600 text-slate-200 text-sm font-medium rounded-full transition-all focus:outline-none whitespace-nowrap shrink-0"
                  title={`${t('projects.openPhpMyAdmin', { version: pmaVersions[0] })}`}
                >
                  <Database className="w-4 h-4 text-blue-400" />
                  <span className="hidden md:inline">phpMyAdmin</span>
                </button>
              ) : (
                <div className="relative group shrink-0">
                  <button
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-slate-600 text-slate-200 text-sm font-medium rounded-full transition-all focus:outline-none whitespace-nowrap"
                  >
                    <Database className="w-4 h-4 text-blue-400" />
                    <span className="hidden md:inline">phpMyAdmin</span>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col z-50">
                    <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900 border-b border-slate-700">{t('projects.selectVersion')}</div>
                    {pmaVersions.map(v => (
                      <button
                        key={v}
                        onClick={() => window.lstack.system.openBrowser(`http://phpmyadmin.test:${settings?.httpPort || 80}`)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-200 hover:bg-blue-600/10 hover:text-blue-300 transition-colors whitespace-nowrap"
                      >
                        <Database className="w-4 h-4 text-slate-400" />
                        <span>{t('projects.versionLabel', { version: v })}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-full transition-all shadow-lg shadow-blue-500/20 active:scale-95 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{t('projects.new')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        {/* Create Flow Inline */}
        {showCreate && (
          <div className="mb-8 bg-slate-800/50 border border-blue-500/20 rounded-2xl p-6 shadow-xl animate-in slide-in-from-top-4 fade-in duration-300">
            <h3 className="text-lg font-medium text-slate-100 mb-4 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-400" />
              {t('projects.new')}
            </h3>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-400 block mb-2">{t('projects.nameLabel')}</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                    placeholder="e.g. ecommerce-api"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    ref={nameInputRef}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all font-mono text-sm"
                  />
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Local URL:</span>
                    <span className="text-blue-400/80 font-mono bg-blue-500/10 px-2 py-0.5 rounded">
                      {newName || 'project'}.{settings?.domain || 'test'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCreate}
                    disabled={!newName || creating}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-medium rounded-xl transition-all"
                  >
                    {creating ? t('common.saving') : t('projects.new')}
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-all"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400 block mb-3">{t('projects.templateLabel')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => { setNewTemplate(tpl.id); setNewFrameworkVersion(''); }}
                      className={`text-left flex items-start p-3 rounded-xl border transition-all ${
                        newTemplate === tpl.id
                          ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                          : 'bg-slate-800/40 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xl mr-3 leading-none">{tpl.icon}</span>
                      <div>
                        <div className={`text-sm font-medium ${newTemplate === tpl.id ? 'text-blue-200' : 'text-slate-200'}`}>
                          {tpl.label}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">{tpl.note}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Framework version selector */}
                {selectedTemplateObj && selectedTemplateObj.versions.length > 0 && (
                  <div className="mt-3">
                    <label className="text-xs text-slate-400 mb-1 block">{t('projects.frameworkVersion')}</label>
                    <select
                      value={newFrameworkVersion}
                      onChange={(e) => setNewFrameworkVersion(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">{t('projects.latest')}</option>
                      {selectedTemplateObj.versions.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
            
            {creating && (
              <div className="mt-6 border border-slate-700 rounded-xl overflow-hidden bg-slate-950 relative shadow-inner">
                <InstallTerminal />
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center animate-in fade-in">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-700">
              <Cpu className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-300">{t('projects.noProjectsFound')}</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              {searchQuery ? t('projects.noProjectsHint') : t('projects.workspaceSummary', { count: '0' })}
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
            {filteredProjects.map((project, idx) => (
              <ProjectItem
                key={project.name}
                project={project}
                viewMode={viewMode}
                confirmingDelete={confirmDelete === project.name}
                onDeleteRequest={() => setConfirmDelete(project.name)}
                onDeleteConfirm={() => handleDelete(project.name)}
                onDeleteCancel={() => setConfirmDelete(null)}
                onOpenTerminal={() => handleOpenTerminal(project)}
                onOpenPhpConfig={() => openPhpModal(project)}
                index={idx}
              />
            ))}
          </div>
        )}
      </div>

      {/* PHP Configuration Modal */}
      {phpModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/50">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Cpu size={16} className="text-blue-400" />
                {t('projects.modal.phpConfiguration')} — {phpModalProject.name}
              </h2>
              <button
                onClick={() => setPhpModalProject(null)}
                className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Profile selector */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('projects.modal.phpProfile')}</label>
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">—</option>
                  {phpProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (PHP {p.phpVersion})</option>
                  ))}
                </select>
              </div>

              {/* Read-only profile details */}
              {selectedModalProfile && (
                <div className="space-y-3 text-xs">
                  <p className="text-slate-400">
                    {t('projects.modal.profileRuntimeDefault', { version: selectedModalProfile.phpVersion })}
                  </p>

                  <div>
                    <p className="text-slate-500 font-medium mb-1">{t('projects.modal.profileSettings')}</p>
                    <p className="text-[11px] text-slate-600 mb-2">{t('projects.modal.profileSettingsHint')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(selectedModalProfile.phpSettings ?? {}).map(([key, val]) => (
                        <div key={key} className="flex justify-between bg-slate-900/50 px-2 py-1 rounded border border-slate-800">
                          <span className="text-slate-500 font-mono">{key}</span>
                          <span className="text-slate-300 font-mono">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(selectedModalProfile.phpExtensions ?? []).length > 0 && (
                    <div>
                      <p className="text-slate-500 font-medium mb-1">{t('projects.modal.enabledExtensions')}</p>
                      <p className="text-[11px] text-slate-600 mb-2">{t('projects.modal.extensionsHint')}</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedModalProfile.phpExtensions.map((ext) => (
                          <span key={ext} className="px-2 py-0.5 text-[11px] rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                            {ext}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900/30">
              <button
                onClick={() => setPhpModalProject(null)}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 rounded-md transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSavePhpProfile}
                disabled={savingProfile || !selectedProfileId}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {savingProfile ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Project Item Component ─────────────────────────────────────────────────────────────
function ProjectItem({ project, viewMode, confirmingDelete, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onOpenTerminal, onOpenPhpConfig, index }: any) {
  const { t } = useTranslation();
  const url = `http://${project.hostname}`;
  
  const tags = [
    project.hasGit && { icon: GitBranch, label: 'Git', color: 'text-amber-400', bg: 'bg-amber-400/10' },
    project.hasComposer && { icon: Package, label: 'Composer', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    project.hasPackageJson && { icon: Code, label: 'NPM/Yarn', color: 'text-rose-400', bg: 'bg-rose-400/10' }
  ].filter(Boolean);

  const isGrid = viewMode === 'grid';
  
  return (
    <div 
      className={`group relative bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700 hover:border-slate-600 rounded-2xl transition-all duration-300 ${
        isGrid ? 'p-5 flex flex-col h-full' : 'p-3 flex items-center gap-4'
      }`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Icon & Title Area */}
      <div className={`flex items-start ${isGrid ? 'mb-4' : 'w-1/3 min-w-[200px]'}`}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-sky-500/20 border border-blue-500/10 flex items-center justify-center shrink-0 text-blue-400 mr-3">
          <FolderOpen className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-100 text-base truncate pr-2 group-hover:text-blue-300 transition-colors">
            {project.name}
          </h3>
          <a
            onClick={() => window.lstack.system.openBrowser(url)}
            className="text-xs text-slate-400 hover:text-blue-400 cursor-pointer flex items-center gap-1 mt-0.5 truncate max-w-full font-mono"
            title={url}
          >
            {project.hostname}
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        </div>
      </div>

      {/* Metadata / Tags */}
      <div className={`flex items-center gap-2 ${isGrid ? 'mb-6 flex-wrap' : 'w-1/3 justify-center'}`}>
        {project.framework && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${FRAMEWORK_COLORS[project.framework] || FRAMEWORK_COLORS.generic}`}>
            {FRAMEWORK_LABELS[project.framework] || project.framework}
          </span>
        )}
        
        {tags.map((Tag: any, i) => (
          <div key={i} className={`flex items-center justify-center w-6 h-6 rounded-full ${Tag.bg} ${Tag.color} tooltip-trigger`} title={Tag.label}>
            <Tag.icon className="w-3.5 h-3.5" />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className={`flex items-center gap-2 ${isGrid ? 'mt-auto justify-end pt-4 border-t border-slate-700' : 'ml-auto'}`}>
        {confirmingDelete ? (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5 animate-in slide-in-from-right-4">
            <span className="text-xs text-red-400 font-medium mr-2">{t('projects.delete.success', { name: '' }).split('"')[0]}?</span>
            <button onClick={onDeleteConfirm} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors">
              OK
            </button>
            <button onClick={onDeleteCancel} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium rounded-lg transition-colors">
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={() => window.lstack.system.openBrowser(url)} className="p-2 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded-xl transition-all" title={t('projects.workspace')}>
              <Globe className="w-4 h-4" />
            </button>
            <button onClick={onOpenTerminal} className="p-2 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded-xl transition-all" title={t('projects.openTerminal')}>
              <TerminalSquare className="w-4 h-4" />
            </button>
            <button onClick={() => window.lstack.project.open(project.path)} className="p-2 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded-xl transition-all" title={t('projects.openExplorer')}>
              <FolderOpen className="w-4 h-4" />
            </button>
            <button onClick={onOpenPhpConfig} className="p-2 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded-xl transition-all" title={t('projects.modal.phpConfiguration')}>
              <Settings2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-700 mx-1"></div>
            <button onClick={onDeleteRequest} className="p-2 bg-slate-800 hover:bg-red-500 hover:text-white text-slate-400 rounded-xl transition-all" title={t('projects.deleteProject')}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
