import { Link, useNavigate } from 'react-router-dom';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useI18n, type Locale } from '../i18n';

const LOCALES: { code: Locale; native: string }[] = [
  { code: 'en', native: 'English' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'ta', native: 'தமிழ்' },
];

export function Header() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label={t('appName')}>
        <span aria-hidden="true">🌾</span>
        {t('appName')}
      </Link>
      <nav aria-label="Main">
        <Link to="/inspect">{t('nav.inspect')}</Link>
        <Link to="/history">{t('nav.history')}</Link>
        <Link to="/demo">{t('nav.demo')}</Link>
        <Link to="/install">{t('nav.install')}</Link>
        <label className="lang-select-wrap">
          <span className="sr-only">{t('lang.label')}</span>
          <select className="lang-select" value={locale} aria-label={t('lang.label')} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALES.map((l) => (<option key={l.code} value={l.code}>{l.native}</option>))}
          </select>
        </label>
        {canInstall && !isInstalled && (
          <button type="button" className="btn btn-accent btn-sm" onClick={async () => {
            const r = await promptInstall();
            if (r.outcome === 'unavailable') navigate('/install');
          }}>{t('nav.installApp')}</button>
        )}
      </nav>
    </header>
  );
}
