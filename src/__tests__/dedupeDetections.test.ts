import { describe, it, expect } from 'vitest';
import { dedupeDetections, analyzeImageData } from '../lib/imageProcessing/pipeline';
import type { ComponentFeatures } from '../types';

function det(partial: Partial<ComponentFeatures> & { id: number; area: number; bbox: ComponentFeatures['bbox'] }): ComponentFeatures {
  return {
    aspectRatio: 1,
    centroid: { x: 0, y: 0 },
    meanRgb: { r: 180, g: 150, b: 80 },
    meanLuminance: 150,
    label: 'whole',
    labelReason: 'test',
    ...partial,
  };
}

describe('dedupeDetections', () => {
  it('keeps a single larger box when two overlap heavily', () => {
    const a = det({ id: 1, area: 400, bbox: { x: 10, y: 10, width: 40, height: 30 } });
    const b = det({ id: 2, area: 100, bbox: { x: 15, y: 12, width: 20, height: 18 } });
    const out = dedupeDetections([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.area).toBe(400);
  });

  it('keeps two neighbouring non-overlapping grains', () => {
    const a = det({ id: 1, area: 200, bbox: { x: 10, y: 10, width: 20, height: 15 } });
    const b = det({ id: 2, area: 200, bbox: { x: 80, y: 10, width: 20, height: 15 } });
    expect(dedupeDetections([a, b])).toHaveLength(2);
  });
});

describe('analyzeImageData consistency', () => {
  it('counts match non-noise detection length categories', () => {
    const W = 320, H = 240;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 245; data[i * 4 + 1] = 245; data[i * 4 + 2] = 240; data[i * 4 + 3] = 255;
    }
    for (let y = 50; y < 80; y++)
      for (let x = 50; x < 90; x++) {
        const nx = (x - 70) / 18, ny = (y - 65) / 12;
        if (nx * nx + ny * ny <= 1) {
          const p = (y * W + x) * 4;
          data[p] = 196; data[p + 1] = 163; data[p + 2] = 90;
        }
      }
    const res = analyzeImageData(data, W, H, { forceContinue: true });
    const sum =
      res.counts.whole + res.counts.broken + res.counts.foreign + res.counts.uncertain +
      res.counts.noise + res.counts.ignored;
    expect(sum).toBe(res.detections.length);
    expect(res.counts.foreign).toBe(0);
  });
  it('keeps foreground as dark-on-light when dark pixels exceed half because the grain sample is dense', () => {
    const W = 320, H = 240;
    const data = new Uint8ClampedArray(W * H * 4);
    // A dim white-paper background (still brighter than the foreground), with a
    // dense, touching cluster of warm grains covering more than half the image.
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 220; data[i * 4 + 1] = 220; data[i * 4 + 2] = 215; data[i * 4 + 3] = 255;
    }
    for (let y = 12; y < 228; y++) for (let x = 12; x < 308; x++) {
      const cx = 26 + Math.floor((x - 12) / 28) * 28;
      const cy = 22 + Math.floor((y - 12) / 22) * 22;
      const nx = (x - cx) / 16, ny = (y - cy) / 13;
      if (nx * nx + ny * ny <= 1) {
        const p = (y * W + x) * 4;
        data[p] = 154; data[p + 1] = 116; data[p + 2] = 62; data[p + 3] = 255;
      }
    }
    const res = analyzeImageData(data, W, H, { forceContinue: true });
    expect(res.diagnostics.polarity).toBe('dark-on-light');
    expect(res.detections.length).toBeGreaterThan(0);
    expect(res.detections.length).toBeLessThan(100);
    expect(res.detections.every((d) => d.bbox.width < W * 0.95 && d.bbox.height < H * 0.95)).toBe(true);
  });

});
