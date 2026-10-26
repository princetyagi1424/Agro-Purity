import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Locale, TranslationKey } from './types';
import { en } from './en';
import { hi } from './hi';
import { ta } from './ta';

const STORAGE_KEY = 'agropurity-lang';
const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en: en as unknown as Record<TranslationKey, string>,
  hi: hi as unknown as Record<TranslationKey, string>,
  ta: ta as unknown as Record<TranslationKey, string>,
};

function detectInitial(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'hi' || stored === 'ta') return stored;
  } catch {
    /* ignore */
  }
  return 'en';
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
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey) => {
      const dict = dictionaries[locale] ?? dictionaries.en;
      return dict[key] ?? dictionaries.en[key] ?? key;
    },
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
