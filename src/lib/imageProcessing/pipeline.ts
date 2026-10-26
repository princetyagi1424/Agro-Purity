/**
 * Self-contained AgroPurity image-processing pipeline (browser).
 */
import { toGrayscale } from './grayscale';
import { otsuThreshold } from './otsu';
import { segmentBinary } from './segmentation';
import { checkImageQuality } from './qualityChecks';
import type { InspectionResult, ComponentFeatures, DetectionLabel, ClassificationCounts } from '../../types';
import { ALGORITHM_VERSION, DEFAULT_CLASSIFIER_CONFIG } from '../../types';

const MAX_PROCESS_DIM = 1280;

function connectedComponents(mask: Uint8Array, width: number, height: number) {
  const n = width * height;
  const labels = new Int32Array(n);
  const parent = new Int32Array(Math.min(n, 200000) + 16);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  let nextId = 1;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    let c = x;
    while (c !== r) { const n2 = parent[c]!; parent[c] = r; c = n2; }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const neigh = [[-1,-1],[0,-1],[1,-1],[-1,0]] as const;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 0) continue;
      const ns: number[] = [];
      for (const [dx, dy] of neigh) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width) continue;
        const nidx = ny * width + nx;
        if (labels[nidx]! > 0) ns.push(labels[nidx]!);
      }
      if (ns.length === 0) {
        labels[idx] = nextId;
        parent[nextId] = nextId;
        nextId++;
      } else {
        let minL = ns[0]!;
        for (const l of ns) if (l < minL) minL = l;
        labels[idx] = minL;
        for (const l of ns) if (l !== minL) union(minL, l);
      }
    }
  }
  type Comp = { label: number; area: number; minX: number; minY: number; maxX: number; maxY: number; sumX: number; sumY: number; samplePixels: number[] };
  const rootMap = new Map<number, number>();
  let nextFinal = 1;
  const comps = new Map<number, Comp>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (labels[idx]! === 0) continue;
      const root = find(labels[idx]!);
      let fl = rootMap.get(root);
      if (fl === undefined) {
        fl = nextFinal++;
        rootMap.set(root, fl);
        comps.set(fl, { label: fl, area: 0, minX: x, minY: y, maxX: x, maxY: y, sumX: 0, sumY: 0, samplePixels: [] });
      }
      labels[idx] = fl;
      const c = comps.get(fl)!;
      c.area++; c.minX = Math.min(c.minX, x); c.minY = Math.min(c.minY, y);
      c.maxX = Math.max(c.maxX, x); c.maxY = Math.max(c.maxY, y);
      c.sumX += x; c.sumY += y;
      if (c.samplePixels.length < 64) c.samplePixels.push(idx);
    }
  }
  return { components: Array.from(comps.values()), labelCount: nextFinal - 1 };
}

function classify(area: number, aspect: number, lum: number): { label: DetectionLabel; reason: string } {
  const cfg = DEFAULT_CLASSIFIER_CONFIG;
  if (area < cfg.noiseAreaMax) return { label: 'noise', reason: `Area ${area}px noise` };
  if (area < cfg.minArea) return { label: 'uncertain', reason: `Area ${area}px small` };
  if (area > cfg.maxArea) return { label: 'uncertain', reason: `Area ${area}px large` };
  if (lum < cfg.foreignLuminanceMax) return { label: 'foreign', reason: `Low luminance ${lum.toFixed(0)}` };
  if (aspect < cfg.brokenAspectMax || aspect > 1 / cfg.brokenAspectMax) {
    if (aspect < 0.3 || aspect > 3.5) return { label: 'uncertain', reason: `Extreme aspect ${aspect.toFixed(2)}` };
    return { label: 'broken', reason: `Aspect ${aspect.toFixed(2)}` };
  }
  if (aspect >= cfg.wholeAspectMin && aspect <= cfg.wholeAspectMax) {
    return { label: 'whole', reason: `Area ${area} aspect ${aspect.toFixed(2)}` };
  }
  return { label: 'uncertain', reason: 'Ambiguous features' };
}

export function countLabels(detections: ComponentFeatures[]): ClassificationCounts {
  const counts: ClassificationCounts = { whole: 0, broken: 0, foreign: 0, uncertain: 0, noise: 0, ignored: 0 };
  for (const d of detections) counts[d.label]++;
  return counts;
}

export async function loadImageElement(source: string | Blob | HTMLImageElement): Promise<HTMLImageElement> {
  if (source instanceof HTMLImageElement && source.complete && source.naturalWidth > 0) return source;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    if (typeof source === 'string') img.src = source;
    else if (source instanceof Blob) img.src = URL.createObjectURL(source);
  });
}

