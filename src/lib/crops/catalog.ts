export type CropSupport = 'supported' | 'experimental' | 'unsupported';

export interface CropInfo {
  id: string;
  labelEn: string;
  support: CropSupport;
  notes: string;
  trainExamples?: number;
  evaluated?: boolean;
}

export const CROP_CATALOG: CropInfo[] = [
  {
    id: 'wheat',
    labelEn: 'Wheat',
    support: 'supported',
    notes:
      'On-device classical multi-object screening is calibrated for wheat on plain white backgrounds. A separate offline MobileNet was trained on single-kernel research images (held-out ~77% accuracy on that dataset only) — not the multi-grain browser path.',
    trainExamples: 3500,
    evaluated: true,
  },
  {
    id: 'rice',
    labelEn: 'Rice',
    support: 'unsupported',
    notes: 'No validated rice multi-object model is loaded. Do not treat labels as rice grading.',
  },
  {
    id: 'pulses',
    labelEn: 'Pulses',
    support: 'unsupported',
    notes: 'No validated pulse-specific screening in this app.',
  },
  {
    id: 'other',
    labelEn: 'Other crops (maize, mustard, …)',
    support: 'unsupported',
    notes: 'Listed for honesty only. Use laboratory methods or wait for crop-specific data and evaluation.',
  },
];

export function getCropInfo(id: string): CropInfo {
  return CROP_CATALOG.find((c) => c.id === id) ?? CROP_CATALOG.find((c) => c.id === 'other')!;
}
