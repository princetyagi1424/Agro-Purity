import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { listRecords, getRecord, getImageBlob, deleteRecord, clearAllRecords } from '../lib/storage/db';
import type { InspectionRecord } from '../types';

export function HistoryPage() {
  const { id } = useParams();
  if (id) return <RecordDetail id={id} />;
  return <RecordList />;
}

function RecordList() {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refresh = () => {
    setLoading(true);
    listRecords().then(setRecords).catch(() => setRecords([])).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  if (loading) return <div className="card" style={{ textAlign: 'center' }}><div className="spinner" /></div>;

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>Inspection History</h1>
      {records.length === 0 ? (
        <div className="card empty-state">
          <p>No saved inspections yet.</p>
          <Link to="/inspect" className="btn btn-primary">Start first inspection</Link>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {records.map((r) => (
                <li key={r.id} style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <Link to={`/history/${r.id}`} style={{ fontWeight: 600 }}>{new Date(r.createdAt).toLocaleString()}</Link>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {r.grainType} · W:{r.counts.whole} B:{r.counts.broken} F:{r.counts.foreign}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/history/${r.id}`)}>Open</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={async () => { if (window.confirm('Delete?')) { await deleteRecord(r.id); refresh(); } }}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className="btn btn-danger btn-sm" style={{ marginTop: '1rem' }} onClick={async () => { if (window.confirm('Clear ALL history?')) { await clearAllRecords(); refresh(); } }}>Clear all history</button>
        </>
      )}
    </div>
  );
}

function RecordDetail({ id }: { id: string }) {
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
        if (!r) { setError('Record not found.'); return; }
        setRecord(r);
        if (r.originalImageKey) {
          const b = await getImageBlob(r.originalImageKey);
          if (b && alive) setOrigUrl(URL.createObjectURL(b));
        }
        if (r.annotatedImageKey) {
          const b = await getImageBlob(r.annotatedImageKey);
          if (b && alive) setAnnUrl(URL.createObjectURL(b));
        }
      } catch { if (alive) setError('Failed to load record.'); }
    })();
    return () => { alive = false; };
  }, [id]);

  if (error) return <div className="card"><div className="alert alert-error">{error}</div><Link to="/history">← Back</Link></div>;
  if (!record) return <div className="card" style={{ textAlign: 'center' }}><div className="spinner" /></div>;

  const counts = record.adjustedCounts ?? record.counts;
  return (
    <div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/history')}>← History</button>
      <h1 style={{ fontSize: '1.3rem' }}>Inspection record</h1>
      <div className="disclaimer">{record.disclaimer}</div>
      <div className="card">
        <p style={{ fontSize: '0.9rem' }}>
          <strong>ID:</strong> {record.id}<br />
          <strong>Time:</strong> {new Date(record.createdAt).toLocaleString()}<br />
          <strong>Grain:</strong> {record.grainType}
        </p>
        <div className="counts-row">
          <span className="count-chip">Whole {counts.whole}</span>
          <span className="count-chip">Broken {counts.broken}</span>
          <span className="count-chip">Foreign {counts.foreign}</span>
          <span className="count-chip">Uncertain {counts.uncertain}</span>
        </div>
      </div>
      <div className="grid-2">
        {origUrl && <div className="card"><h3 style={{ marginTop: 0 }}>Original</h3><img src={origUrl} alt="Original" className="result-img" /></div>}
        {annUrl && <div className="card"><h3 style={{ marginTop: 0 }}>Annotated</h3><img src={annUrl} alt="Annotated" className="result-img" /></div>}
      </div>
      <button type="button" className="btn btn-danger" style={{ marginTop: '1rem' }} onClick={async () => { if (window.confirm('Delete?')) { await deleteRecord(id); navigate('/history'); } }}>Delete</button>
    </div>
  );
}
