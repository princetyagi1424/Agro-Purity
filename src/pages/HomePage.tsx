import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { listRecords } from '../lib/storage/db';
import type { InspectionRecord } from '../types';
import { useI18n } from '../i18n';

export function HomePage() {
  const { t, locale } = useI18n();
  const [recent, setRecent] = useState<InspectionRecord[]>([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    listRecords()
      .then((r) => setRecent(r.slice(0, 5)))
      .catch(() => setRecent([]));
  }, []);

  const helpText = [t('home.photoHelp1'), t('home.photoHelp2'), t('home.photoHelp3'), t('home.photoHelp4')].join('. ');

  const toggleSpeak = () => {
    if (!('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(helpText);
    u.lang = locale === 'hi' ? 'hi-IN' : locale === 'ta' ? 'ta-IN' : 'en-IN';
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  return (
    <div>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-kicker">🌾 AgroPurity · On-device screening</div>
        <h1>Know Your Wheat. Improve Your Harvest.</h1>
        <p className="hero-lead">{t('home.tagline')}</p>
        <div className="hero-actions">
          <Link to="/inspect" className="btn btn-primary">
            {t('home.start')}
          </Link>
          <Link to="/demo" className="btn btn-secondary">
            {t('home.tryDemo')}
          </Link>
        </div>
      </section>

      <h2 className="section-title">{t('home.howTitle')}</h2>
      <div className="feature-grid">
        <div className="feature-card">
          <div className="icon" aria-hidden="true">📷</div>
          <h3>1</h3>
          <p>{t('home.step1')}</p>
        </div>
        <div className="feature-card">
          <div className="icon" aria-hidden="true">✨</div>
          <h3>2</h3>
          <p>{t('home.step2')}</p>
        </div>
        <div className="feature-card">
          <div className="icon" aria-hidden="true">🔬</div>
          <h3>3</h3>
          <p>{t('home.step3')}</p>
        </div>
        <div className="feature-card">
          <div className="icon" aria-hidden="true">💾</div>
          <h3>4</h3>
          <p>{t('home.step4')}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('home.supportedTitle')}</h2>
        <ul className="steps">
          <li>{t('home.wheat')}</li>
          <li>{t('home.otherGrains')}</li>
          <li>{t('home.overlap')}</li>
          <li>{t('home.notOfficial')}</li>
          <li>{t('home.onDevice')}</li>
        </ul>
      </div>

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('home.privacyTitle')}</h2>
        <p style={{ margin: 0, color: 'var(--muted)' }}>{t('home.privacyBody')}</p>
      </div>

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('home.photoHelpTitle')}</h2>
        <ol className="steps">
          <li>{t('home.photoHelp1')}</li>
          <li>{t('home.photoHelp2')}</li>
          <li>{t('home.photoHelp3')}</li>
          <li>{t('home.photoHelp4')}</li>
        </ol>
        <button type="button" className="btn btn-secondary btn-sm" onClick={toggleSpeak} style={{ marginTop: '0.75rem' }}>
          {speaking ? t('home.stopAloud') : t('home.readAloud')}
        </button>
      </div>

      <div className="disclaimer">{t('disclaimer')}</div>

      {recent.length > 0 && (
        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>{t('home.recent')}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {recent.map((r) => (
              <li key={r.id} style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: '0.9rem' }}>
                <Link to={`/history/${r.id}`} style={{ fontWeight: 600 }}>
                  {new Date(r.createdAt).toLocaleString()}
                </Link>
                {' · '}{r.grainType} · W:{r.counts.whole} B:{r.counts.broken} F:{r.counts.foreign}
              </li>
            ))}
          </ul>
          <Link to="/history" className="btn btn-secondary btn-sm" style={{ marginTop: '0.85rem' }}>
            {t('home.viewAll')}
          </Link>
        </div>
      )}
    </div>
  );
}
