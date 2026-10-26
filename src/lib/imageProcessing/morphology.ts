import type { ComponentFeatures } from '../../types';

export function dilate3(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (mask[ny * width + nx]) { on = 1; break; }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

export function erode3(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 1;
      for (let dy = -1; dy <= 1 && on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) { on = 0; break; }
          if (!mask[ny * width + nx]) { on = 0; break; }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

/** Close then light open: reconnect cracked grain interiors, drop speckles. */
export function refineMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const closed = erode3(dilate3(mask, width, height), width, height);
  return dilate3(erode3(closed, width, height), width, height);
}

function boxArea(b: { width: number; height: number }): number {
  return Math.max(0, b.width) * Math.max(0, b.height);
}

function intersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

/** Suppress CCL fragment boxes of the same grain (IoU / containment). */
export function dedupeDetections(
  dets: ComponentFeatures[],
  iouThresh = 0.45,
  containThresh = 0.65,
): ComponentFeatures[] {
  const ranked = [...dets].sort((a, b) => b.area - a.area || boxArea(b.bbox) - boxArea(a.bbox));
  const kept: ComponentFeatures[] = [];
  for (const d of ranked) {
    if (d.label === 'noise') continue;
    let suppress = false;
    for (const k of kept) {
      const inter = intersectionArea(d.bbox, k.bbox);
      const aA = boxArea(d.bbox);
      const aK = boxArea(k.bbox);
      const uni = aA + aK - inter;
      const iou = uni > 0 ? inter / uni : 0;
      const containD = aA > 0 ? inter / aA : 0;
      const containK = aK > 0 ? inter / aK : 0;
      if (iou >= iouThresh || containD >= containThresh || containK >= containThresh) {
        suppress = true;
        break;
      }
    }
    if (!suppress) kept.push(d);
  }
  return kept.map((d, i) => ({ ...d, id: i + 1 }));
}
