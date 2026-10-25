export const ALGORITHM_VERSION = 'agropurity-cv-0.1.0';
export const MAX_PROCESSING_PIXELS = 900_000;

function assertImageData(rgba, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError('Image width and height must be positive integers.');
  }
  if (!(rgba instanceof Uint8ClampedArray || rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
    throw new TypeError('RGBA data length does not match the supplied image dimensions.');
  }
}

export function toGrayscale(rgba, width, height) {
  assertImageData(rgba, width, height);
  const gray = new Uint8Array(width * height);
  for (let p = 0, j = 0; p < rgba.length; p += 4, j++) {
    // Standard luma approximation used by the prototype; this is not a quality score.
    gray[j] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]);
  }
  return gray;
}

export function otsuThreshold(gray) {
  if (!(gray instanceof Uint8Array) || gray.length === 0) {
    throw new TypeError('A non-empty Uint8Array grayscale image is required.');
  }
  const histogram = new Uint32Array(256);
  let sum = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < gray.length; i++) {
    const value = gray[i];
    histogram[value]++;
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) return { threshold: min, separable: false, betweenClassVariance: 0, min, max };

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maxVariance = -1;
  let threshold = 0;
  for (let t = 0; t < 256; t++) {
    backgroundWeight += histogram[t];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = gray.length - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += t * histogram[t];
    const meanBackground = backgroundSum / backgroundWeight;
    const meanForeground = (sum - backgroundSum) / foregroundWeight;
    const delta = meanBackground - meanForeground;
    const variance = backgroundWeight * foregroundWeight * delta * delta;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return { threshold, separable: max > min && maxVariance > 0, betweenClassVariance: Math.max(0, maxVariance), min, max };
}

export function buildMask(gray, threshold, polarity = 'dark') {
  if (!(gray instanceof Uint8Array) || gray.length === 0 || !Number.isFinite(threshold)) {
    throw new TypeError('Grayscale pixels and a numeric threshold are required.');
  }
  const mask = new Uint8Array(gray.length);
  let foreground = 0;
  for (let i = 0; i < gray.length; i++) {
    const on = polarity === 'bright' ? gray[i] > threshold : gray[i] <= threshold;
    if (on) { mask[i] = 1; foreground++; }
  }
  return { mask, foreground, ratio: foreground / gray.length };
}

export function imageQuality(rgba, width, height, gray = null) {
  const warnings = [];
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !rgba || rgba.length !== width * height * 4) {
    return { acceptable: false, severity: 'error', warnings: ['The image pixels or dimensions are invalid.'], meanBrightness: null, contrast: null };
  }
  if (width < 160 || height < 160) warnings.push('Image is small; retake or upload a larger, sharper image.');
  if (width * height > 12_000_000) return { acceptable: false, severity: 'error', warnings: ['The source image exceeds the 12-megapixel safety limit. Please use a smaller image.'], meanBrightness: null, contrast: null };
  const values = gray || toGrayscale(rgba, width, height);
  let sum = 0;
  let sumSq = 0;
  const n = values.length;
  for (let i = 0; i < n; i++) { sum += values[i]; sumSq += values[i] * values[i]; }
  const meanBrightness = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - meanBrightness * meanBrightness));
  if (meanBrightness < 45) warnings.push('The image is very dark. Add even light and avoid casting a phone shadow.');
  if (meanBrightness > 244) warnings.push('The image is very bright; glare may be washing out visible grain edges.');
  if (contrast < 8) warnings.push('The image has very low contrast, so the background may not separate from grain.');
  const borderSamples = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 200));
  for (let x = 0; x < width; x += stride) {
    borderSamples.push(values[x], values[(height - 1) * width + x]);
  }
  for (let y = 0; y < height; y += stride) {
    borderSamples.push(values[y * width], values[y * width + width - 1]);
  }
  const borderMean = borderSamples.reduce((a, b) => a + b, 0) / Math.max(1, borderSamples.length);
  if (Math.abs(borderMean - meanBrightness) > 42) warnings.push('Strong illumination variation is visible; repeat with diffuse, even lighting.');
  const fatal = contrast < 3.5;
  return { acceptable: !fatal, severity: fatal ? 'error' : warnings.length ? 'warning' : 'ok', warnings, meanBrightness: round(meanBrightness, 1), contrast: round(contrast, 1), borderMean: round(borderMean, 1) };
}

