import { useMemo } from 'react';
import { useSettingsStore } from '../store';
import { vi } from './locales/vi';
import { en } from './locales/en';

export type TranslationKey = keyof typeof vi;

const locales: Record<string, Record<string, string>> = { vi, en };

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    return val == null ? '' : String(val);
  });
}

function translate(
  lang: string,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dict = locales[lang] ?? locales.vi;
  return interpolate(dict[key] ?? locales.vi[key] ?? key, params);
}

export function useTranslation() {
  const language = useSettingsStore((s) => s.settings?.language ?? 'vi');

  return useMemo(
    () => ({
      language,
      t: (key: TranslationKey, params?: Record<string, string | number>) =>
        translate(language, key, params),
    }),
    [language],
  );
}
