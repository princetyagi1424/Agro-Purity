/**
 * Grayscale conversion using the standard luminance formula:
 * Y = 0.299 R + 0.587 G + 0.114 B
 */
export function toGrayscale(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);
  for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
    const r = rgba[p] ?? 0;
    const g = rgba[p + 1] ?? 0;
    const b = rgba[p + 2] ?? 0;
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

export function meanLuminance(gray: Uint8Array): number {
  if (gray.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i]!;
  return sum / gray.length;
}

/** Approximate contrast via standard deviation of luminance. */
export function luminanceStdDev(gray: Uint8Array, mean?: number): number {
  if (gray.length === 0) return 0;
  const m = mean ?? meanLuminance(gray);
  let sumSq = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i]! - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / gray.length);
}
