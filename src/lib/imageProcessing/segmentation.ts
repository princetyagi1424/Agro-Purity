/**
 * Binary segmentation from grayscale using Otsu threshold.
 * Attempts to detect polarity (dark grains on light paper vs inverse).
 */
export type Polarity = 'dark-on-light' | 'light-on-dark' | 'unknown';

export interface SegmentationResult {
  mask: Uint8Array;
  polarity: Polarity;
  threshold: number;
  foregroundRatio: number;
}

export function segmentBinary(
  gray: Uint8Array,
  threshold: number,
  preferredPolarity: Polarity = 'dark-on-light'
): SegmentationResult {
  const n = gray.length;
  const mask = new Uint8Array(n);

  let darkCount = 0;
  for (let i = 0; i < n; i++) {
    if (gray[i]! < threshold) darkCount++;
  }
  const darkRatio = darkCount / Math.max(n, 1);

  let polarity: Polarity = preferredPolarity;
  if (darkRatio > 0.55 && darkRatio < 0.95) {
    polarity = 'light-on-dark';
  } else if (darkRatio <= 0.55) {
    polarity = 'dark-on-light';
  } else {
    polarity = 'unknown';
  }

  let fg = 0;
  if (polarity === 'dark-on-light' || polarity === 'unknown') {
    for (let i = 0; i < n; i++) {
      if (gray[i]! < threshold) {
        mask[i] = 1;
        fg++;
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (gray[i]! >= threshold) {
        mask[i] = 1;
        fg++;
      }
    }
  }

  return {
    mask,
    polarity,
    threshold,
    foregroundRatio: fg / Math.max(n, 1),
  };
}
