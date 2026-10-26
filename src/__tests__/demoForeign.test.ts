import { describe, it, expect } from 'vitest';
import { analyzeImageData } from '../lib/imageProcessing/pipeline';

/** Build a synthetic demo-like RGBA image without canvas. */
function buildDemoLikeImage() {
  const W = 320;
  const H = 240;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 245;
    data[i * 4 + 1] = 245;
    data[i * 4 + 2] = 240;
    data[i * 4 + 3] = 255;
  }
  const fillEllipse = (cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) {
          const p = (y * W + x) * 4;
          data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
        }
      }
    }
  };
  const fillRect = (x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const p = (y * W + x) * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
    }
  };
  fillEllipse(60, 50, 18, 12, 196, 163, 90);
  fillEllipse(110, 65, 16, 11, 212, 179, 106);
  fillEllipse(160, 45, 19, 12, 184, 149, 74);
  fillEllipse(210, 70, 17, 11, 201, 168, 94);
  fillEllipse(90, 170, 14, 7, 196, 163, 90);
  fillRect(240, 140, 28, 26, 0, 0, 0);

  return { data, width: W, height: H };
}

describe('demo-like foreign detection', () => {
  it('classifies solid dark debris as foreign (not whole)', () => {
    const { data, width, height } = buildDemoLikeImage();
    const result = analyzeImageData(data, width, height, { forceContinue: true });
    expect(result.counts.foreign).toBeGreaterThanOrEqual(1);
    expect(result.counts.whole).toBeGreaterThanOrEqual(1);
    const foreign = result.detections.filter((d) => d.label === 'foreign');
    expect(foreign.length).toBeGreaterThanOrEqual(1);
    expect(foreign[0]!.meanLuminance).toBeLessThan(85);
  });
});
