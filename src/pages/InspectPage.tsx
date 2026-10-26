import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runPipeline, countLabels } from '../lib/imageProcessing/pipeline';
import { saveRecord, generateId, dataUrlToBlob } from '../lib/storage/db';
import type { GrainType, InputSource, InspectionResult, ComponentFeatures, DetectionLabel } from '../types';
import { ALGORITHM_VERSION } from '../types';
import { useI18n } from '../i18n';

type Step = 'setup' | 'camera' | 'preview' | 'processing' | 'results';
type ViewMode = 'annotated' | 'original';
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_BYTES = 15 * 1024 * 1024;

function isLikelyImage(file: File): boolean {
  if (ALLOWED.has(file.type.toLowerCase())) return true;
  if (!file.type || file.type === 'application/octet-stream') return ALLOWED_EXT.test(file.name);
  return false;
}

export function InspectPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fileInputId = useId();
  const [step, setStep] = useState<Step>('setup');
  const [grainType] = useState<GrainType>('wheat');
  const [inputSource, setInputSource] = useState<InputSource>('upload');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [detections, setDetections] = useState<ComponentFeatures[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('annotated');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((tr) => tr.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => () => {
    stopCamera();
    if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
  }, [stopCamera, imageUrl]);

  useEffect(() => {
    if (step === 'camera' && videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [step, stream]);

  const openFilePicker = () => {
    const input = fileRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const startCamera = async () => {
    setError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setError(t('inspect.cameraUnavailable')); return; }
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setStream(s); setInputSource('camera'); setStep('camera');
    } catch { setError(t('inspect.cameraDenied')); }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((b) => {
      if (!b) return;
      stopCamera();
      if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(b));
      setStep('preview');
    }, 'image/jpeg', 0.92);
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    if (!isLikelyImage(f)) { setError(t('inspect.badFile')); return; }
    if (f.size > MAX_BYTES) { setError(t('inspect.tooLarge')); return; }
    setError(null);
    stopCamera();
    if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(f);
    const probe = new Image();
    probe.onload = () => {
      setImageUrl(url); setInputSource('upload'); setStep('preview');
      setResult(null); setDetections([]);
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setError(t('inspect.decodeFail')); };
    probe.src = url;
  };

  const analyse = async (force = false) => {
    if (!imageUrl) return;
    setStep('processing'); setError(null);
    try {
      const res = await runPipeline(imageUrl, { forceContinue: force });
      setResult(res); setDetections(res.detections);
      setViewMode(res.annotatedImageDataUrl ? 'annotated' : 'original');
      setStep('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inspect.analysisFail'));
      setStep('preview');
    }
  };

  const counts = countLabels(detections);

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click();
  };

  const exportJson = () => {
    if (!result) return;
    const payload = {
      kind: 'agropurity-inspection', synthetic: false, grainType, inputSource,
      algorithmVersion: ALGORITHM_VERSION, counts: result.counts, adjustedCounts: counts,
      quality: result.quality, diagnostics: result.diagnostics, detections,
      disclaimer: t('disclaimer'), exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `agropurity-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

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
        originalImageKey: `${id}_o`, annotatedImageKey: `${id}_a`, detections, disclaimer: t('disclaimer'),
      }, orig, ann);
      navigate(`/history/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inspect.saveFail'));
    } finally { setSaving(false); }
  };

  const reset = () => {
    stopCamera();
    if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImageUrl(null); setResult(null); setDetections([]); setError(null); setStep('setup');
    if (fileRef.current) fileRef.current.value = '';
  };

  const displaySrc =
    viewMode === 'annotated' && result?.annotatedImageDataUrl
      ? result.annotatedImageDataUrl
      : imageUrl;

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>{t('inspect.title')}</h1>
      <div className="disclaimer">{t('disclaimer')}</div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <input
        id={fileInputId}
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="visually-hidden-file"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />

      {step === 'setup' && (
        <div className="card">
          <p>{t('inspect.wheatOnly')}</p>
          <div className="file-upload-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button type="button" className="btn btn-primary" onClick={startCamera}>{t('inspect.openCamera')}</button>
            <button type="button" className="btn btn-secondary" onClick={openFilePicker}>{t('inspect.upload')}</button>
            <label htmlFor={fileInputId} className="btn btn-secondary" style={{ cursor: 'pointer' }}>{t('inspect.upload')}</label>
          </div>
        </div>
      )}

      {step === 'camera' && (
        <div className="card">
          <video ref={videoRef} className="video-preview" autoPlay playsInline muted />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={capture}>{t('inspect.capture')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => { stopCamera(); setStep('setup'); }}>{t('inspect.cancel')}</button>
          </div>
        </div>
      )}

      {step === 'preview' && imageUrl && (
        <div className="card">
          <img src={imageUrl} alt={t('inspect.original')} className="result-img" />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => analyse(false)}>{t('inspect.analyse')}</button>
            <button type="button" className="btn btn-secondary" onClick={openFilePicker}>{t('inspect.retake')}</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>{t('inspect.cancel')}</button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="spinner" /><p>{t('inspect.analysing')}</p>
        </div>
      )}

      {step === 'results' && result && (
        <div>
          {!result.quality.ok && (
            <div className="alert alert-error">
              <strong>{t('inspect.qualityIssues')}</strong>
              <ul>{result.quality.issues.map((i) => <li key={i.code}>{i.message}</li>)}</ul>
              {result.detections.length === 0 && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => analyse(true)}>
                  {t('inspect.continueAnyway')}
                </button>
              )}
            </div>
          )}
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('inspect.countsTitle')}</h2>
            <div className="counts-row">
              <span className="count-chip">{t('inspect.whole')} {counts.whole}</span>
              <span className="count-chip">{t('inspect.broken')} {counts.broken}</span>
              <span className="count-chip">{t('inspect.foreign')} {counts.foreign}</span>
              <span className="count-chip">{t('inspect.uncertain')} {counts.uncertain}</span>
            </div>
          </div>
          <div className="card">
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <button type="button" className={`btn btn-secondary btn-sm${viewMode === 'original' ? ' active' : ''}`} onClick={() => setViewMode('original')}>{t('inspect.showOriginal')}</button>
              <button type="button" className={`btn btn-secondary btn-sm${viewMode === 'annotated' ? ' active' : ''}`} onClick={() => setViewMode('annotated')} disabled={!result.annotatedImageDataUrl}>{t('inspect.showAnnotated')}</button>
            </div>
            {displaySrc && <img src={displaySrc} alt={viewMode === 'annotated' ? t('inspect.annotated') : t('inspect.original')} className="result-img" />}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              {imageUrl && <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadDataUrl(imageUrl, 'original.png')}>{t('inspect.downloadOrig')}</button>}
              {result.annotatedImageDataUrl && <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadDataUrl(result.annotatedImageDataUrl!, 'annotated.png')}>{t('inspect.downloadAnn')}</button>}
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportJson}>{t('inspect.exportJson')}</button>
            </div>
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('inspect.detections')}</h2>
            <div className="detection-list">
              {detections.filter((d) => d.label !== 'noise').map((d) => (
                <div key={d.id} className="detection-item">
                  <span>#{d.id}</span>
                  <select value={d.label} aria-label={`${t('inspect.label')} ${d.id}`} onChange={(e) => setDetections((prev) => prev.map((x) => x.id === d.id ? { ...x, originalLabel: x.originalLabel ?? x.label, label: e.target.value as DetectionLabel, manuallyAdjusted: true } : x))}>
                    {(['whole','broken','foreign','uncertain','ignored'] as DetectionLabel[]).map((l) => (
                      <option key={l} value={l}>{t(`inspect.${l}` as 'inspect.whole')}</option>
                    ))}
                  </select>
                  <span style={{ color: 'var(--color-text-muted)' }}>{d.labelReason}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? t('inspect.saving') : t('inspect.save')}</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>{t('inspect.new')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
