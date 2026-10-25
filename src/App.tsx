import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ChevronDown,
  CircleHelp, ClipboardCheck, Clock3, CloudOff, Download, Eye, FileJson, FileText, History,
  ImagePlus, Info, Leaf, LockKeyhole, Menu, RefreshCw, RotateCcw, ScanLine, ShieldCheck,
  Smartphone, Sprout, Trash2, Upload, WifiOff, X, Wheat, Zap,
} from 'lucide-react';
import { countLabels, type Detection } from './vision/core.mjs';
import type { InspectionRecord } from './lib/records';
import { clearRecords, deleteRecord, downloadableRecord, listRecords, saveRecord } from './lib/records';
import { downloadDataUrl, downloadText, friendlyDate, safeFilename } from './lib/utils';

type View = 'home' | 'inspect' | 'history' | 'details' | 'about';
type SourceType = 'camera' | 'upload' | 'demo';
type Counts = { whole: number; broken: number; foreign: number; uncertain: number; reviewedTotal: number };
type Analysis = {
  algorithmVersion: string; width: number; height: number; threshold: number;
  thresholdDiagnostics: { polarity: string; foregroundRatio: number; separable: boolean; minGray: number; maxGray: number };
  quality: { acceptable: boolean; severity: string; warnings: string[]; meanBrightness: number | null; contrast: number | null };
  counts: Counts; ignored: number; detections: Detection[]; notes: string[];
};
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> };
type WorkerResponse = { type: 'success'; requestId: number; result: Analysis } | { type: 'error'; requestId: number; message: string; code: string; quality: Analysis['quality'] | null };

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 12_000_000;
const DISCLAIMER = 'Preliminary visual screening only. Not an official grade or certified grain analysis. Results are provisional, require human review, and must not be used for legal, procurement, payment, or deduction decisions.';

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected image could not be decoded. Please choose a valid JPG, PNG or WebP image.'));
    image.src = url;
  });
}

