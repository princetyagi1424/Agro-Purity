/**
 * Self-contained AgroPurity image-processing pipeline (browser).
 */
import { toGrayscale } from './grayscale';
import { otsuThreshold } from './otsu';
import { segmentBinary } from './segmentation';
import { checkImageQuality } from './qualityChecks';
import { classify } from './classifyRules';
import { refineMask, dedupeDetections } from './morphology';
export { dedupeDetections } from './morphology';
import type { InspectionResult, ComponentFeatures, ClassificationCounts } from '../../types';
import { ALGORITHM_VERSION } from '../../types';

const MAX_PROCESS_DIM = 1280;

function connectedComponents(mask: Uint8Array, gray: Uint8Array, width: number, height: number) {
  const n = width * height;
  const labels = new Int32Array(n);
  let parent = new Int32Array(1024);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  let nextId = 1;
  const ensureParent = (id: number) => {
    if (id < parent.length) return;
    const np = new Int32Array(Math.max(id + 64, parent.length * 2));
    np.set(parent);
    for (let i = parent.length; i < np.length; i++) np[i] = i;
    parent = np;
  };
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
  const neigh = [[-1, -1], [0, -1], [1, -1], [-1, 0]] as const;
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
        ensureParent(nextId);
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
  type Comp = { label: number; area: number; minX: number; minY: number; maxX: number; maxY: number; sumX: number; sumY: number; sumLuma: number; samplePixels: number[] };
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
        comps.set(fl, { label: fl, area: 0, minX: x, minY: y, maxX: x, maxY: y, sumX: 0, sumY: 0, sumLuma: 0, samplePixels: [] });
      }
      const c = comps.get(fl)!;
      c.area++; c.minX = Math.min(c.minX, x); c.minY = Math.min(c.minY, y);
      c.maxX = Math.max(c.maxX, x); c.maxY = Math.max(c.maxY, y);
      c.sumX += x; c.sumY += y;
      c.sumLuma += gray[idx] ?? 0;
      if (c.samplePixels.length < 64) c.samplePixels.push(idx);
    }
  }
  return { components: [...comps.values()], labelCount: comps.size };
}

export function countLabels(detections: ComponentFeatures[]): ClassificationCounts {
  const counts: ClassificationCounts = { whole: 0, broken: 0, foreign: 0, uncertain: 0, noise: 0, ignored: 0 };
  for (const d of detections) counts[d.label]++;
  return counts;
}

async function loadImage(source: string | Blob): Promise<HTMLImageElement> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = url;
    });
    return img;
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  }
}

function readImageData(img: HTMLImageElement): { imageData: ImageData; scale: number } {
  const ow = img.naturalWidth || img.width;
  const oh = img.naturalHeight || img.height;
  let tw = ow, th = oh, scale = 1;
  const maxDim = Math.max(ow, oh);
  if (maxDim > MAX_PROCESS_DIM) {
    scale = MAX_PROCESS_DIM / Math.max(ow, oh);
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
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = `${Math.max(12, Math.round(Math.min(w, h) / 40))}px sans-serif`;
    ctx.fillText(d.label, d.bbox.x * inv, Math.max(12, d.bbox.y * inv - 4));
  }
  return canvas.toDataURL('image/png');
}

