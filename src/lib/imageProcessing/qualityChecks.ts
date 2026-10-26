/**
 * Heuristic image-quality checks before analysis.
 */
import type { ImageQualityReport, ImageQualityIssue } from '../../types';
import { meanLuminance, luminanceStdDev } from './grayscale';

export interface QualityThresholds {
  minWidth: number;
  minHeight: number;
  maxPixels: number;
  minMeanLuminance: number;
  maxMeanLuminance: number;
  minContrast: number;
  maxForegroundRatio: number;
  minForegroundRatio: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minWidth: 200,
  minHeight: 200,
  maxPixels: 12_000_000,
  minMeanLuminance: 25,
  maxMeanLuminance: 245,
  minContrast: 8,
  maxForegroundRatio: 0.65,
  minForegroundRatio: 0.002,
};

export function checkImageQuality(
  gray: Uint8Array,
  width: number,
  height: number,
  foregroundRatio?: number,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS
): ImageQualityReport {
  const issues: ImageQualityIssue[] = [];
  const mean = meanLuminance(gray);
  const contrast = luminanceStdDev(gray, mean);

  if (width < thresholds.minWidth || height < thresholds.minHeight) {
    issues.push({
      code: 'too_small',
      severity: 'error',
      message: `Image is too small (${width}×${height}).`,
      recommendation: 'Use a higher-resolution photo or move the camera closer while keeping grains sharp.',
    });
  }

  if (width * height > thresholds.maxPixels) {
    issues.push({
      code: 'too_large',
      severity: 'warning',
      message: 'Image is very large and will be downscaled for processing.',
      recommendation: 'Processing will continue with a resized copy.',
    });
  }

  if (mean < thresholds.minMeanLuminance) {
    issues.push({
      code: 'too_dark',
      severity: 'error',
      message: `Image is very dark (mean luminance ${mean.toFixed(0)}).`,
      recommendation: 'Improve lighting. Avoid shadows. Prefer diffuse daylight or even indoor light on white paper.',
    });
  } else if (mean > thresholds.maxMeanLuminance) {
    issues.push({
      code: 'too_bright',
      severity: 'error',
      message: `Image is overexposed (mean luminance ${mean.toFixed(0)}).`,
      recommendation: 'Reduce glare or direct light. Avoid flash reflections on paper.',
    });
  }

  if (contrast < thresholds.minContrast) {
    issues.push({
      code: 'low_contrast',
      severity: 'error',
      message: `Low contrast between grains and background (σ=${contrast.toFixed(1)}).`,
      recommendation: 'Use plain white A4 paper and ensure grains are clearly visible against the background.',
    });
  }

  if (foregroundRatio !== undefined) {
    if (foregroundRatio > thresholds.maxForegroundRatio) {
      issues.push({
        code: 'too_many_objects',
        severity: 'warning',
        message: 'Large portion of the image appears as foreground — possible clutter or wrong polarity.',
        recommendation: 'Spread grains in a thin single layer with gaps. Use plain white paper.',
      });
    }
    if (foregroundRatio < thresholds.minForegroundRatio) {
      issues.push({
        code: 'empty_scene',
        severity: 'error',
        message: 'Almost no foreground objects detected.',
        recommendation: 'Ensure grains are present and in focus on a light background.',
      });
    }
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return {
    ok: !hasError,
    width,
    height,
    meanLuminance: Math.round(mean * 10) / 10,
    contrast: Math.round(contrast * 10) / 10,
    issues,
  };
}
