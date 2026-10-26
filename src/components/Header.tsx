import { Link, useNavigate } from 'react-router-dom';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function Header() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const navigate = useNavigate();

  const handleInstall = async () => {
    const result = await promptInstall();
    if (result.outcome === 'unavailable') {
      navigate('/install');
    }
  };

  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="AgroPurity home">
        <span aria-hidden="true">🌾</span>
        AgroPurity
      </Link>
      <nav aria-label="Main">
        <Link to="/inspect">Inspect</Link>
        <Link to="/history">History</Link>
        <Link to="/demo">Demo</Link>
        <Link to="/install">Install</Link>
        {canInstall && !isInstalled && (
          <button type="button" className="btn btn-accent btn-sm" onClick={handleInstall}>
            Install App
          </button>
        )}
        {isInstalled && (
          <span className="badge badge-whole" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
            Installed
          </span>
        )}
      </nav>
    </header>
  );
}