function round(value, digits = 2) { const f = 10 ** digits; return Math.round(value * f) / f; }

export function connectedComponents(mask, width, height, connectivity = 8) {
  if (!(mask instanceof Uint8Array) || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || mask.length !== width * height) {
    throw new TypeError('Binary mask length must match positive image dimensions.');
  }
  if (connectivity !== 4 && connectivity !== 8) throw new RangeError('Connectivity must be 4 or 8.');
  const total = width * height;
  // Hard memory guard; callers should downscale before labeling.
  if (total > MAX_PROCESSING_PIXELS) throw new RangeError(`Image exceeds the ${MAX_PROCESSING_PIXELS.toLocaleString()}-pixel processing limit.`);
  const labels = new Int32Array(total);
  // Dynamic-to-the-image bound: no fixed 50,000-label pool that can overflow.
  const parent = new Int32Array(total + 1);
  const rank = new Uint8Array(total + 1);
  let next = 1;

  const find = (value) => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (value !== root) { const p = parent[value]; parent[value] = root; value = p; }
    return root;
  };
  const union = (a, b) => {
    let ra = find(a); let rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    if (rank[ra] === rank[rb]) rank[ra]++;
  };

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      if (!mask[i]) continue;
      const neighbours = [];
      if (x > 0 && labels[i - 1]) neighbours.push(labels[i - 1]);
      if (y > 0 && labels[i - width]) neighbours.push(labels[i - width]);
      if (connectivity === 8 && y > 0) {
        if (x > 0 && labels[i - width - 1]) neighbours.push(labels[i - width - 1]);
        if (x + 1 < width && labels[i - width + 1]) neighbours.push(labels[i - width + 1]);
      }
      if (!neighbours.length) {
        if (next >= parent.length) throw new RangeError('Connected-component label capacity was exceeded.');
        parent[next] = next;
        labels[i] = next++;
      } else {
        let label = neighbours[0];
        for (let k = 1; k < neighbours.length; k++) union(label, neighbours[k]);
        labels[i] = label;
      }
    }
  }

  const components = new Map();
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const label = labels[i];
      if (!label) continue;
      const root = find(label);
      labels[i] = root;
      let c = components.get(root);
      if (!c) {
        c = { id: root, area: 0, minX: x, minY: y, maxX: x, maxY: y, sumX: 0, sumY: 0, sumX2: 0, sumY2: 0, sumXY: 0 };
        components.set(root, c);
      }
      c.area++;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      c.sumX += x; c.sumY += y; c.sumX2 += x * x; c.sumY2 += y * y; c.sumXY += x * y;
    }
  }
  return Array.from(components.values(), (c) => {
    const cx = c.sumX / c.area;
    const cy = c.sumY / c.area;
    const xx = Math.max(0, c.sumX2 / c.area - cx * cx);
    const yy = Math.max(0, c.sumY2 / c.area - cy * cy);
    const xy = c.sumXY / c.area - cx * cy;
    const trace = xx + yy;
    const root = Math.sqrt(Math.max(0, ((xx - yy) * (xx - yy)) / 4 + xy * xy));
    const majorEigenvalue = Math.max(0.01, trace / 2 + root);
    const minorEigenvalue = Math.max(0.01, trace / 2 - root);
    const ratio = Math.sqrt(majorEigenvalue / minorEigenvalue);
    return { ...c, centroidX: round(cx), centroidY: round(cy), boxWidth: c.maxX - c.minX + 1, boxHeight: c.maxY - c.minY + 1, boxAspectRatio: round(Math.max(c.maxX - c.minX + 1, c.maxY - c.minY + 1) / Math.max(1, Math.min(c.maxX - c.minX + 1, c.maxY - c.minY + 1))), principalAxisRatio: round(ratio), eccentricity: round(Math.sqrt(Math.max(0, 1 - 1 / (ratio * ratio)))) };
  });
}

