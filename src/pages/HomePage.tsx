import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { listRecords } from '../lib/storage/db';
import type { InspectionRecord } from '../types';
import { DISCLAIMER } from '../types';

export function HomePage() {
  const [recent, setRecent] = useState<InspectionRecord[]>([]);

  useEffect(() => {
    listRecords()
      .then((r) => setRecent(r.slice(0, 5)))
      .catch(() => setRecent([]));
  }, []);

  return (
    <div>
      <section className="card" style={{ textAlign: 'center', padding: '2rem 1.25rem' }}>
        <h1 style={{ margin: '0 0 0.5rem', color: 'var(--color-primary-dark)', fontSize: '1.75rem' }}>
          AgroPurity
        </h1>
        <p style={{ color: 'var(--color-text-muted)', maxWidth: 520, margin: '0 auto 1.25rem' }}>
          Preliminary browser-based visual grain screening. Capture or upload a photo of grains on white
          paper, run local image analysis, and keep a reviewable on-device record.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/inspect" className="btn btn-primary">
            Start Grain Inspection
          </Link>
          <Link to="/demo" className="btn btn-secondary">
            Try Demo Sample
          </Link>
        </div>
      </section>

      <div className="disclaimer" role="note">
        {DISCLAIMER}
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>How it works</h2>
        <ol className="steps">
          <li>Select wheat (first calibrated target) and spread grains in a thin layer on plain white A4 paper.</li>
          <li>Capture with the camera or upload a clear photo under even lighting.</li>
          <li>The app converts to grayscale, applies Otsu thresholding, labels connected components, and applies provisional classification rules.</li>
          <li>Review annotated results, adjust labels if needed, and save a local evidence record.</li>
        </ol>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Supported grain &amp; limitations</h2>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-text-muted)' }}>
          <li><strong>Wheat</strong> — primary prototype target with provisional heuristics.</li>
          <li>Rice, pulses, and other crops — marked unavailable until separately calibrated.</li>
          <li>Overlapping or touching grains may be counted as one object.</li>
          <li>Not an official grade, AGMARK certificate, or procurement calculation.</li>
          <li>All analysis runs on-device; images are not uploaded by default.</li>
        </ul>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Privacy &amp; offline</h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
          Inspection images and records stay in this browser&apos;s IndexedDB. No account required.
          After installation as a PWA, core assets can work offline once cached. Browser data can still
          be cleared by the user or the browser.
        </p>
      </section>

      {recent.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Recent local records</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.map((r) => (
              <li key={r.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <Link to={`/history/${r.id}`}>
                  {new Date(r.createdAt).toLocaleString()} — {r.grainType} — W:{r.counts.whole} B:{r.counts.broken} F:{r.counts.foreign}
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/history" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
            View all history →
          </Link>
        </section>
      )}
    </div>
  );
}
