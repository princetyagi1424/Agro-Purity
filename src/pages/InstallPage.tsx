import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useI18n } from '../i18n';

export function InstallPage() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const { t } = useI18n();
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>{t('install.title')}</h1>
      <div className="card">
        <p>{t('install.intro')}</p>
        {isInstalled && <div className="alert alert-info">{t('install.standalone')}</div>}
        {canInstall && !isInstalled && (
          <button type="button" className="btn btn-primary" onClick={() => promptInstall()}>
            {t('nav.installApp')}
          </button>
        )}
        {!canInstall && !isInstalled && (
          <div className="alert alert-warning">{t('install.noPrompt')}</div>
        )}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('install.androidTitle')}</h2>
        <ol>
          <li>{t('install.android1')}</li>
          <li>{t('install.android2')}</li>
          <li>{t('install.android3')}</li>
        </ol>
      </div>
      {isIOS && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('install.iosTitle')}</h2>
          <ol>
            <li>{t('install.ios1')}</li>
            <li>{t('install.ios2')}</li>
            <li>{t('install.ios3')}</li>
          </ol>
        </div>
      )}
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('install.desktopTitle')}</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>{t('install.desktopBody')}</p>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('install.apkTitle')}</h2>
        <div className="alert alert-warning">{t('install.apkBody')}</div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('install.offlineTitle')}</h2>
        <ul style={{ color: 'var(--color-text-muted)' }}>
          <li>{t('install.offline1')}</li>
          <li>{t('install.offline2')}</li>
          <li>{t('install.offline3')}</li>
        </ul>
      </div>
    </div>
  );
}
