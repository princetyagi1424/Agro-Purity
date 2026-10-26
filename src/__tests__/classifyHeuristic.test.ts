import { describe, it, expect } from 'vitest';
import { analyzeImageData } from '../lib/imageProcessing/pipeline';

function blank(W = 320, H = 240) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 245; data[i * 4 + 1] = 245; data[i * 4 + 2] = 240; data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: H };
}

function paintEllipse(data: Uint8ClampedArray, W: number, H: number, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        const p = (y * W + x) * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
    }
  }
}

function paintRect(data: Uint8ClampedArray, W: number, H: number, x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const p = (y * W + x) * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
}

describe('classify heuristic (false-foreign regression)', () => {
  it('labels warm wheat-like regions as whole, not foreign', () => {
    const { data, width, height } = blank();
    paintEllipse(data, width, height, 70, 70, 22, 14, 196, 163, 90);
    paintEllipse(data, width, height, 180, 100, 20, 13, 212, 179, 106);
    const res = analyzeImageData(data, width, height, { forceContinue: true });
    expect(res.counts.foreign).toBe(0);
    expect(res.counts.whole + res.counts.broken + res.counts.uncertain).toBeGreaterThanOrEqual(1);
  });

  it('labels solid black debris as foreign when segmented', () => {
    const { data, width, height } = blank();
    paintEllipse(data, width, height, 70, 70, 22, 14, 196, 163, 90);
    paintRect(data, width, height, 220, 150, 40, 36, 0, 0, 0);
    const res = analyzeImageData(data, width, height, { forceContinue: true });
    if (res.detections.length === 0) {
      expect(res.counts.whole).toBe(0);
      return;
    }
    const blackish = res.detections.filter((d) => d.meanLuminance < 40);
    if (blackish.length) {
      expect(blackish.some((d) => d.label === 'foreign')).toBe(true);
    }
    const warm = res.detections.filter((d) => d.meanLuminance > 120);
    for (const d of warm) expect(d.label).not.toBe('foreign');
  });

  it('does not mark dark brown grain-shaped region as foreign', () => {
    const { data, width, height } = blank();
    paintEllipse(data, width, height, 100, 100, 22, 14, 120, 95, 55);
    const res = analyzeImageData(data, width, height, { forceContinue: true });
    for (const d of res.detections.filter((x) => x.label !== 'noise')) {
      expect(d.label).not.toBe('foreign');
    }
  });
});
