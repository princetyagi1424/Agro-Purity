import { useState } from 'react';
import { runPipeline } from '../lib/imageProcessing/pipeline';
import type { InspectionResult } from '../types';
import { DISCLAIMER } from '../types';

function createSyntheticGrainImage(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(0, 0, 640, 480);
  const grains = [
    { x: 120, y: 100, rx: 28, ry: 18, rot: 0.3, color: '#c4a35a' },
    { x: 220, y: 130, rx: 26, ry: 17, rot: -0.2, color: '#d4b36a' },
    { x: 320, y: 90, rx: 30, ry: 19, rot: 0.5, color: '#b8954a' },
    { x: 420, y: 140, rx: 27, ry: 18, rot: -0.4, color: '#c9a85e' },
    { x: 180, y: 340, rx: 22, ry: 10, rot: 0.8, color: '#c4a35a' },
    { x: 500, y: 280, rx: 14, ry: 12, rot: 0, color: '#3a3a3a' },
  ];
  for (const g of grains) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx, g.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = g.color;
    ctx.fill();
    ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

export function DemoPage() {
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoSrc] = useState(() => createSyntheticGrainImage());

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await runPipeline(demoSrc, { forceContinue: true });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Demo failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>Demo mode</h1>
      <div className="alert alert-info">
        Synthetic engineering test image — not a real farmer sample or field trial.
      </div>
      <div className="disclaimer">{DISCLAIMER}</div>
      <div className="card">
        <img src={demoSrc} alt="Synthetic grain sample" className="result-img" />
        <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={run} disabled={running}>
          {running ? 'Analysing…' : 'Run analysis on demo image'}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {result && (
        <div className="card">
          <div className="counts-row">
            <span className="count-chip">Whole {result.counts.whole}</span>
            <span className="count-chip">Broken {result.counts.broken}</span>
            <span className="count-chip">Foreign {result.counts.foreign}</span>
            <span className="count-chip">Uncertain {result.counts.uncertain}</span>
          </div>
          {result.annotatedImageDataUrl && (
            <img src={result.annotatedImageDataUrl} alt="Annotated demo" className="result-img" />
          )}
        </div>
      )}
    </div>
  );
}