function imageToImageData(img: HTMLImageElement, maxDim = MAX_PROCESS_DIM) {
  const ow = img.naturalWidth || img.width;
  const oh = img.naturalHeight || img.height;
  if (ow < 1 || oh < 1) throw new Error('Invalid image dimensions');
  let tw = ow, th = oh, scale = 1;
  if (Math.max(ow, oh) > maxDim) {
    scale = maxDim / Math.max(ow, oh);
    tw = Math.round(ow * scale);
    th = Math.round(oh * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = tw; canvas.height = th;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, tw, th);
  return { imageData: ctx.getImageData(0, 0, tw, th), scale };
}

function drawAnnotations(img: HTMLImageElement, detections: ComponentFeatures[], scale: number): string {
  const canvas = document.createElement('canvas');
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0);
  const inv = scale > 0 ? 1 / scale : 1;
  const colors: Record<string, string> = { whole: '#22c55e', broken: '#f59e0b', foreign: '#ef4444', uncertain: '#8b5cf6' };
  for (const d of detections) {
    if (d.label === 'noise') continue;
    ctx.strokeStyle = colors[d.label] ?? '#fff';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) / 400));
    ctx.strokeRect(d.bbox.x * inv, d.bbox.y * inv, d.bbox.width * inv, d.bbox.height * inv);
  }
  return canvas.toDataURL('image/png');
}

export async function runPipeline(
  source: string | Blob | HTMLImageElement,
  options: { forceContinue?: boolean } = {}
): Promise<InspectionResult> {
  const t0 = performance.now();
  const img = await loadImageElement(source);
  const { imageData, scale } = imageToImageData(img);
  const { width, height, data } = imageData;
  const gray = toGrayscale(data, width, height);
  const otsu = otsuThreshold(gray);
  const seg = segmentBinary(gray, otsu.threshold);
  const quality = checkImageQuality(gray, width, height, seg.foregroundRatio);

  if (!quality.ok && !options.forceContinue) {
    return {
      detections: [],
      counts: { whole: 0, broken: 0, foreign: 0, uncertain: 0, noise: 0, ignored: 0 },
      quality,
      diagnostics: {
        threshold: otsu.threshold, componentCountRaw: 0, componentCountKept: 0,
        processingMs: Math.round(performance.now() - t0), algorithmVersion: ALGORITHM_VERSION,
        resizedWidth: width, resizedHeight: height, polarity: seg.polarity,
      },
    };
  }

  const ccl = connectedComponents(seg.mask, width, height);
  const detections: ComponentFeatures[] = [];
  for (const c of ccl.components) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const aspect = bw / Math.max(bh, 1);
    let sumR = 0, sumG = 0, sumB = 0, sumY = 0, samples = 0;
    for (const idx of c.samplePixels) {
      const p = idx * 4;
      sumR += data[p] ?? 0; sumG += data[p + 1] ?? 0; sumB += data[p + 2] ?? 0;
      sumY += gray[idx] ?? 0; samples++;
    }
    if (samples === 0) samples = 1;
    const meanLuminance = sumY / samples;
    const { label, reason } = classify(c.area, aspect, meanLuminance);
    detections.push({
      id: c.label, area: c.area,
      bbox: { x: c.minX, y: c.minY, width: bw, height: bh },
      aspectRatio: Math.round(aspect * 1000) / 1000,
      centroid: { x: Math.round(c.sumX / c.area), y: Math.round(c.sumY / c.area) },
      meanRgb: { r: Math.round(sumR / samples), g: Math.round(sumG / samples), b: Math.round(sumB / samples) },
      meanLuminance: Math.round(meanLuminance * 10) / 10,
      label, labelReason: reason,
    });
  }
  const kept = detections.filter((d) => d.label !== 'noise');
  const counts = countLabels(detections);
  const annotated = drawAnnotations(img, kept, scale);

  return {
    detections, counts, quality,
    diagnostics: {
      threshold: otsu.threshold, componentCountRaw: ccl.labelCount, componentCountKept: kept.length,
      processingMs: Math.round(performance.now() - t0), algorithmVersion: ALGORITHM_VERSION,
      resizedWidth: width, resizedHeight: height, polarity: seg.polarity,
    },
    annotatedImageDataUrl: annotated,
    originalImageDataUrl: typeof source === 'string' ? source : undefined,
  };
}