/** Core analysis on raw RGBA pixels (testable without DOM Image). */
export function analyzeImageData(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: { forceContinue?: boolean; skipAnnotation?: boolean }
): Omit<InspectionResult, 'annotatedImageDataUrl' | 'originalImageDataUrl'> & {
  annotatedImageDataUrl?: string;
  originalImageDataUrl?: string;
} {
  const t0 = performance.now();
  const gray = toGrayscale(data, width, height);
  const quality = checkImageQuality(gray, width, height);
  if (!quality.ok && !options?.forceContinue) {
    return {
      detections: [],
      counts: { whole: 0, broken: 0, foreign: 0, uncertain: 0, noise: 0, ignored: 0 },
      quality,
      diagnostics: {
        threshold: 0, componentCountRaw: 0, componentCountKept: 0,
        processingMs: Math.round(performance.now() - t0), algorithmVersion: ALGORITHM_VERSION,
        resizedWidth: width, resizedHeight: height, polarity: 'unknown',
      },
    };
  }

  const otsu = otsuThreshold(gray);
  // The capture guidance requires grains on white paper. Infer foreground polarity
  // from the actual image border (background candidate), not from the global dark
  // pixel ratio. A dense grain sample can occupy most pixels and fool a global
  // ratio heuristic into inverting the mask and boxing the white background.
  const borderValues: number[] = [];
  const borderStep = Math.max(1, Math.floor(Math.min(width, height) / 180));
  for (let x = 0; x < width; x += borderStep) {
    borderValues.push(gray[x]!, gray[(height - 1) * width + x]!);
  }
  for (let y = 0; y < height; y += borderStep) {
    borderValues.push(gray[y * width]!, gray[y * width + width - 1]!);
  }
  borderValues.sort((a, b) => a - b);
  const borderMedian = borderValues[Math.floor(borderValues.length / 2)] ?? 255;
  const inferredPolarity = borderMedian >= otsu.threshold ? 'dark-on-light' : 'light-on-dark';
  const segRaw = segmentBinary(gray, otsu.threshold, inferredPolarity);
  const refined = refineMask(segRaw.mask, width, height);
  let fg = 0;
  for (let i = 0; i < refined.length; i++) if (refined[i]) fg++;
  const seg = {
    mask: refined,
    polarity: segRaw.polarity,
    threshold: segRaw.threshold,
    foregroundRatio: fg / Math.max(width * height, 1),
  };
  if (seg.foregroundRatio < 0.001 || seg.foregroundRatio > 0.85) {
    return {
      detections: [],
      counts: { whole: 0, broken: 0, foreign: 0, uncertain: 0, noise: 0, ignored: 0 },
      quality: {
        ...quality,
        ok: false,
        issues: [
          ...quality.issues,
          { code: 'empty_scene', severity: 'error', message: 'Foreground ratio unusual', recommendation: 'Use plain white paper and a thin grain layer.' },
        ],
      },
      diagnostics: {
        threshold: otsu.threshold, componentCountRaw: 0, componentCountKept: 0,
        processingMs: Math.round(performance.now() - t0), algorithmVersion: ALGORITHM_VERSION,
        resizedWidth: width, resizedHeight: height, polarity: seg.polarity,
      },
    };
  }

  const ccl = connectedComponents(seg.mask, gray, width, height);
  const detections: ComponentFeatures[] = [];
  for (const c of ccl.components) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const aspect = bw / Math.max(bh, 1);
    let sumR = 0, sumG = 0, sumB = 0, samples = 0;
    for (const idx of c.samplePixels) {
      const p = idx * 4;
      sumR += data[p] ?? 0; sumG += data[p + 1] ?? 0; sumB += data[p + 2] ?? 0;
      samples++;
    }
    if (samples === 0) samples = 1;
    const meanLuminance = c.area > 0 ? c.sumLuma / c.area : 0;
    const meanRgb = {
      r: Math.round(sumR / samples),
      g: Math.round(sumG / samples),
      b: Math.round(sumB / samples),
    };
    const { label, reason } = classify(c.area, aspect, meanLuminance, meanRgb);
    detections.push({
      id: c.label, area: c.area,
      bbox: { x: c.minX, y: c.minY, width: bw, height: bh },
      aspectRatio: Math.round(aspect * 1000) / 1000,
      centroid: { x: Math.round(c.sumX / c.area), y: Math.round(c.sumY / c.area) },
      meanRgb,
      meanLuminance: Math.round(meanLuminance * 10) / 10,
      label, labelReason: reason,
    });
  }
  const deduped = dedupeDetections(detections);
  const counts = countLabels(deduped);
  return {
    detections: deduped, counts, quality,
    diagnostics: {
      threshold: otsu.threshold, componentCountRaw: ccl.labelCount, componentCountKept: deduped.length,
      processingMs: Math.round(performance.now() - t0), algorithmVersion: ALGORITHM_VERSION,
      resizedWidth: width, resizedHeight: height, polarity: seg.polarity,
    },
  };
}

export async function runPipeline(
  source: string | Blob,
  options?: { forceContinue?: boolean }
): Promise<InspectionResult> {
  const img = await loadImage(source);
  const { imageData, scale } = readImageData(img);
  const { data, width, height } = imageData;
  const core = analyzeImageData(data, width, height, options);
  const kept = core.detections.filter((d) => d.label !== 'noise');
  const annotated = drawAnnotations(img, kept, scale);

  return {
    ...core,
    annotatedImageDataUrl: annotated,
    originalImageDataUrl: typeof source === 'string' ? source : undefined,
  };
}
