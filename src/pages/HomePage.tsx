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
      <section className="card" style={{ textAlign: 'center', padding: '2rem 1.25rem' }}>
        <h1 style={{ margin: '0 0 0.5rem', color: 'var(--color-primary-dark, #1b4332)', fontSize: '1.75rem' }}>
          {t('home.title')}
        </h1>
        <p style={{ color: 'var(--color-text-muted, #5c6b5a)', maxWidth: 520, margin: '0 auto 1.25rem' }}>
          {t('home.tagline')}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/inspect" className="btn btn-primary">{t('home.start')}</Link>
          <Link to="/demo" className="btn btn-secondary">{t('home.tryDemo')}</Link>
        </div>
      </section>

      <div className="disclaimer" role="note">{t('disclaimer')}</div>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('home.howTitle')}</h2>
        <ol className="steps">
          <li>{t('home.step1')}</li>
          <li>{t('home.step2')}</li>
          <li>{t('home.step3')}</li>
          <li>{t('home.step4')}</li>
        </ol>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('home.photoHelpTitle')}</h2>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-text-muted, #5c6b5a)' }}>
          <li>{t('home.photoHelp1')}</li>
          <li>{t('home.photoHelp2')}</li>
          <li>{t('home.photoHelp3')}</li>
          <li>{t('home.photoHelp4')}</li>
        </ul>
        {'speechSynthesis' in window && (
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '0.75rem' }} onClick={toggleSpeak}>
            {speaking ? t('home.stopAloud') : t('home.readAloud')}
          </button>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('home.supportedTitle')}</h2>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-text-muted, #5c6b5a)' }}>
          <li><strong>{t('home.wheat')}</strong></li>
          <li>{t('home.otherGrains')}</li>
          <li>{t('home.overlap')}</li>
          <li>{t('home.notOfficial')}</li>
          <li>{t('home.onDevice')}</li>
        </ul>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('home.privacyTitle')}</h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted, #5c6b5a)', fontSize: '0.95rem' }}>
          {t('home.privacyBody')}
        </p>
      </section>

      {recent.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('home.recent')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.map((r) => (
              <li key={r.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--color-border, #d8e0d4)' }}>
                <Link to={`/history/${r.id}`}>
                  {new Date(r.createdAt).toLocaleString()} — {r.grainType} — W:{r.counts.whole} B:{r.counts.broken} F:{r.counts.foreign}
                  {(r.inputSource === 'demo' || r.notes === 'synthetic-demo') ? ` (${t('history.synthetic')})` : ''}
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/history" style={{ display: 'inline-block', marginTop: '0.75rem' }}>{t('home.viewAll')}</Link>
        </section>
      )}
    </div>
  );
}
