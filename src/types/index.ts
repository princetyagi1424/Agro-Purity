/** AgroPurity type definitions */

export type GrainType = 'wheat' | 'rice' | 'pulses' | 'other';

export type DetectionLabel =
  | 'whole'
  | 'broken'
  | 'foreign'
  | 'uncertain'
  | 'noise'
  | 'ignored';

export type InputSource = 'camera' | 'upload' | 'demo';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComponentFeatures {
  id: number;
  area: number;
  bbox: BoundingBox;
  aspectRatio: number;
  centroid: { x: number; y: number };
  meanRgb: { r: number; g: number; b: number };
  meanLuminance: number;
  label: DetectionLabel;
  labelReason: string;
  manuallyAdjusted?: boolean;
  originalLabel?: DetectionLabel;
}

export interface ImageQualityIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  recommendation: string;
}

export interface ImageQualityReport {
  ok: boolean;
  width: number;
  height: number;
  meanLuminance: number;
  contrast: number;
  issues: ImageQualityIssue[];
}

export interface ProcessingDiagnostics {
  threshold: number;
  otsuHistogramPeak?: number;
  maxBetweenClassVariance?: number;
  componentCountRaw: number;
  componentCountKept: number;
  processingMs: number;
  algorithmVersion: string;
  resizedWidth: number;
  resizedHeight: number;
  polarity: 'dark-on-light' | 'light-on-dark' | 'unknown';
}

export interface ClassificationCounts {
  whole: number;
  broken: number;
  foreign: number;
  uncertain: number;
  noise: number;
  ignored: number;
}

export interface InspectionResult {
  detections: ComponentFeatures[];
  counts: ClassificationCounts;
  quality: ImageQualityReport;
  diagnostics: ProcessingDiagnostics;
  annotatedImageDataUrl?: string;
  originalImageDataUrl?: string;
}

export interface InspectionRecord {
  id: string;
  createdAt: string;
  grainType: GrainType;
  inputSource: InputSource;
  algorithmVersion: string;
  counts: ClassificationCounts;
  adjustedCounts?: ClassificationCounts;
  qualityWarnings: string[];
  diagnostics: ProcessingDiagnostics;
  originalImageKey?: string;
  annotatedImageKey?: string;
  detections: ComponentFeatures[];
  notes?: string;
  disclaimer: string;
}

export interface ClassifierConfig {
  minArea: number;
  maxArea: number;
  wholeAspectMin: number;
  wholeAspectMax: number;
  brokenAspectMax: number;
  foreignLuminanceMax: number;
  noiseAreaMax: number;
}

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  minArea: 40,
  maxArea: 25000,
  wholeAspectMin: 0.45,
  wholeAspectMax: 2.2,
  brokenAspectMax: 0.55,
  foreignLuminanceMax: 85,
  noiseAreaMax: 35,
};

export const ALGORITHM_VERSION = '1.2.0-prototype';
