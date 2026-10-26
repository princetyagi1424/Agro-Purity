import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { listRecords, getRecord, getImageBlob, deleteRecord, clearAllRecords } from '../lib/storage/db';
import type { InspectionRecord } from '../types';
import { useI18n } from '../i18n';
import { buildInspectionCsv, downloadTextFile, printInspectionReport } from '../lib/exportReport';

export function HistoryPage() {
  const { id } = useParams();
  if (id) return <RecordDetail id={id} />;
  return <RecordList />;
}

function RecordList() {
  const { t } = useI18n();
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const refresh = () => {
    setLoading(true);
    listRecords().then(setRecords).catch(() => setRecords([])).finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);
  if (loading) return <div className="card" style={{ textAlign: 'center' }}><div className="spinner" /><p>{t('common.loading')}</p></div>;
  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>{t('history.title')}</h1>
      {records.length === 0 ? (
        <div className="card empty-state">
          <p>{t('history.empty')}</p>
          <Link to="/inspect" className="btn btn-primary">{t('history.start')}</Link>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {records.map((r) => (
                <li key={r.id} style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--color-border, #d8e0d4)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <Link to={`/history/${r.id}`} style={{ fontWeight: 600 }}>{new Date(r.createdAt).toLocaleString()}</Link>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #5c6b5a)' }}>
                      {r.grainType} · W:{r.counts.whole} B:{r.counts.broken} F:{r.counts.foreign}
                      {(r.inputSource === 'demo' || r.notes === 'synthetic-demo') && ` · ${t('history.synthetic')}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/history/${r.id}`)}>{t('history.open')}</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={async () => {
                      if (window.confirm(t('history.confirmDelete'))) { await deleteRecord(r.id); refresh(); }
                    }}>{t('history.delete')}</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className="btn btn-danger btn-sm" style={{ marginTop: '1rem' }} onClick={async () => {
            if (window.confirm(t('history.confirmClear'))) { await clearAllRecords(); refresh(); }
          }}>{t('history.clearAll')}</button>
        </>
      )}
    </div>
  );
}

function RecordDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const [record, setRecord] = useState<InspectionRecord | null>(null);
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [annUrl, setAnnUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getRecord(id);
        if (!alive) return;
        if (!r) { setError(t('history.notFound')); return; }
        setRecord(r);
        if (r.originalImageKey) {
          const b = await getImageBlob(r.originalImageKey);
          if (b && alive) setOrigUrl(URL.createObjectURL(b));
        }
        if (r.annotatedImageKey) {
          const b = await getImageBlob(r.annotatedImageKey);
          if (b && alive) setAnnUrl(URL.createObjectURL(b));
        }
      } catch { if (alive) setError(t('history.loadFail')); }
    })();
    return () => { alive = false; };
  }, [id, t]);
  if (error) return <div className="card"><div className="alert alert-error" role="alert">{error}</div><Link to="/history">{t('history.back')}</Link></div>;
  if (!record) return <div className="card" style={{ textAlign: 'center' }}><div className="spinner" /></div>;
  const counts = record.adjustedCounts ?? record.counts;
  const isDemo = record.inputSource === 'demo' || record.notes === 'synthetic-demo';
  return (
    <div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/history')}>{t('history.back')}</button>
      <h1 style={{ fontSize: '1.3rem' }}>{t('history.title')}</h1>
      {isDemo && <div className="alert alert-warning">{t('history.synthetic')}</div>}
      <div className="disclaimer">{record.disclaimer}</div>
      <div className="card">
        <p style={{ fontSize: '0.9rem' }}>
          <strong>ID:</strong> {record.id}<br />
          <strong>{new Date(record.createdAt).toLocaleString()}</strong><br />
          {record.grainType}
        </p>
        <div className="counts-row">
          <span className="count-chip">{t('inspect.whole')} {counts.whole}</span>
          <span className="count-chip">{t('inspect.broken')} {counts.broken}</span>
          <span className="count-chip">{t('inspect.foreign')} {counts.foreign}</span>
          <span className="count-chip">{t('inspect.uncertain')} {counts.uncertain}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            const payload = { ...record, originalImageKey: undefined, annotatedImageKey: undefined };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${record.id}.json`; a.click();
            URL.revokeObjectURL(url);
          }}>{t('inspect.exportJson')}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            if (!record) return;
            const csv = buildInspectionCsv({
              id: record.id, createdAt: record.createdAt, grainType: record.grainType,
              inputSource: record.inputSource, algorithmVersion: record.algorithmVersion,
              synthetic: isDemo, counts: record.counts, adjustedCounts: record.adjustedCounts,
              detections: record.detections, disclaimer: record.disclaimer,
            });
            downloadTextFile(csv, `${record.id}.csv`, 'text/csv;charset=utf-8');
          }}>{t('inspect.exportCsv')}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            if (!record) return;
            printInspectionReport({
              title: t('history.title'), disclaimer: record.disclaimer,
              meta: [['ID', record.id], [t('inspect.title'), record.grainType], ['Algorithm', record.algorithmVersion]],
              counts: record.adjustedCounts ?? record.counts,
              labels: { whole: t('inspect.whole'), broken: t('inspect.broken'), foreign: t('inspect.foreign'), uncertain: t('inspect.uncertain') },
              imageSrc: annUrl || origUrl, synthetic: isDemo, syntheticLabel: t('history.synthetic'),
            });
          }}>{t('inspect.printReport')}</button>
          {annUrl && <a className="btn btn-secondary btn-sm" href={annUrl} download={`${record.id}-annotated.png`}>{t('inspect.downloadAnn')}</a>}
        </div>
      </div>
      <div className="grid-2">
        {origUrl && <div className="card"><h3 style={{ marginTop: 0 }}>{t('inspect.original')}</h3><img src={origUrl} alt={t('inspect.original')} className="result-img" /></div>}
        {annUrl && <div className="card"><h3 style={{ marginTop: 0 }}>{t('inspect.annotated')}</h3><img src={annUrl} alt={t('inspect.annotated')} className="result-img" /></div>}
      </div>
      <button type="button" className="btn btn-danger" style={{ marginTop: '1rem' }} onClick={async () => {
        if (window.confirm(t('history.confirmDelete'))) { await deleteRecord(id); navigate('/history'); }
      }}>{t('history.delete')}</button>
    </div>
  );
}
