import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runPipeline, countLabels } from '../lib/imageProcessing/pipeline';
import { saveRecord, generateId, dataUrlToBlob } from '../lib/storage/db';
import type { InspectionResult, ComponentFeatures } from '../types';
import { ALGORITHM_VERSION } from '../types';
import { useI18n } from '../i18n';
import { buildInspectionCsv, downloadTextFile, printInspectionReport } from '../lib/exportReport';
import { DecisionPanel } from '../components/DecisionPanel';

function createSyntheticGrainImage(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f5f5f0'; ctx.fillRect(0, 0, 640, 480);
  const grains = [
    { x: 120, y: 100, rx: 28, ry: 18, rot: 0.3, color: '#c4a35a' },
    { x: 220, y: 130, rx: 26, ry: 17, rot: -0.2, color: '#d4b36a' },
    { x: 320, y: 90, rx: 30, ry: 19, rot: 0.5, color: '#b8954a' },
    { x: 420, y: 140, rx: 27, ry: 18, rot: -0.4, color: '#c9a85e' },
    { x: 180, y: 340, rx: 22, ry: 10, rot: 0.8, color: '#c4a35a' },
    { x: 500, y: 300, rx: 22, ry: 20, rot: 0, color: '#000000' },
  ];
  for (const g of grains) {
    if (g.color === '#000000' || g.color === '#1a1a1a') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(g.x - g.rx, g.y - g.ry, g.rx * 2, g.ry * 2);
      continue;
    }
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot);
    ctx.beginPath(); ctx.ellipse(0, 0, g.rx, g.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = g.color; ctx.fill(); ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

export function DemoPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [detections, setDetections] = useState<ComponentFeatures[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoSrc] = useState(() => createSyntheticGrainImage());
  const [view, setView] = useState<'original' | 'annotated'>('annotated');

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const res = await runPipeline(demoSrc, { forceContinue: true });
      setResult(res); setDetections(res.detections);
      setView(res.annotatedImageDataUrl ? 'annotated' : 'original');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inspect.analysisFail'));
    } finally { setRunning(false); }
  };

  const counts = countLabels(detections);

  const exportJson = () => {
    if (!result) return;
    const payload = {
      kind: 'agropurity-inspection', synthetic: true, grainType: 'wheat', inputSource: 'demo',
      algorithmVersion: ALGORITHM_VERSION, counts: result.counts, detections,
      disclaimer: t('disclaimer'), note: 'Synthetic demo', exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `demo-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    if (!result) return;
    const csv = buildInspectionCsv({
      createdAt: new Date().toISOString(),
      grainType: 'wheat',
      inputSource: 'demo',
      algorithmVersion: ALGORITHM_VERSION,
      synthetic: true,
      counts: result.counts,
      adjustedCounts: counts,
      detections,
      disclaimer: t('disclaimer'),
    });
    downloadTextFile(csv, `demo-${Date.now()}.csv`, 'text/csv;charset=utf-8');
  };

  const printReport = () => {
    if (!result) return;
    printInspectionReport({
      title: t('demo.title'),
      disclaimer: t('disclaimer'),
      meta: [['Source', 'demo'], ['Algorithm', ALGORITHM_VERSION]],
      counts,
      labels: {
        whole: t('inspect.whole'),
        broken: t('inspect.broken'),
        foreign: t('inspect.foreign'),
        uncertain: t('inspect.uncertain'),
      },
      imageSrc: result.annotatedImageDataUrl || demoSrc,
      synthetic: true,
      syntheticLabel: t('history.synthetic'),
    });
  };

  const saveDemo = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const id = generateId();
      const orig = dataUrlToBlob(demoSrc);
      const ann = result.annotatedImageDataUrl ? dataUrlToBlob(result.annotatedImageDataUrl) : undefined;
      await saveRecord({
        id, createdAt: new Date().toISOString(), grainType: 'wheat', inputSource: 'demo',
        algorithmVersion: ALGORITHM_VERSION, counts: result.counts, adjustedCounts: counts,
        qualityWarnings: result.quality.issues.map((i) => i.message), diagnostics: result.diagnostics,
        originalImageKey: `${id}_o`, annotatedImageKey: `${id}_a`, detections,
        notes: 'synthetic-demo', disclaimer: t('disclaimer'),
      }, orig, ann);
      navigate(`/history/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inspect.saveFail'));
    } finally { setSaving(false); }
  };

  const display = view === 'annotated' && result?.annotatedImageDataUrl ? result.annotatedImageDataUrl : demoSrc;

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>{t('demo.title')}</h1>
      <div className="alert alert-info">{t('demo.banner')}</div>
      <div className="disclaimer">{t('disclaimer')}</div>
      {error && <div className="alert alert-error" role="alert" aria-live="assertive">{error}</div>}
      <div className="card">
        <img src={demoSrc} alt={t('demo.title')} className="result-img" />
        <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={run} disabled={running}>
          {running ? t('demo.running') : t('demo.run')}
        </button>
      </div>
      {result && (
        <>
        <div className="card">
          <div className="counts-row">
            <span className="count-chip">{t('inspect.whole')} {counts.whole}</span>
            <span className="count-chip">{t('inspect.broken')} {counts.broken}</span>
            <span className="count-chip">{t('inspect.foreign')} {counts.foreign}</span>
            <span className="count-chip">{t('inspect.uncertain')} {counts.uncertain}</span>
          </div>
          <ul style={{ margin: '0.75rem 0', paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--muted, #A6B3A2)' }}>
            <li>{t('inspect.legendWhole')}</li>
            <li>{t('inspect.legendBroken')}</li>
            <li>{t('inspect.legendForeign')}</li>
            <li>{t('inspect.legendUncertain')}</li>
          </ul>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <button type="button" className={`btn btn-secondary btn-sm${view === 'original' ? ' active' : ''}`} onClick={() => setView('original')}>{t('inspect.showOriginal')}</button>
            <button type="button" className={`btn btn-secondary btn-sm${view === 'annotated' ? ' active' : ''}`} onClick={() => setView('annotated')} disabled={!result.annotatedImageDataUrl}>{t('inspect.showAnnotated')}</button>
          </div>
          <img src={display} alt={view === 'annotated' ? t('inspect.annotated') : t('inspect.original')} className="result-img" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveDemo} disabled={saving}>{saving ? t('inspect.saving') : t('demo.save')}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportJson}>{t('demo.exportJson')}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>{t('inspect.exportCsv')}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={printReport}>{t('inspect.printReport')}</button>
            {result.annotatedImageDataUrl && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                const a = document.createElement('a'); a.href = result.annotatedImageDataUrl!; a.download = 'demo-annotated.png'; a.click();
              }}>{t('demo.downloadAnn')}</button>
            )}
          </div>
        </div>
        <DecisionPanel
          grainType="wheat"
          counts={counts}
          detections={detections}
          quality={result.quality}
          imageCount={1}
        />
        </>
      )}
    </div>
  );
}
