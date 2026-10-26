/**
 * Otsu's method for automatic global threshold selection.
 * Returns threshold in [0, 255] and diagnostic info.
 */
export interface OtsuResult {
  threshold: number;
  maxBetweenClassVariance: number;
  histogram: Uint32Array;
}

export function computeHistogram(gray: Uint8Array): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    hist[gray[i]!]!++;
  }
  return hist;
}

export function otsuThreshold(gray: Uint8Array): OtsuResult {
  const histogram = computeHistogram(gray);
  const total = gray.length;

  if (total === 0) {
    return { threshold: 128, maxBetweenClassVariance: 0, histogram };
  }

  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i]!;

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);

    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  if (maxVar === 0) {
    threshold = 128;
  }

  return { threshold, maxBetweenClassVariance: maxVar, histogram };
}
