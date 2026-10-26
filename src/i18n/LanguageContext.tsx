import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale, TranslationKey } from './types';
import { en } from './en';
import { hi } from './hi';
import { ta } from './ta';
import { pa } from './pa';
import { haryanvi } from './haryanvi';
import { mr } from './mr';

const STORAGE_KEY = 'agropurity-lang';
const VALID: Locale[] = ['en', 'hi', 'ta', 'pa', 'haryanvi', 'mr'];

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en: en as Record<TranslationKey, string>,
  hi: hi as Record<TranslationKey, string>,
  ta: ta as Record<TranslationKey, string>,
  pa: pa as Record<TranslationKey, string>,
  haryanvi: haryanvi as Record<TranslationKey, string>,
  mr: mr as Record<TranslationKey, string>,
};

function detectInitial(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (VALID as string[]).includes(stored)) return stored as Locale;
  } catch { /* */ }
  return 'en';
}

/** Map app locale to BCP-47 for speech / date formatting */
export function localeToBcp47(locale: Locale): string {
  switch (locale) {
    case 'hi': return 'hi-IN';
    case 'ta': return 'ta-IN';
    case 'pa': return 'pa-IN';
    case 'haryanvi': return 'hi-IN';
    case 'mr': return 'mr-IN';
    default: return 'en-IN';
  }
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    typeof window !== 'undefined' ? detectInitial() : 'en'
  );
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === 'haryanvi' ? 'hi' : locale;
  }, [locale]);
  const t = useCallback(
    (key: TranslationKey) => dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key,
    [locale]
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}
