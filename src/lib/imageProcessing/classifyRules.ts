import type { DetectionLabel } from '../../types';
import { DEFAULT_CLASSIFIER_CONFIG } from '../../types';

/**
 * Rule-based labels for multi-object scenes (browser).
 * ROOT CAUSE of past false "foreign" on wheat: foreign rules ran first and treated
 * any dark/low-chroma region as foreign — including underexposed or brown grains.
 * Fix: grain-shaped + warm/mid-tone regions prefer whole/broken/uncertain;
 * foreign requires stone-like darkness (very low luma + low chroma) or extreme neutrality.
 * This is NOT a trained multi-crop neural net.
 */
export function classify(
  area: number,
  aspect: number,
  lum: number,
  rgb?: { r: number; g: number; b: number }
): { label: DetectionLabel; reason: string } {
  const cfg = DEFAULT_CLASSIFIER_CONFIG;
  if (area < cfg.noiseAreaMax) return { label: 'noise', reason: `Area ${area}px noise` };
  if (area < cfg.minArea) return { label: 'uncertain', reason: `Area ${area}px small` };
  if (area > cfg.maxArea) return { label: 'uncertain', reason: `Area ${area}px large` };

  const r = rgb?.r ?? lum;
  const g = rgb?.g ?? lum;
  const b = rgb?.b ?? lum;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const channelMin = Math.min(r, g, b);
  const warmGrain = r >= g - 8 && g >= b - 5 && r >= b + 8 && chroma >= 18 && lum >= 70 && lum <= 210;
  const grainShaped =
    aspect >= cfg.wholeAspectMin && aspect <= cfg.wholeAspectMax &&
    area >= cfg.minArea && area <= cfg.maxArea;

  const stoneLike =
    lum < 55 && chroma < 28 && channelMin < 50;
  const darkNeutralDebris =
    lum < 70 && chroma < 22 && channelMin < 60 && !warmGrain;

  if (stoneLike || darkNeutralDebris) {
    if (grainShaped && warmGrain) {
      return { label: 'uncertain', reason: `Dark but warm grain-like (lum ${lum.toFixed(0)})` };
    }
    return {
      label: 'foreign',
      reason: stoneLike
        ? `Stone-like dark neutral (lum ${lum.toFixed(0)}, chroma ${chroma.toFixed(0)})`
        : `Dark debris (lum ${lum.toFixed(0)}, chroma ${chroma.toFixed(0)})`,
    };
  }

  if (aspect < cfg.brokenAspectMax || aspect > 1 / cfg.brokenAspectMax) {
    if (aspect < 0.3 || aspect > 3.5) return { label: 'uncertain', reason: `Extreme aspect ${aspect.toFixed(2)}` };
    return { label: 'broken', reason: `Aspect ${aspect.toFixed(2)}` };
  }

  if (grainShaped) {
    if (warmGrain || (lum >= 90 && lum <= 200)) {
      return { label: 'whole', reason: `Grain-like area ${area} aspect ${aspect.toFixed(2)} lum ${lum.toFixed(0)}` };
    }
    return { label: 'uncertain', reason: `Grain shape, atypical colour (lum ${lum.toFixed(0)}, chroma ${chroma.toFixed(0)})` };
  }

  if (aspect >= cfg.wholeAspectMin && aspect <= cfg.wholeAspectMax) {
    return { label: 'whole', reason: `Area ${area} aspect ${aspect.toFixed(2)}` };
  }
  return { label: 'uncertain', reason: 'Ambiguous features' };
}