async function normalizeImageDataUrl(url: string): Promise<string> {
  const image = await imageFromUrl(url);
  const pixels = image.naturalWidth * image.naturalHeight;
  if (!image.naturalWidth || !image.naturalHeight || pixels > MAX_SOURCE_PIXELS) {
    throw new Error('This image has invalid dimensions or exceeds the 12-megapixel safety limit. Please resize it and try again.');
  }
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser could not prepare the image for analysis.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

function imageToProcessingCanvas(image: HTMLImageElement) {
  const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas pixel access is unavailable in this browser.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function labelColour(label: string) {
  if (label === 'whole') return '#1b8f52';
  if (label === 'broken') return '#d59b17';
  if (label === 'foreign') return '#c24635';
  return '#596f82';
}
function labelText(label: string) {
  return ({ whole: 'Whole-grain candidate', broken: 'Broken-fragment candidate', foreign: 'Foreign-material candidate', uncertain: 'Uncertain · review' } as Record<string, string>)[label] || label;
}
function makeAnnotatedImage(sourceImageDataUrl: string, analysis: Analysis): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const image = await imageFromUrl(sourceImageDataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas annotation could not be created.');
      ctx.drawImage(image, 0, 0);
      const sx = canvas.width / analysis.width;
      const sy = canvas.height / analysis.height;
      for (const detection of analysis.detections) {
        const { x, y, width, height } = detection.box;
        const px = x * sx; const py = y * sy; const pw = width * sx; const ph = height * sy;
        const color = labelColour(detection.label);
        ctx.lineWidth = Math.max(2, canvas.width / 420);
        ctx.strokeStyle = color; ctx.strokeRect(px, py, pw, ph);
        const tag = `${detection.id} · ${detection.label}`;
        ctx.font = `600 ${Math.max(11, Math.min(18, canvas.width / 55))}px Arial`;
        const textWidth = ctx.measureText(tag).width;
        const tagHeight = Math.max(18, Math.min(24, canvas.width / 38));
        ctx.fillStyle = color; ctx.fillRect(px, Math.max(0, py - tagHeight), textWidth + 12, tagHeight);
        ctx.fillStyle = '#ffffff'; ctx.fillText(tag, px + 6, Math.max(13, py - 5));
      }
      ctx.fillStyle = 'rgba(22,63,42,.88)';
      ctx.fillRect(0, canvas.height - Math.max(30, canvas.height / 17), canvas.width, Math.max(30, canvas.height / 17));
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${Math.max(12, Math.min(18, canvas.width / 58))}px Arial`;
      ctx.fillText('AgroPurity · preliminary visual screening · not an official grade', 12, canvas.height - 12);
      resolve(canvas.toDataURL('image/png'));
    } catch (error) { reject(error); }
  });
}

function App() {
  const [view, setView] = useState<View>('home');
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<InspectionRecord | null>(null);
  const [sourceImage, setSourceImage] = useState<string>('');
  const [sourceType, setSourceType] = useState<SourceType>('upload');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [annotatedImage, setAnnotatedImage] = useState<string>('');
  const [selectedDetection, setSelectedDetection] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'camera' | 'upload' | 'demo'>('all');
  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectionList = analysis?.detections || [];
  const currentDetection = detectionList.find((d) => d.id === selectedDetection) || null;
  const reviewedCounts = useMemo(() => analysis ? countLabels(analysis.detections) as Counts : null, [analysis]);

  const refreshRecords = useCallback(async () => {
    try { setRecords(await listRecords()); }
    catch (e) { setStatus((e as Error).message || 'Local history could not be opened.'); }
  }, []);

  useEffect(() => { void refreshRecords(); }, [refreshRecords]);
  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); setStatus('AgroPurity was installed on this device.'); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  useEffect(() => {
    if (!cameraStream || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = cameraStream;
    video.play().catch(() => setError('Camera preview could not start. Check browser permissions or use image upload instead.'));
  }, [cameraStream, view]);
  useEffect(() => () => { cameraStream?.getTracks().forEach((track) => track.stop()); workerRef.current?.terminate(); }, [cameraStream]);

  const stopCamera = useCallback(() => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  }, [cameraStream]);

  const goTo = (next: View) => { stopCamera(); setMobileMenu(false); setView(next); setError(''); setStatus(''); };

  const clearCurrent = () => {
    workerRef.current?.terminate(); workerRef.current = null;
    setSourceImage(''); setAnalysis(null); setAnnotatedImage(''); setSelectedDetection('');
    setError(''); setStatus(''); setBusy(false); setSourceType('upload');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const startCamera = async () => {
    setError(''); setStatus('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera capture needs HTTPS (or localhost) and a browser that supports camera access. You can still upload an image.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } });
      setCameraStream(stream); setView('inspect'); setSourceImage(''); setAnalysis(null); setAnnotatedImage('');
      setStatus('Camera is ready. Spread wheat in a thin, non-overlapping layer and frame the white paper.');
    } catch (e) {
      const errorName = (e as DOMException).name;
      const explanation = errorName === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in browser settings or use image upload.' : errorName === 'NotFoundError' ? 'No supported camera was found on this device. Use image upload.' : errorName === 'NotReadableError' ? 'The camera may be busy in another app. Close that app and retry, or upload an image.' : 'Camera access did not work in this browser or context. Use image upload instead.';
      setError(explanation);
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current; const canvas = cameraCanvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setError('Camera frame is not ready yet. Wait a moment or use image upload.'); return;
    }
    try {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas capture is unavailable.');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const normalized = await normalizeImageDataUrl(canvas.toDataURL('image/jpeg', 0.92));
      stopCamera(); setSourceType('camera'); setSourceImage(normalized); setAnalysis(null); setAnnotatedImage(''); setError('');
      setStatus('Photo captured locally. Review the framing, then run the inspection.');
    } catch (e) { setError((e as Error).message || 'Could not capture this camera frame.'); }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(''); setStatus('');
    if (file.size > MAX_UPLOAD_BYTES) { setError('This file is larger than 12 MB. Choose a smaller image.'); return; }
    if (!file.type.startsWith('image/') || /svg|gif/i.test(file.type)) { setError('Choose a static JPG, PNG or WebP image. Animated and SVG files are not supported for inspection.'); return; }
    let url = '';
    try {
      const bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) { bitmap.close(); setError('This image exceeds the 12-megapixel safety limit. Resize it before uploading.'); return; }
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable.');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      url = canvas.toDataURL('image/jpeg', 0.88);
      stopCamera(); setSourceType('upload'); setSourceImage(url); setAnalysis(null); setAnnotatedImage(''); setView('inspect');
      setStatus('Image loaded locally. The original upload is not sent to a server.');
    } catch (e) { setError((e as Error).message || 'Image could not be opened. Try a JPEG or PNG file.'); }
  };

  const loadDemo = async () => {
    setError(''); setStatus('');
    try {
      const response = await fetch('/demo-grain.svg', { cache: 'no-store' });
      if (!response.ok) throw new Error('The bundled demo fixture could not be loaded.');
      const blob = await response.blob();
      const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Demo image could not be decoded.')); reader.readAsDataURL(blob); });
      const normalized = await normalizeImageDataUrl(url);
      stopCamera(); setSourceType('demo'); setSourceImage(normalized); setAnalysis(null); setAnnotatedImage(''); setView('inspect');
      setStatus('Demo mode: this is a bundled synthetic engineering fixture, not a real farmer sample or field-trial result.');
    } catch (e) { setError((e as Error).message || 'Demo fixture is unavailable offline until the app shell has been cached.'); }
  };

  const runInspection = async () => {
    if (!sourceImage || busy) return;
    setError(''); setStatus('Preparing image pixels locally…'); setBusy(true); setAnalysis(null); setAnnotatedImage('');
    const requestId = ++requestIdRef.current;
    try {
      const image = await imageFromUrl(sourceImage);
      const { canvas, ctx } = imageToProcessingCanvas(image);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const worker = new Worker(new URL('./vision/analyze.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current?.terminate(); workerRef.current = worker;
      const result = await new Promise<Analysis>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const payload = event.data;
          if (payload.requestId !== requestId) return;
          if (payload.type === 'success') resolve(payload.result);
          else {
            const failure = new Error(payload.message) as Error & { code?: string; quality?: Analysis['quality'] };
            failure.code = payload.code; failure.quality = payload.quality || undefined; reject(failure);
          }
        };
        worker.onerror = () => reject(new Error('The image-processing worker failed. Please reload and try a smaller image.'));
        setStatus('Running grayscale conversion, Otsu thresholding, component labelling and feature extraction locally…');
        worker.postMessage({ type: 'analyze', requestId, width: canvas.width, height: canvas.height, buffer: imageData.data.buffer as ArrayBuffer }, [imageData.data.buffer as ArrayBuffer]);
      });
      worker.terminate(); if (workerRef.current === worker) workerRef.current = null;
      const annotated = await makeAnnotatedImage(sourceImage, result);
      setAnalysis(result); setAnnotatedImage(annotated); setSelectedDetection(result.detections[0]?.id || '');
      setStatus(`Analysis finished. ${result.detections.length} component candidate(s) retained; check warnings and review uncertain detections before saving.`);
    } catch (e) {
      const err = e as Error & { quality?: Analysis['quality'] };
      workerRef.current?.terminate(); workerRef.current = null;
      if (err.quality?.warnings?.length) setStatus(err.quality.warnings.join(' '));
      setError(err.message || 'The image could not be analysed.');
    } finally { setBusy(false); }
  };

  const adjustDetection = (id: string, label: Detection['label']) => {
    if (!analysis) return;
    const detections = analysis.detections.map((d) => d.id === id ? { ...d, label, manualReason: label === d.algorithmLabel ? undefined : 'Manually changed by the user during review.' } : d);
    const counts = countLabels(detections) as Counts;
    setAnalysis({ ...analysis, detections, counts });
    setAnnotatedImage('');
  };

  useEffect(() => {
    if (!analysis || !sourceImage) return;
    let cancelled = false;
    makeAnnotatedImage(sourceImage, analysis).then((url) => { if (!cancelled) setAnnotatedImage(url); }).catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [analysis?.detections.map((d) => `${d.id}:${d.label}`).join('|'), sourceImage]);

  const saveInspection = async () => {
    if (!analysis || !sourceImage || !annotatedImage || busy) return;
    setBusy(true); setError(''); setStatus('Saving this inspection to local browser storage…');
    try {
      const record: InspectionRecord = {
        id: `AP-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        createdAt: new Date().toISOString(), crop: 'Wheat', source: sourceType, demo: sourceType === 'demo',
        algorithmVersion: analysis.algorithmVersion,
        settings: { processingWidth: analysis.width, processingHeight: analysis.height, threshold: analysis.threshold, polarity: analysis.thresholdDiagnostics.polarity, foregroundRatio: analysis.thresholdDiagnostics.foregroundRatio, connectivity: 8 },
        initialCounts: countLabels(analysis.detections.map((d) => ({ ...d, label: d.algorithmLabel as Detection['label'] }))) as Counts,
        counts: countLabels(analysis.detections) as Counts, ignored: analysis.ignored, detections: analysis.detections,
        warnings: analysis.quality.warnings, quality: analysis.quality,
        sourceImageDataUrl: sourceImage, annotatedImageDataUrl: annotatedImage, disclaimer: DISCLAIMER,
      };
      await saveRecord(record); await refreshRecords(); setActiveRecord(record); setStatus('Inspection saved in this browser. It is not uploaded to a cloud account.');
    } catch (e) { setError(`Could not save this inspection locally: ${(e as Error).message || 'storage may be unavailable or full'}`); }
    finally { setBusy(false); }
  };

  const openRecord = (record: InspectionRecord) => { setActiveRecord(record); setView('details'); setMobileMenu(false); };
  const exportRecord = (record: InspectionRecord) => downloadText(`${safeFilename(record.id)}-record.json`, JSON.stringify(downloadableRecord(record), null, 2));
  const deleteOne = async (record: InspectionRecord) => {
    if (!window.confirm(`Delete local inspection ${record.id}? This cannot be undone.`)) return;
    try { await deleteRecord(record.id); await refreshRecords(); if (activeRecord?.id === record.id) { setActiveRecord(null); setView('history'); } setStatus('Inspection deleted from this browser.'); }
    catch (e) { setError((e as Error).message || 'Could not delete this record.'); }
  };
  const deleteAll = async () => {
    if (!window.confirm('Delete every saved AgroPurity inspection in this browser? Export important records first. This cannot be undone.')) return;
    try { await clearRecords(); await refreshRecords(); setActiveRecord(null); setStatus('All local inspection history was deleted.'); }
    catch (e) { setError((e as Error).message || 'Could not clear local history.'); }
  };

  const installApp = async () => {
    if (installed) { setStatus('AgroPurity is already running in installed mode on this device.'); return; }
    if (!installPrompt) { setShowInstallHelp(true); return; }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setStatus('Installation was accepted. Wait for the browser to finish adding AgroPurity.');
      else setStatus('Installation was dismissed. You can add AgroPurity later from your browser menu.');
    } catch { setStatus('The browser could not open its install prompt. Use the browser menu’s Install app or Add to Home Screen option.'); }
    finally { setInstallPrompt(null); }
  };

  const filteredRecords = useMemo(() => records.filter((r) => (historyFilter === 'all' || r.source === historyFilter) && `${r.id} ${r.crop} ${r.source}`.toLowerCase().includes(historyQuery.toLowerCase())), [records, historyFilter, historyQuery]);
  const counts = reviewedCounts || analysis?.counts || null;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => goTo('home')} aria-label="AgroPurity home"><span className="brand-mark"><Sprout size={25} /></span><span><strong>AgroPurity</strong><small>Visual grain screening</small></span></button>
      <nav className="desktop-nav" aria-label="Main navigation">
        <button className={view === 'home' ? 'nav-active' : ''} onClick={() => goTo('home')}>Overview</button>
        <button className={view === 'inspect' ? 'nav-active' : ''} onClick={() => { clearCurrent(); goTo('inspect'); }}>New inspection</button>
        <button className={view === 'history' || view === 'details' ? 'nav-active' : ''} onClick={() => goTo('history')}>Local history <span className="nav-count">{records.length}</span></button>
        <button className={view === 'about' ? 'nav-active' : ''} onClick={() => goTo('about')}>How it works</button>
      </nav>
      <div className="header-actions">
        {!installed && <button className="button button-install button-small" onClick={() => void installApp()}><Download size={16} /> {installPrompt ? 'Install app' : 'Install help'}</button>}
        {installed && <span className="installed-pill"><CheckCircle2 size={15} /> Installed</span>}
        <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle navigation"><Menu size={21} /></button>
      </div>
    </header>
    {mobileMenu && <nav className="mobile-nav" aria-label="Mobile navigation">
      <button onClick={() => goTo('home')}>Overview</button><button onClick={() => { clearCurrent(); goTo('inspect'); }}>New inspection</button><button onClick={() => goTo('history')}>Local history ({records.length})</button><button onClick={() => goTo('about')}>How it works</button>
    </nav>}

    <main>
      {(status || error) && <div className={`toast ${error ? 'toast-error' : 'toast-info'}`} role={error ? 'alert' : 'status'}><span>{error ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}</span><div>{error || status}</div><button onClick={() => { setError(''); setStatus(''); }} aria-label="Dismiss message"><X size={16} /></button></div>}

      {view === 'home' && <HomeView records={records} onInspect={() => { clearCurrent(); setView('inspect'); }} onHistory={() => setView('history')} onDemo={() => void loadDemo()} onInstall={() => void installApp()} onAbout={() => setView('about')} installed={installed} />}
      {view === 'inspect' && <section className="page-section">
        <div className="page-heading"><div><button className="back-link" onClick={() => goTo('home')}><ArrowLeft size={15} /> Dashboard</button><span className="eyebrow">WHEAT · PRELIMINARY SCREEN</span><h1>Inspect a grain sample</h1><p>Capture or upload a photo, run local pixel analysis, then review the annotated evidence.</p></div><div className="local-tag"><LockKeyhole size={15} /> On-device analysis</div></div>
        <div className="notice notice-amber"><AlertTriangle size={19} /><div><strong>Before you capture</strong><p>Spread wheat in a thin, non-overlapping layer on plain white A4 paper. Use even light, keep the phone steady, avoid glare and shadows, and include the sample without clipping the edges.</p></div></div>
        <div className="inspection-layout">
          <section className="panel capture-panel">
            <div className="panel-title"><div><span className="step-number">1</span><h2>Sample image</h2></div><span className="muted">Camera or upload</span></div>
            {cameraStream ? <div className="camera-wrap"><video ref={videoRef} autoPlay playsInline muted /><div className="camera-hint"><span className="live-dot" /> Live camera preview</div><div className="camera-controls"><button className="button button-primary" onClick={() => void captureFrame()}><Camera size={17} /> Capture photo</button><button className="button button-outline" onClick={stopCamera}><X size={16} /> Cancel</button></div></div> : sourceImage ? <div className="source-preview-wrap"><img className="source-preview" src={sourceImage} alt="Selected wheat sample before analysis" /><div className="image-toolbar"><span><CheckCircle2 size={15} /> Image loaded · {sourceType === 'demo' ? 'synthetic demo fixture' : sourceType === 'camera' ? 'camera capture' : 'uploaded image'}</span><button className="text-button" onClick={clearCurrent}><RotateCcw size={14} /> Reset</button></div></div> : <div className="empty-capture"><div className="empty-image-icon"><ImagePlus size={28} /></div><h3>Choose a sample image</h3><p>Use a real photo with separated wheat on a light, plain background.</p><div className="capture-actions"><button className="button button-primary" onClick={() => void startCamera()}><Camera size={17} /> Open camera</button><button className="button button-outline" onClick={() => imageInputRef.current?.click()}><Upload size={17} /> Upload image</button></div><button className="text-button demo-link" onClick={() => void loadDemo()}>Try bundled engineering demo <ArrowRight size={14} /></button></div>}
            <canvas ref={cameraCanvasRef} className="hidden-canvas" />
            <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void handleFile(event.target.files?.[0])} />
            <div className="capture-footer"><ShieldCheck size={16} /><span>Images stay in this browser. No cloud AI or remote analysis API is used.</span></div>
          </section>
          <section className="panel pipeline-panel">
            <div className="panel-title"><div><span className="step-number">2</span><h2>Run analysis</h2></div><span className="experimental-pill">Rules · experimental</span></div>
            <div className="pipeline-steps">
              <PipelineStep n="01" title="Prepare pixels" text="Orient and scale the image to a bounded processing size." active={busy} />
              <PipelineStep n="02" title="Grayscale + Otsu" text="Estimate a global threshold from the image histogram." active={busy} />
              <PipelineStep n="03" title="Connected components" text="Label connected foreground regions and measure each box." active={busy} />
              <PipelineStep n="04" title="Reviewable overlay" text="Apply provisional geometry/colour rules; flag uncertain regions." active={false} last />
            </div>
            {!sourceImage && <div className="pipeline-empty"><ScanLine size={21} /><span>Choose or capture an image to enable inspection.</span></div>}
            <button className="button button-primary button-full run-button" onClick={() => void runInspection()} disabled={!sourceImage || busy || Boolean(cameraStream)}>{busy ? <><span className="spinner" /> Analysing locally…</> : <><ScanLine size={18} /> Inspect seed lot</>}</button>
            <div className="mini-facts"><span><LockKeyhole size={14} /> Private by default</span><span><WifiOff size={14} /> No API required</span><span><Zap size={14} /> Explainable rules</span></div>
            {analysis && <div className="result-ready"><CheckCircle2 size={18} /><div><strong>Analysis ready for review</strong><span>{analysis.detections.length} component candidates · threshold {analysis.threshold}</span></div><button className="text-button" onClick={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>View results <ArrowRight size={14} /></button></div>}
          </section>
        </div>
        {analysis && <section id="results" className="results-section">
          <div className="page-heading result-heading"><div><span className="eyebrow">INSPECTION RESULTS</span><h2>Annotated sample & review</h2><p>Counts update when you manually change a detection label. The original algorithm label remains recorded.</p></div><button className="button button-outline" onClick={clearCurrent}><RotateCcw size={16} /> New sample</button></div>
          {sourceType === 'demo' && <div className="notice notice-blue"><Info size={18} /><div><strong>Engineering demo fixture</strong><p>These detections come from a bundled synthetic image used to exercise the software pipeline. They are not real grain measurements, accuracy evidence or a field trial.</p></div></div>}
          {analysis.quality.warnings.length > 0 && <div className="notice notice-amber"><AlertTriangle size={18} /><div><strong>Review image and detection warnings</strong><ul>{analysis.quality.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div></div>}
          <div className="summary-grid">
            <CountCard title="Whole-grain candidates" count={counts?.whole ?? 0} color="green" note="Warm colour + elongated shape" />
            <CountCard title="Broken-fragment candidates" count={counts?.broken ?? 0} color="yellow" note="Provisional fragment heuristic" />
            <CountCard title="Foreign-material candidates" count={counts?.foreign ?? 0} color="red" note="Dark, low-chroma appearance" />
            <CountCard title="Needs review" count={counts?.uncertain ?? 0} color="slate" note="Ambiguous or edge-clipped areas" />
          </div>
          <div className="results-layout">
            <section className="panel image-result-panel"><div className="panel-title"><div><span className="step-number">3</span><h3>Annotated image</h3></div><span className="muted">Boxes from detected components</span></div>
              <div className="compare-images"><figure><img src={sourceImage} alt="Normalized source sample" /><figcaption>Source image</figcaption></figure><figure><img src={annotatedImage || sourceImage} alt="Annotated grain image with labeled detections" /><figcaption>Detected regions</figcaption></figure></div>
              <div className="image-legend"><span><i className="legend-dot green" /> Whole candidate</span><span><i className="legend-dot yellow" /> Broken candidate</span><span><i className="legend-dot red" /> Foreign candidate</span><span><i className="legend-dot slate" /> Uncertain</span></div>
              <div className="image-actions"><button className="button button-outline" onClick={() => downloadDataUrl('agropurity-annotated.png', annotatedImage || sourceImage)} disabled={!annotatedImage}><Download size={16} /> Export annotated PNG</button><button className="button button-outline" onClick={() => downloadDataUrl('agropurity-source.jpg', sourceImage)}><Download size={16} /> Export source JPG</button></div>
            </section>
            <section className="panel detections-panel"><div className="panel-title"><div><span className="step-number">4</span><h3>Detection review</h3></div><span className="muted">{detectionList.length} marks</span></div>
              {!detectionList.length ? <div className="empty-state"><Eye size={23} /><p>No retained components. Try a closer photo with clearly separated grains.</p></div> : <><div className="detection-list">{detectionList.map((d) => <button key={d.id} className={`detection-row ${selectedDetection === d.id ? 'selected' : ''}`} onClick={() => setSelectedDetection(d.id)}><span className="detection-color" style={{ background: labelColour(d.label) }} /><span className="detection-main"><strong>{d.id} · {labelText(d.label)}</strong><small>{d.areaPx.toLocaleString()} px · shape ratio {d.principalAxisRatio}</small></span>{d.manualReason && <span className="edited-mark" title="Manually adjusted">Edited</span>}<ChevronDown size={16} /></button>)}</div>
                {currentDetection && <div className="review-editor"><div className="review-title"><strong>Review {currentDetection.id}</strong><span>{currentDetection.manualReason ? 'Manually adjusted' : 'Algorithm suggestion'}</span></div><p>{currentDetection.reason}</p><label htmlFor="label-select">Confirmed label</label><select id="label-select" value={currentDetection.label} onChange={(e) => adjustDetection(currentDetection.id, e.target.value as Detection['label'])}><option value="whole">Whole-grain candidate</option><option value="broken">Broken-fragment candidate</option><option value="foreign">Foreign-material candidate</option><option value="uncertain">Uncertain / review required</option></select><dl className="feature-list"><div><dt>Area</dt><dd>{currentDetection.areaPx.toLocaleString()} px</dd></div><div><dt>Bounding box</dt><dd>{currentDetection.box.width} × {currentDetection.box.height}</dd></div><div><dt>Principal-axis ratio</dt><dd>{currentDetection.principalAxisRatio}</dd></div><div><dt>Mean RGB</dt><dd>{currentDetection.meanRGB.r}, {currentDetection.meanRGB.g}, {currentDetection.meanRGB.b}</dd></div></dl><small className="muted">The label is a visual estimate. This app cannot confirm species or official quality grade.</small></div>}
              </>}
            </section>
          </div>
          <div className="notice notice-blue method-note"><Info size={18} /><div><strong>What these numbers mean</strong><p>They are counts of detected connected regions, not the number of physical grains in all cases. Touching grains can merge into one region; fragments can split into several regions. Object counts are not mass percentages or official quality grades.</p><p className="diagnostic-line">Threshold: {analysis.threshold} · Foreground: {(analysis.thresholdDiagnostics.foregroundRatio * 100).toFixed(1)}% · Processing frame: {analysis.width} × {analysis.height} px · Algorithm: {analysis.algorithmVersion}</p></div></div>
          <div className="save-record-row"><div><h3>Save reviewable evidence</h3><p>Save the image, current labels, original algorithm suggestions and settings to this browser’s IndexedDB.</p></div><button className="button button-primary" onClick={() => void saveInspection()} disabled={busy || !annotatedImage}><ClipboardCheck size={17} /> Save inspection locally</button></div>
        </section>}
      </section>}

      {view === 'history' && <section className="page-section"><div className="page-heading"><div><span className="eyebrow">STORED ON THIS DEVICE</span><h1>Local inspection history</h1><p>Records stay in this browser. They can disappear when browser/site data is cleared or private browsing ends.</p></div><button className="button button-outline" onClick={() => { clearCurrent(); setView('inspect'); }}><ScanLine size={16} /> New inspection</button></div>
        <div className="history-toolbar"><div className="search-field"><Eye size={16} /><input value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="Search ID, crop or source" aria-label="Search inspection history" /></div><select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)} aria-label="Filter by input source"><option value="all">All sources</option><option value="camera">Camera</option><option value="upload">Uploads</option><option value="demo">Demo fixtures</option></select><button className="button button-danger-quiet" onClick={() => void deleteAll()} disabled={!records.length}><Trash2 size={15} /> Clear all</button></div>
        {!filteredRecords.length ? <div className="empty-history"><div className="empty-image-icon"><History size={28} /></div><h2>{records.length ? 'No matching inspections' : 'No saved inspections yet'}</h2><p>{records.length ? 'Try a different search or filter.' : 'After analysing a sample, save the record to find its annotated image and counts here.'}</p><button className="button button-primary" onClick={() => { clearCurrent(); setView('inspect'); }}><ScanLine size={17} /> Start an inspection</button></div> : <div className="history-list">{filteredRecords.map((record) => <HistoryRow key={record.id} record={record} onOpen={() => openRecord(record)} onExport={() => exportRecord(record)} onDelete={() => void deleteOne(record)} />)}</div>}
        <div className="privacy-footnote"><LockKeyhole size={16} /><span>Stored locally in IndexedDB · up to 20 records retained · never uploaded by default.</span></div>
      </section>}

      {view === 'details' && activeRecord && <section className="page-section"><div className="page-heading"><div><button className="back-link" onClick={() => setView('history')}><ArrowLeft size={15} /> Local history</button><span className="eyebrow">INSPECTION RECORD</span><h1>{activeRecord.id}</h1><p>{friendlyDate(activeRecord.createdAt)} · Wheat · {activeRecord.source}{activeRecord.demo ? ' · demo fixture' : ''}</p></div><div className="detail-actions"><button className="button button-outline" onClick={() => exportRecord(activeRecord)}><FileJson size={16} /> Export JSON</button><button className="button button-danger-quiet" onClick={() => void deleteOne(activeRecord)}><Trash2 size={15} /> Delete</button></div></div>
        {activeRecord.demo && <div className="notice notice-blue"><Info size={18} /><div><strong>Demo fixture record</strong><p>This synthetic fixture is not a real farmer’s sample.</p></div></div>}
        <div className="summary-grid"><CountCard title="Whole candidates" count={activeRecord.counts.whole} color="green" note="Current reviewed labels" /><CountCard title="Broken candidates" count={activeRecord.counts.broken} color="yellow" note="Current reviewed labels" /><CountCard title="Foreign candidates" count={activeRecord.counts.foreign} color="red" note="Current reviewed labels" /><CountCard title="Uncertain" count={activeRecord.counts.uncertain} color="slate" note="Human review recommended" /></div>
        <div className="record-detail-grid"><section className="panel"><h3>Saved evidence</h3><div className="compare-images"><figure><img src={activeRecord.sourceImageDataUrl} alt="Saved source image" /><figcaption>Source image (normalized)</figcaption></figure><figure><img src={activeRecord.annotatedImageDataUrl} alt="Saved annotation" /><figcaption>Saved annotation</figcaption></figure></div><div className="image-actions"><button className="button button-outline" onClick={() => downloadDataUrl(`${safeFilename(activeRecord.id)}-annotated.png`, activeRecord.annotatedImageDataUrl)}><Download size={16} /> Annotated PNG</button><button className="button button-outline" onClick={() => downloadDataUrl(`${safeFilename(activeRecord.id)}-source.jpg`, activeRecord.sourceImageDataUrl)}><Download size={16} /> Source JPG</button></div></section><section className="panel"><h3>Record details</h3><dl className="record-metadata"><div><dt>Created</dt><dd>{friendlyDate(activeRecord.createdAt)}</dd></div><div><dt>Source</dt><dd>{activeRecord.source}</dd></div><div><dt>Algorithm</dt><dd>{activeRecord.algorithmVersion}</dd></div><div><dt>Threshold</dt><dd>{activeRecord.settings.threshold}</dd></div><div><dt>Processing size</dt><dd>{activeRecord.settings.processingWidth} × {activeRecord.settings.processingHeight}</dd></div><div><dt>Connectivity</dt><dd>{activeRecord.settings.connectivity}-connected components</dd></div><div><dt>Ignored noise regions</dt><dd>{activeRecord.ignored}</dd></div><div><dt>Algorithm counts</dt><dd>Whole {activeRecord.initialCounts.whole} · Broken {activeRecord.initialCounts.broken} · Foreign {activeRecord.initialCounts.foreign} · Uncertain {activeRecord.initialCounts.uncertain}</dd></div></dl>
          {activeRecord.warnings.length > 0 && <div className="record-warnings"><strong>Saved warnings</strong><ul>{activeRecord.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}<p className="disclaimer-small">{activeRecord.disclaimer}</p></section></div>
        <section className="panel record-detections"><h3>Saved detections and manual adjustments</h3><div className="table-scroll"><table><thead><tr><th>ID</th><th>Current label</th><th>Algorithm label</th><th>Area (px)</th><th>Box</th><th>RGB</th><th>Review</th></tr></thead><tbody>{activeRecord.detections.map((d) => <tr key={d.id}><td>{d.id}</td><td><span className="table-label" style={{ color: labelColour(d.label) }}>{labelText(d.label)}</span></td><td>{labelText(d.algorithmLabel)}</td><td>{d.areaPx.toLocaleString()}</td><td>{d.box.width} × {d.box.height}</td><td>{d.meanRGB.r}, {d.meanRGB.g}, {d.meanRGB.b}</td><td>{d.manualReason || '—'}</td></tr>)}</tbody></table></div></section>
      </section>}

      {view === 'about' && <AboutView onInspect={() => { clearCurrent(); setView('inspect'); }} />}
    </main>

    <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><Sprout size={21} /></span><div><strong>AgroPurity</strong><span>Visual screening, with visible limits.</span></div></div><div className="footer-disclaimer">Preliminary visual aid only · Not an official grade or certified agricultural test</div><button className="text-button" onClick={() => setView('about')}>Method & limitations <ArrowRight size={14} /></button></footer>

    {showInstallHelp && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowInstallHelp(false); }}><section className="install-modal" role="dialog" aria-modal="true" aria-labelledby="install-help-title"><button className="modal-close" onClick={() => setShowInstallHelp(false)} aria-label="Close install instructions"><X size={18} /></button><div className="modal-icon"><Smartphone size={25} /></div><span className="eyebrow">INSTALL AGROPURITY</span><h2 id="install-help-title">Add the app to your device</h2><p className="modal-lede">Installation availability depends on the browser and whether this site is served securely over HTTPS.</p><div className="install-instructions"><div><strong>Android · Chrome</strong><p>Open the browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>. The custom install prompt appears when Chrome reports that the app is installable.</p></div><div><strong>iPhone / iPad · Safari</strong><p>Tap <b>Share</b>, scroll the sheet, then choose <b>Add to Home Screen</b>. iOS does not expose the same install prompt event as Chrome.</p></div><div><strong>Desktop · supported browsers</strong><p>Look for an install icon in the address bar or use the browser menu’s <b>Install AgroPurity</b> option.</p></div></div><p className="muted small-note">An Android APK has not been published or device-verified yet. The installable PWA is not an APK.</p><button className="button button-primary button-full" onClick={() => setShowInstallHelp(false)}>Got it</button></section></div>}
  </div>;
}

