import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runPipeline, countLabels } from '../lib/imageProcessing/pipeline';
import { saveRecord, generateId, dataUrlToBlob } from '../lib/storage/db';
import type { GrainType, InputSource, InspectionResult, ComponentFeatures, DetectionLabel } from '../types';
import { DISCLAIMER, ALGORITHM_VERSION } from '../types';

type Step = 'setup' | 'camera' | 'preview' | 'processing' | 'results';

export function InspectPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('setup');
  const [grainType] = useState<GrainType>('wheat');
  const [inputSource, setInputSource] = useState<InputSource>('upload');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [detections, setDetections] = useState<ComponentFeatures[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => () => { stopCamera(); if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl); }, [stopCamera, imageUrl]);
  useEffect(() => { if (step === 'camera' && videoRef.current && stream) videoRef.current.srcObject = stream; }, [step, stream]);

  const startCamera = async () => {
    setError(null); stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Camera unavailable. Use upload.'); return; }
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setStream(s); setInputSource('camera'); setStep('camera');
    } catch { setError('Camera denied. Try upload.'); }
  };

  const capture = () => {
    const v = videoRef.current; if (!v?.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((b) => { if (!b) return; stopCamera(); setImageUrl(URL.createObjectURL(b)); setStep('preview'); }, 'image/jpeg', 0.92);
  };

  const onFile = (f: File | null) => {
    if (!f?.type.startsWith('image/')) { setError('Select an image file.'); return; }
    if (f.size > 15e6) { setError('Max 15 MB.'); return; }
    setError(null); stopCamera(); setImageUrl(URL.createObjectURL(f)); setInputSource('upload'); setStep('preview');
  };

  const analyse = async (force = false) => {
    if (!imageUrl) return;
    setStep('processing'); setError(null);
    try {
      const res = await runPipeline(imageUrl, { forceContinue: force });
      setResult(res); setDetections(res.detections); setStep('results');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setStep('preview'); }
  };

  const counts = countLabels(detections);

  const save = async () => {
    if (!result || !imageUrl) return;
    setSaving(true);
    try {
      const id = generateId();
      let orig: Blob | undefined;
      try { orig = await (await fetch(imageUrl)).blob(); } catch { /* */ }
      const ann = result.annotatedImageDataUrl ? dataUrlToBlob(result.annotatedImageDataUrl) : undefined;
      await saveRecord({
        id, createdAt: new Date().toISOString(), grainType, inputSource,
        algorithmVersion: ALGORITHM_VERSION, counts: result.counts, adjustedCounts: counts,
        qualityWarnings: result.quality.issues.map((i) => i.message), diagnostics: result.diagnostics,
        originalImageKey: id + '_o', annotatedImageKey: id + '_a', detections, disclaimer: DISCLAIMER,
      }, orig, ann);
      navigate('/history/' + id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const reset = () => {
    stopCamera();
    if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImageUrl(null); setResult(null); setDetections([]); setError(null); setStep('setup');
  };

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>Grain Inspection</h1>
      <div className="disclaimer">{DISCLAIMER}</div>
      {error && <div className="alert alert-error">{error}</div>}
      {step === 'setup' && (
        <div className="card">
          <p>Wheat on plain white paper, thin layer, even light.</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={startCamera}>Open Camera</button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Upload</button>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
      )}
      {step === 'camera' && (
        <div className="card">
          <video ref={videoRef} className="video-preview" autoPlay playsInline muted />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={capture}>Capture</button>
            <button type="button" className="btn btn-secondary" onClick={() => { stopCamera(); setStep('setup'); }}>Cancel</button>
          </div>
        </div>
      )}
      {step === 'preview' && imageUrl && (
        <div className="card">
          <img src={imageUrl} alt="Sample" className="result-img" />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => analyse(false)}>Analyse</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>Retake</button>
          </div>
        </div>
      )}
      {step === 'processing' && (
        <div className="card" style={{ textAlign: 'center' }}><div className="spinner" /><p>Analysing…</p></div>
      )}
      {step === 'results' && result && (
        <div>
          {!result.quality.ok && (
            <div className="alert alert-error">
              Quality issues: {result.quality.issues.map((i) => i.message).join('; ')}
              {result.detections.length === 0 && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => analyse(true)}>Continue anyway</button>
              )}
            </div>
          )}
          <div className="card">
            <div className="counts-row">
              <span className="count-chip">Whole {counts.whole}</span>
              <span className="count-chip">Broken {counts.broken}</span>
              <span className="count-chip">Foreign {counts.foreign}</span>
              <span className="count-chip">Uncertain {counts.uncertain}</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              t={result.diagnostics.threshold} · {result.diagnostics.processingMs}ms
            </p>
          </div>
          {result.annotatedImageDataUrl && (
            <div className="card"><img src={result.annotatedImageDataUrl} alt="Annotated" className="result-img" /></div>
          )}
          <div className="card">
            <div className="detection-list">
              {detections.filter((d) => d.label !== 'noise').map((d) => (
                <div key={d.id} className="detection-item">
                  <span>#{d.id}</span>
                  <select value={d.label} aria-label={'Label ' + d.id} onChange={(e) => setDetections((prev) => prev.map((x) => x.id === d.id ? { ...x, label: e.target.value as DetectionLabel, manuallyAdjusted: true } : x))}>
                    {(['whole','broken','foreign','uncertain','ignored'] as DetectionLabel[]).map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <span style={{ color: 'var(--color-text-muted)' }}>{d.labelReason}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>New</button>
          </div>
        </div>
      )}
    </div>
  );
}
