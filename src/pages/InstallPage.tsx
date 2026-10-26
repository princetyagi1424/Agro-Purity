import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function InstallPage() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>Install AgroPurity</h1>
      <div className="card">
        <p>
          Install the app for quicker access, on-device grain-image analysis, and local inspection
          history. After assets are cached, core features can work offline.
        </p>

        {isInstalled && (
          <div className="alert alert-info">AgroPurity appears to be running in installed / standalone mode.</div>
        )}

        {canInstall && !isInstalled && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => promptInstall()}
          >
            Install App
          </button>
        )}

        {!canInstall && !isInstalled && (
          <div className="alert alert-warning">
            Your browser has not offered an automatic install prompt yet. Use the manual steps below.
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Android / Chrome</h2>
        <ol>
          <li>Open this site over HTTPS.</li>
          <li>Tap the menu (⋮) → <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li>Or use the Install App button when it appears above.</li>
        </ol>
      </div>

      {isIOS && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>iPhone / iPad (Safari)</h2>
          <ol>
            <li>Tap the Share button.</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
            <li>Confirm the name and tap Add.</li>
          </ol>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Desktop</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
          In Chromium-based browsers, look for the install icon in the address bar, or use the browser
          menu → Install AgroPurity.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Android APK</h2>
        <div className="alert alert-warning">
          A signed release APK is not yet published for this prototype. Prefer the PWA install above.
          Building a Capacitor/Android APK requires Android SDK tooling and a signing keystore that
          must not be committed to the repository. Status: <strong>not available</strong>.
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>What works offline</h2>
        <ul style={{ color: 'var(--color-text-muted)' }}>
          <li>Application shell after first successful load and cache.</li>
          <li>Local image analysis (canvas pipeline).</li>
          <li>IndexedDB inspection history (while storage remains).</li>
        </ul>
      </div>
    </div>
  );
}