function PipelineStep({ n, title, text, active, last = false }: { n: string; title: string; text: string; active: boolean; last?: boolean }) {
  return <div className={`pipeline-step ${last ? 'last-step' : ''}`}><div className={`pipeline-step-no ${active ? 'step-running' : ''}`}>{active ? <span className="spinner spinner-small" /> : n}</div><div><strong>{title}</strong><p>{text}</p></div>{!last && <div className="step-line" />}</div>;
}
function CountCard({ title, count, color, note }: { title: string; count: number; color: 'green' | 'yellow' | 'red' | 'slate'; note: string }) {
  return <div className={`count-card count-${color}`}><div className="count-top"><span className="count-marker" /><span className="count-total">{count}</span></div><strong>{title}</strong><small>{note}</small></div>;
}
function HomeView({ records, onInspect, onHistory, onDemo, onInstall, onAbout, installed }: { records: InspectionRecord[]; onInspect: () => void; onHistory: () => void; onDemo: () => void; onInstall: () => void; onAbout: () => void; installed: boolean }) {
  return <>
    <section className="hero-section"><div className="hero-copy"><span className="eyebrow hero-eyebrow"><span className="eyebrow-dot" /> LOCAL-FIRST · WHEAT-FIRST PROTOTYPE</span><h1>See the sample.<br /><em>Keep the evidence.</em></h1><p className="hero-lede">A phone-based visual screening aid that marks candidate grain regions and saves a reviewable image record — without sending the photo to a cloud AI service.</p><div className="hero-actions"><button className="button button-primary button-large" onClick={onInspect}><ScanLine size={18} /> Start grain inspection <ArrowRight size={17} /></button><button className="button button-light button-large" onClick={onDemo}><Eye size={17} /> Explore demo fixture</button></div><div className="hero-proof"><span><LockKeyhole size={16} /> On-device pixel analysis</span><span><ShieldCheck size={16} /> Explainable rules</span><span><FileText size={16} /> Local evidence record</span></div></div><div className="hero-visual"><div className="hero-card"><div className="hero-card-top"><span><span className="live-dot" /> SAMPLE OVERVIEW</span><span className="hero-sample-id">AP / WHEAT</span></div><div className="hero-photo"><img src="/demo-grain.svg" alt="Synthetic illustrative wheat sample on a plain background" /><div className="sample-box box-one"><span>candidate region</span></div><div className="sample-box box-two"><span>candidate region</span></div><div className="sample-box box-three"><span>review region</span></div><div className="photo-overlay-note">Illustrative fixture · not a result</div></div><div className="hero-card-stats"><div><span className="stat-mini green" /><strong>Whole</strong><span>candidate</span></div><div><span className="stat-mini yellow" /><strong>Broken</strong><span>candidate</span></div><div><span className="stat-mini slate" /><strong>Uncertain</strong><span>review</span></div></div></div><div className="floating-note"><div className="floating-icon"><LockKeyhole size={17} /></div><div><strong>Designed for privacy</strong><span>Photos stay in this browser</span></div><CheckCircle2 size={17} /></div></div></section>
    <section className="trust-strip"><div><span className="trust-icon"><CloudOff size={19} /></span><div><strong>No cloud AI call</strong><span>Core analysis runs in the browser</span></div></div><div><span className="trust-icon"><ScanLine size={19} /></span><div><strong>Visible regions</strong><span>Boxes and measured features</span></div></div><div><span className="trust-icon"><History size={19} /></span><div><strong>Reviewable history</strong><span>Exportable local records</span></div></div><div><span className="trust-icon"><ShieldCheck size={19} /></span><div><strong>Honest scope</strong><span>Not a certified grading system</span></div></div></section>
    <section className="content-section workflow-section"><div className="section-heading"><span className="eyebrow">A SIMPLE WORKFLOW</span><h2>From phone photo to reviewable evidence</h2><p>Every step is visible, and questionable images are flagged instead of quietly becoming confident-looking results.</p></div><div className="workflow-grid"><WorkflowCard n="01" icon={<Camera size={22} />} title="Capture or upload" text="Spread wheat in a thin layer on plain white paper. Capture a frame or upload a supported image." /><WorkflowCard n="02" icon={<ScanLine size={22} />} title="Analyse pixels locally" text="Grayscale, Otsu thresholding, connected components and per-region measurements run in your browser." /><WorkflowCard n="03" icon={<Eye size={22} />} title="Review the overlay" text="Inspect candidate classes, read the explanation, and manually correct uncertain labels." /><WorkflowCard n="04" icon={<ClipboardCheck size={22} />} title="Keep a local record" text="Save the result, image, algorithm labels, manual changes and warnings. Export JSON and the annotated PNG." /></div></section>
    <section className="content-section boundary-section"><div><span className="eyebrow">BOUNDARIES MATTER</span><h2>Useful screening starts with honest limits.</h2><p>AgroPurity is a preliminary visual aid. Classical image processing cannot reliably split every touching grain, detect internal damage, measure moisture or toxins, or determine an official grade from a photo.</p><button className="text-button dark-text-button" onClick={onAbout}>Read method & limitations <ArrowRight size={15} /></button></div><div className="boundary-list"><BoundaryItem icon={<Check size={17} />} title="Implemented in the prototype" text="Local pixel processing, rule explanations, region overlays, review controls, IndexedDB history, JSON/PNG export." good /><BoundaryItem icon={<AlertTriangle size={17} />} title="Experimental and uncalibrated" text="Whole / broken / foreign labels are heuristic candidates. Synthetic tests do not validate field accuracy." /><BoundaryItem icon={<X size={17} />} title="Not provided" text="AGMARK grade, official deduction, grain mass %, moisture, toxin, pesticide or legal procurement decisions." /></div></section>
    <section className="content-section use-cards-section"><div className="section-heading left-heading"><span className="eyebrow">GET STARTED</span><h2>Try it on your device</h2><p>Use a real photo for an inspection, or start with the clearly labelled bundled engineering fixture.</p></div><div className="start-cards"><button className="start-card" onClick={onInspect}><span className="start-card-icon green-bg"><Camera size={23} /></span><strong>New inspection</strong><span>Open camera or choose an image.</span><span className="start-card-link">Start now <ArrowRight size={15} /></span></button><button className="start-card" onClick={onHistory}><span className="start-card-icon yellow-bg"><History size={23} /></span><strong>Local history <span className="small-counter">{records.length}</span></strong><span>Reopen a saved record and export evidence.</span><span className="start-card-link">View history <ArrowRight size={15} /></span></button><button className="start-card" onClick={onInstall}><span className="start-card-icon slate-bg"><Smartphone size={23} /></span><strong>{installed ? 'App installed' : 'Install AgroPurity'}</strong><span>Install the website as a PWA where supported.</span><span className="start-card-link">{installed ? 'Installed' : 'Installation options'} <ArrowRight size={15} /></span></button></div></section>
    <section className="disclaimer-banner"><div className="disclaimer-icon"><Info size={21} /></div><div><strong>Preliminary visual screening only</strong><p>Not an official or legal grade. Counts are component estimates, not mass percentages. Always verify sample quality using the appropriate validated method.</p></div></section>
  </>;
}
function WorkflowCard({ n, icon, title, text }: { n: string; icon: import('react').ReactNode; title: string; text: string }) { return <div className="workflow-card"><div className="workflow-icon">{icon}<span>{n}</span></div><h3>{title}</h3><p>{text}</p></div>; }
function BoundaryItem({ icon, title, text, good = false }: { icon: React.ReactNode; title: string; text: string; good?: boolean }) { return <div className={`boundary-item ${good ? 'boundary-good' : ''}`}><span className="boundary-icon">{icon}</span><div><strong>{title}</strong><p>{text}</p></div></div>; }
function HistoryRow({ record, onOpen, onExport, onDelete }: { record: InspectionRecord; onOpen: () => void; onExport: () => void; onDelete: () => void }) {
  return <article className="history-row"><button className="history-thumb" onClick={onOpen} aria-label={`Open ${record.id}`}><img src={record.annotatedImageDataUrl} alt="" /></button><button className="history-summary" onClick={onOpen}><span className="history-id-line"><strong>{record.id}</strong>{record.demo && <span className="demo-badge">Demo fixture</span>}<span className="history-source">{record.source}</span></span><span className="history-date"><Clock3 size={14} /> {friendlyDate(record.createdAt)}</span><span className="history-counts"><b className="green-txt">{record.counts.whole}</b> whole <b className="yellow-txt">{record.counts.broken}</b> broken <b className="red-txt">{record.counts.foreign}</b> foreign <b className="slate-txt">{record.counts.uncertain}</b> uncertain</span></button><div className="history-actions"><button className="icon-button" onClick={onExport} title="Export JSON" aria-label="Export JSON"><FileJson size={17} /></button><button className="icon-button danger-icon" onClick={onDelete} title="Delete record" aria-label="Delete record"><Trash2 size={17} /></button><button className="button button-outline button-small" onClick={onOpen}>Open <ArrowRight size={14} /></button></div></article>;
}
function AboutView({ onInspect }: { onInspect: () => void }) {
  return <section className="page-section about-page"><div className="page-heading"><div><span className="eyebrow">METHOD & LIMITATIONS</span><h1>Transparent by design</h1><p>The prototype uses classical computer vision, not a trained ML classifier. Each stage can fail; the interface makes that visible.</p></div><button className="button button-primary" onClick={onInspect}><ScanLine size={17} /> Try a sample</button></div>
    <div className="about-grid"><section className="panel"><div className="about-icon"><ScanLine size={20} /></div><h3>What is implemented</h3><ul className="check-list"><li>Browser-side pixel access through Canvas.</li><li>Grayscale luminance: 0.299R + 0.587G + 0.114B.</li><li>Otsu histogram threshold with uniform-image guard.</li><li>Two-pass connected components with dynamic disjoint-set labels.</li><li>Area, bounding box, centroid, mean RGB, covariance-based principal-axis ratio.</li><li>Per-object candidate labels, annotated image, manual correction and local record export.</li></ul></section><section className="panel"><div className="about-icon caution-icon"><AlertTriangle size={20} /></div><h3>What is experimental</h3><ul className="bullet-list"><li>Shape/colour thresholds are provisional engineering heuristics.</li><li>The system is not trained or calibrated on a labelled agricultural dataset.</li><li>Lighting, background texture, camera distance and grain variety can alter results.</li><li>Connected-component labelling does not separate touching grains by itself.</li><li>The bundled demo is a synthetic software fixture, not a real sample.</li></ul></section><section className="panel"><div className="about-icon privacy-icon"><LockKeyhole size={20} /></div><h3>Privacy & offline behaviour</h3><ul className="check-list"><li>Uploaded photos are processed in the browser and are not sent to an analysis API.</li><li>Saved records are stored in this browser’s IndexedDB.</li><li>The site includes a service worker and PWA manifest for cached app-shell access after first load.</li><li>First visit and fresh deployment need a network connection; camera permission requires a secure context.</li><li>Browser storage can be cleared or evicted. Export important evidence for safekeeping.</li></ul></section><section className="panel"><div className="about-icon warning-icon"><Info size={20} /></div><h3>What it does not measure</h3><ul className="bullet-list"><li>Weight-based impurity percentages or purity by mass.</li><li>Moisture, toxins, pesticide residues, hidden damage or biological species with certainty.</li><li>AGMARK or any official government grade, procurement eligibility, MSP entitlement or mandi deduction.</li><li>Cryptographic integrity, tamper-proof evidence or legal admissibility.</li></ul></section></div>
    <div className="notice notice-amber about-disclaimer"><AlertTriangle size={19} /><div><strong>Do not use these results for financial or legal decisions.</strong><p>Real-world accuracy, speed and count error have not been measured. Before any such claim, the team would need a labelled wheat dataset, independent reference counts, multiple devices and lighting conditions, and documented validation.</p></div></div>
  </section>;
}

export default App;
