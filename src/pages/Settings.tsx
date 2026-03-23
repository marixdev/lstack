import { useEffect, useState } from 'react';
import { Save, FolderOpen, CheckCircle, XCircle, Download, Loader } from 'lucide-react';
import { useSettingsStore, useUIStore, useToastStore } from '../store';
import type { CertStatus, LStackSettings, SslProviderStatus } from '../types';
import { useTranslation } from '../i18n';

export function Settings() {
  const { settings, setSettings } = useSettingsStore();
  const { platform } = useUIStore();
  const { addToast } = useToastStore();
  const { t } = useTranslation();
  const [form, setForm] = useState<LStackSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [certStatus, setCertStatus] = useState<CertStatus | null>(null);
  const [certInstalling, setCertInstalling] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);


  useEffect(() => {
    if (settings) setForm({ ...settings });
  }, [settings]);

  useEffect(() => {
    window.lstack.cert.status().then(setCertStatus).catch(() => {});
  }, []);

  const update = (patch: Partial<LStackSettings>) => {
    setForm((f) => f ? { ...f, ...patch } : f);
  };

  const handleSave = async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      await window.lstack.settings.set(form);
      setSettings(form);
      addToast({ type: 'success', message: t('settings.save.success') });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      addToast({ type: 'error', message: t('settings.save.error', { message: e.message }) });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectDir = async (field: keyof LStackSettings) => {
    const dir = await window.lstack.system.selectDir();
    if (dir) update({ [field]: dir });
  };

  const handleTrustCert = async () => {
    setCertInstalling(true);
    setCertError(null);
    try {
      await window.lstack.cert.install();
      const status = await window.lstack.cert.status();
      setCertStatus(status);
      addToast({ type: 'success', message: t('settings.ssl.install.success') });
    } catch (err: any) {
      const errorMsg = err?.message || t('settings.ssl.install.fallbackError');
      setCertError(errorMsg);
      addToast({ type: 'error', message: t('settings.ssl.install.error', { message: errorMsg }) });
    } finally {
      setCertInstalling(false);
    }
  };

  if (!form) return null;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">{t('settings.title')}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{t('settings.subtitle')}</p>
      </div>

      {/* Directories */}
      <Section title={t('settings.section.directories')}>
        <DirField
          label={t('settings.field.wwwDir')}
          value={form.wwwDir}
          onChange={(v) => update({ wwwDir: v })}
          onBrowse={() => handleSelectDir('wwwDir')}
        />
        <DirField
          label={t('settings.field.dataDir')}
          value={form.dataDir}
          onChange={(v) => update({ dataDir: v })}
          onBrowse={() => handleSelectDir('dataDir')}
        />
        <DirField
          label={t('settings.field.binDir')}
          value={form.binDir}
          onChange={(v) => update({ binDir: v })}
          onBrowse={() => handleSelectDir('binDir')}
        />
      </Section>

      {/* Network */}
      <Section title={t('settings.section.network')}>
        <div className="grid grid-cols-3 gap-3">
          <NumberField
            label={t('settings.field.httpPort')}
            value={form.httpPort}
            onChange={(v) => update({ httpPort: v })}
          />
          <NumberField
            label={t('settings.field.httpsPort')}
            value={form.httpsPort}
            onChange={(v) => update({ httpsPort: v })}
          />
          <NumberField
            label={t('settings.field.mariadbPort')}
            value={form.mariadbPort}
            onChange={(v) => update({ mariadbPort: v })}
          />
        </div>

        <FormField label={t('settings.field.domainSuffix')}>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-sm">project.</span>
            <input
              value={form.domain}
              onChange={(e) => update({ domain: e.target.value })}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder="test"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {t('settings.field.domainExample', { domain: form.domain })
              .split(`myapp.${form.domain}`)
              .map((part, index, parts) => (
                <span key={`${part}-${index}`}>
                  {part}
                  {index < parts.length - 1 && <span className="text-blue-400">myapp.{form.domain}</span>}
                </span>
              ))}
          </p>
        </FormField>
      </Section>

      {/* Web server */}
      <Section title={t('settings.section.webserver')}>
        <div className="flex gap-3">
          {(['nginx', 'apache'] as const).map((ws) => (
            <button
              key={ws}
              onClick={() => update({ webserver: ws as any })}
              disabled={saving}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                form.webserver === ws
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {ws}
            </button>
          ))}
        </div>
      </Section>

      {/* Behavior */}
      <Section title={t('settings.section.behavior')}>
        <ToggleField
          label={t('settings.field.autoVirtualHost')}
          description={t('settings.field.autoVirtualHostDescription')}
          value={form.autoVirtualHost}
          onChange={(v) => update({ autoVirtualHost: v })}
        />
        <ToggleField
          label={t('settings.field.autoStartServices')}
          description={t('settings.field.autoStartServicesDescription')}
          value={form.autoStartServices}
          onChange={(v) => update({ autoStartServices: v })}
        />
      </Section>

      {/* SSL */}
      <Section title={t('settings.section.ssl')}>
        <div className="space-y-2">
          <StatusRow
            label="mkcert"
            ok={certStatus?.mkcertReady ?? false}
            okText={t('settings.ssl.mkcertReady')}
            failText={t('settings.ssl.mkcertMissing')}
            loading={certStatus === null}
            loadingText={t('settings.ssl.checking')}
          />
          <StatusRow
            label="CA file"
            ok={certStatus?.caExists ?? false}
            okText={t('settings.ssl.caReady')}
            failText={t('settings.ssl.caMissing')}
            loading={certStatus === null}
            loadingText={t('settings.ssl.checking')}
          />
          {certStatus?.providers.map((provider) => (
            <ProviderStatusRow key={provider.id} provider={provider} loading={certStatus === null} />
          ))}
        </div>

        {certError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {certError}
          </p>
        )}

        {certStatus?.caExists && (
          <div className="space-y-2 mb-3">
            <p className="text-xs text-slate-400">
              {t('settings.ssl.wildcardReady', { domain: form?.domain || 'test' })}
              {' '}
              {platform === 'linux'
                ? t('settings.ssl.linuxProviders')
                : t('settings.ssl.platformProviders')}
            </p>
            {certStatus.warnings.length > 0 && (
              <div className="space-y-1">
                {certStatus.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={handleTrustCert}
          disabled={certInstalling}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
          {certInstalling
            ? <><Loader size={14} className="animate-spin" /> {t('settings.button.processing')}</>
            : <><Download size={14} /> {certStatus?.caExists ? t('settings.button.reinstallSsl') : t('settings.button.installSsl')}</>
          }
        </button>

        <p className="text-xs text-slate-500">
          {t('settings.ssl.help')}
        </p>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? t('settings.button.saving') : saved ? t('settings.button.saved') : t('settings.button.save')}
        </button>
        {saved && <span className="text-green-400 text-sm">✓ {t('settings.save.successInline')}</span>}
      </div>
    </div>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-1.5">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function DirField({
  label, value, onChange, onBrowse,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBrowse: () => void;
}) {
  const { t } = useTranslation();
  return (
    <FormField label={label}>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
        />
        <button
          onClick={onBrowse}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
          title={t('settings.button.browse')}
        >
          <FolderOpen size={14} />
        </button>
      </div>
    </FormField>
  );
}

function NumberField({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <FormField label={label}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={1}
        max={65535}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
      />
    </FormField>
  );
}

function StatusRow({
  label, ok, okText, failText, loading, loadingText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
  loading: boolean;
  loadingText?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-300">{label}</span>
      {loading ? (
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader size={12} className="animate-spin" /> {loadingText || 'Đang kiểm tra...'}
        </span>
      ) : ok ? (
        <span className="flex items-center gap-1.5 text-xs text-green-400">
          <CheckCircle size={13} /> {okText}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <XCircle size={13} /> {failText}
        </span>
      )}
    </div>
  );
}

function ProviderStatusRow({ provider, loading }: { provider: SslProviderStatus; loading: boolean }) {
  const ok = provider.ready === true;
  const failText = provider.ready === null ? `${provider.message} (không áp dụng hoặc chưa có dữ liệu)` : provider.message;

  return (
    <div className="space-y-1 py-1">
      <StatusRow
        label={provider.label}
        ok={ok}
        okText={provider.message}
        failText={failText}
        loading={loading}
      />
      {provider.warnings?.map((warning) => (
        <p key={`${provider.id}-${warning}`} className="text-xs text-amber-300/90 pl-1">
          {warning}
        </p>
      ))}
    </div>
  );
}

function ToggleField({
  label, description, value, onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <div className="text-sm text-slate-200">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 overflow-hidden ${
          value ? 'bg-blue-600' : 'bg-slate-700'
        }`}
      >
        <span
          className={`absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