function estimateComponentColour(component, mask, rgba, width, height) {
  // Sample every k-th component pixel instead of retaining a potentially huge pixel index list.
  // The label matrix has been resolved to root labels. Sampling within the box is enough here only
  // when the caller supplies component._rootLabel; fallback is uniform grid sampling in the box.
  let r = 0; let g = 0; let b = 0; let count = 0;
  const span = Math.max(1, Math.floor(Math.sqrt(component.area / 24)));
  for (let y = component.minY; y <= component.maxY; y += span) {
    for (let x = component.minX; x <= component.maxX; x += span) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const p = i * 4;
      r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2]; count++;
    }
  }
  if (!count) return { r: 0, g: 0, b: 0, intensity: 0, chroma: 0 };
  r /= count; g /= count; b /= count;
  return { r: round(r, 1), g: round(g, 1), b: round(b, 1), intensity: round(0.299 * r + 0.587 * g + 0.114 * b, 1), chroma: round(Math.max(r, g, b) - Math.min(r, g, b), 1) };
}

export function analyzePixels(rgba, width, height, options = {}) {
  assertImageData(rgba, width, height);
  if (width * height > MAX_PROCESSING_PIXELS) throw new RangeError(`Please use an image with at most ${MAX_PROCESSING_PIXELS.toLocaleString()} processing pixels.`);
  const gray = toGrayscale(rgba, width, height);
  const quality = imageQuality(rgba, width, height, gray);
  if (!quality.acceptable) {
    const e = new Error(quality.warnings.join(' '));
    e.code = 'IMAGE_QUALITY_REJECTED'; e.quality = quality;
    throw e;
  }
  const otsu = otsuThreshold(gray);
  if (!otsu.separable || quality.contrast < 5) {
    const e = new Error('The image is too uniform for reliable foreground/background separation. Retake it with distinct grain edges on a plain white background.');
    e.code = 'SEGMENTATION_REJECTED'; e.quality = { ...quality, acceptable: false, severity: 'error', warnings: [...quality.warnings, e.message] };
    throw e;
  }

  // Polarity is estimated from image borders, where a white paper background is expected.
  const border = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 180));
  for (let x = 0; x < width; x += stride) border.push(gray[x], gray[(height - 1) * width + x]);
  for (let y = 0; y < height; y += stride) border.push(gray[y * width], gray[y * width + width - 1]);
  const borderMean = border.reduce((a, b) => a + b, 0) / Math.max(1, border.length);
  const polarity = borderMean >= otsu.threshold ? 'dark' : 'bright';
  let { mask, ratio: foregroundRatio } = buildMask(gray, otsu.threshold, polarity);
  // If polarity estimates almost no object pixels but inverse polarity has a plausible sparse mask, use it and warn.
  let polarityFallback = false;
  if (foregroundRatio < 0.0004 || foregroundRatio > 0.62) {
    const other = buildMask(gray, otsu.threshold, polarity === 'dark' ? 'bright' : 'dark');
    if (other.ratio >= 0.0004 && other.ratio <= 0.62) { mask = other.mask; foregroundRatio = other.ratio; polarityFallback = true; }
  }
  if (foregroundRatio < 0.0004) {
    const e = new Error('No distinct candidate objects were separated from the background. Improve lighting, focus and contrast, then try again.');
    e.code = 'NO_FOREGROUND'; e.quality = { ...quality, acceptable: false, severity: 'error', warnings: [...quality.warnings, e.message] };
    throw e;
  }

  const rawComponents = connectedComponents(mask, width, height, options.connectivity === 4 ? 4 : 8);
  const minArea = Math.max(18, Math.floor(width * height * 0.000018));
  const detections = [];
  let ignored = 0;
  let uncertainCount = 0;
  for (const component of rawComponents) {
    if (component.area < minArea) { ignored++; continue; }
    const colour = estimateComponentColour(component, mask, rgba, width, height);
    const touchesBorder = component.minX === 0 || component.minY === 0 || component.maxX === width - 1 || component.maxY === height - 1;
    const largeMergedCandidate = component.area > width * height * 0.08;
    const isDarkNeutral = colour.intensity < 83 && colour.chroma < 48;
    const looksWheat = colour.r >= 105 && colour.g >= 68 && colour.r > colour.b * 1.08 && colour.b < 175;
    let label = 'uncertain';
    let reason = 'Colour or shape is ambiguous; verify this mark manually.';
    if (touchesBorder) reason = 'Object touches the frame edge and may be clipped.';
    else if (largeMergedCandidate) reason = 'Large connected region may be a shadow, background artefact or merged objects.';
    else if (isDarkNeutral) { label = 'foreign'; reason = 'Low-intensity, low-chroma appearance; this is only a foreign-material candidate.'; }
    else if (looksWheat && component.principalAxisRatio >= 1.42 && component.area >= minArea * 2.4) { label = 'whole'; reason = 'Elongated principal-axis shape and warm colour fit the provisional whole-grain rule.'; }
    else if (looksWheat && component.area >= minArea) { label = 'broken'; reason = 'Warm colour with a smaller or less elongated silhouette fits the provisional fragment rule.'; }
    if (largeMergedCandidate || touchesBorder) label = 'uncertain';
    const detection = {
      id: `D${String(detections.length + 1).padStart(3, '0')}`,
      label, algorithmLabel: label, reason,
      areaPx: component.area,
      box: { x: component.minX, y: component.minY, width: component.boxWidth, height: component.boxHeight },
      centroid: { x: component.centroidX, y: component.centroidY },
      boxAspectRatio: component.boxAspectRatio,
      principalAxisRatio: component.principalAxisRatio,
      eccentricity: component.eccentricity,
      meanRGB: { r: colour.r, g: colour.g, b: colour.b },
      meanLuminance: colour.intensity,
      touchesBorder,
    };
    if (label === 'uncertain') uncertainCount++;
    detections.push(detection);
  }

  const classCounts = countLabels(detections);
  const warnings = [...quality.warnings];
  if (polarityFallback) warnings.push('Foreground polarity needed an automatic fallback; review the overlay closely.');
  if (foregroundRatio > 0.48) warnings.push('A large share of pixels was segmented as foreground; shadows or background texture may be detected.');
  if (detections.some((d) => d.label === 'uncertain')) warnings.push(`${uncertainCount} detection(s) need human review.`);
  if (detections.length > 0 && detections.some((d) => d.areaPx > width * height * 0.02)) warnings.push('Large connected regions may contain touching or overlapping grains; connected-component labelling does not reliably split them.');
  if (!detections.length) warnings.push('No components met the provisional minimum-area rule. Retake with grains clearly separated.');
  return {
    algorithmVersion: ALGORITHM_VERSION,
    width, height,
    threshold: otsu.threshold,
    thresholdDiagnostics: { separable: otsu.separable, minGray: otsu.min, maxGray: otsu.max, polarity, foregroundRatio: round(foregroundRatio, 4) },
    quality: { ...quality, acceptable: detections.length > 0, severity: warnings.length ? 'warning' : 'ok', warnings },
    counts: classCounts,
    ignored,
    detections,
    notes: [
      'Counts are component candidates, not a validated number of grains; touching objects may merge and fragments may split.',
      'Rule thresholds are provisional engineering heuristics and have not been calibrated on a labelled field dataset.',
      'Counts do not represent mass percentages, moisture, toxins, legal grades or procurement deductions.',
    ],
  };
}

export function countLabels(detections) {
  const counts = { whole: 0, broken: 0, foreign: 0, uncertain: 0 };
  for (const d of detections) if (Object.hasOwn(counts, d.label)) counts[d.label]++;
  return { ...counts, reviewedTotal: counts.whole + counts.broken + counts.foreign + counts.uncertain };
}
