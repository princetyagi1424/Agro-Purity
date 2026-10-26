/**
 * Transparent farmer decision rules over visual screening outputs.
 * Never invents lab measurements.
 */
import type { ClassificationCounts, ComponentFeatures, ImageQualityReport } from '../../types';

export type DecisionCode =
  | 'NO_OBVIOUS_VISIBLE_DEFECT'
  | 'VISIBLE_DAMAGE_OR_FOREIGN'
  | 'POSSIBLE_SERIOUS_CONCERN'
  | 'INSUFFICIENT_EVIDENCE'
  | 'LABORATORY_RESULT_REQUIRED';

export interface DecisionResult {
  code: DecisionCode;
  title: string;
  summary: string;
  nextSteps: string[];
  parameters: Array<{
    name: string;
    status: 'observed' | 'unverified' | 'requires_lab' | 'not_applicable';
    detail: string;
  }>;
  severity: 'info' | 'caution' | 'warning' | 'blocked';
}

export interface DecisionInput {
  counts: ClassificationCounts;
  detections: ComponentFeatures[];
  quality: ImageQualityReport;
  grainType: string;
  imageCount?: number;
}

const labParams = (): DecisionResult['parameters'] => [
  {
    name: 'Visible surface appearance',
    status: 'observed',
    detail: 'From on-device visual screening of the uploaded image(s).',
  },
  {
    name: 'Germination / viability',
    status: 'requires_lab',
    detail: 'Cannot be confirmed from an RGB photo. Use a standard germination test before sowing reliance.',
  },
  {
    name: 'Moisture content',
    status: 'requires_lab',
    detail: 'Requires a moisture meter or laboratory measurement.',
  },
  {
    name: 'Seed-borne disease / internal infection',
    status: 'requires_lab',
    detail: 'Visual appearance is not a confirmed pathogen diagnosis.',
  },
  {
    name: 'Varietal / genetic purity',
    status: 'unverified',
    detail: 'Not measured here. Check certified seed documentation where required.',
  },
];

export function buildSeedDecision(input: DecisionInput): DecisionResult {
  const { counts, quality, grainType } = input;
  const total = counts.whole + counts.broken + counts.foreign + counts.uncertain;
  const imageCount = input.imageCount ?? 1;
  const params = labParams();

  if (grainType !== 'wheat') {
    return {
      code: 'INSUFFICIENT_EVIDENCE',
      title: 'Unable to determine from these images',
      summary: 'Calibrated visual analysis currently supports wheat only.',
      nextSteps: ['Use wheat samples for this tool, or obtain crop-specific laboratory tests.'],
      parameters: params.map((p) =>
        p.name.startsWith('Visible')
          ? { ...p, status: 'not_applicable' as const, detail: 'Unsupported crop.' }
          : p
      ),
      severity: 'blocked',
    };
  }

  if (!quality.ok && total === 0) {
    return {
      code: 'INSUFFICIENT_EVIDENCE',
      title: 'Unable to determine from these images',
      summary: 'Image quality or scene content was not suitable for reliable visual screening.',
      nextSteps: [
        'Retake on plain white paper with a thin, non-touching grain layer.',
        'Use even light; avoid glare and hard shadows.',
        'Keep grains in focus.',
      ],
      parameters: params.map((p) =>
        p.name.startsWith('Visible')
          ? { ...p, status: 'unverified' as const, detail: 'No reliable detections.' }
          : p
      ),
      severity: 'blocked',
    };
  }

  const foreignRatio = total > 0 ? counts.foreign / total : 0;
  const brokenRatio = total > 0 ? counts.broken / total : 0;
  const uncertainRatio = total > 0 ? counts.uncertain / total : 0;

  if (foreignRatio >= 0.15 || (counts.foreign >= 3 && foreignRatio >= 0.08)) {
    return {
      code: 'POSSIBLE_SERIOUS_CONCERN',
      title: 'Possible serious quality concern (visual)',
      summary: `Notable share of regions labelled foreign (${counts.foreign} of ${total}). Appearance-only evidence — not a lab result.`,
      nextSteps: [
        'Segregate this sample from seed intended for sowing until reviewed.',
        'Clean/sort and re-inspect under better conditions.',
        'Seek extension or laboratory assessment if contamination is suspected.',
        'Do not discard an entire lot based only on one photo.',
      ],
      parameters: params,
      severity: 'warning',
    };
  }

  if (brokenRatio >= 0.2 || counts.broken >= 5) {
    return {
      code: 'VISIBLE_DAMAGE_OR_FOREIGN',
      title: 'Visible concerns detected; further inspection recommended',
      summary: `Broken ${counts.broken}, foreign ${counts.foreign} of ${total} regions (provisional).`,
      nextSteps: [
        'Consider sorting broken material from sowing seed.',
        'Repeat inspection after sorting.',
        'Confirm germination with a standard test before large-scale sowing.',
      ],
      parameters: params,
      severity: 'caution',
    };
  }

  if (uncertainRatio >= 0.35 || total < 3) {
    return {
      code: 'INSUFFICIENT_EVIDENCE',
      title: 'Unable to determine from these images',
      summary:
        total < 3
          ? 'Too few objects detected for a stable visual summary.'
          : 'Many detections were uncertain.',
      nextSteps: [
        'Capture clearer images of a representative sample.',
        'Spread grains; improve lighting and focus.',
        'Use laboratory tests when sowing quality must be confirmed.',
      ],
      parameters: params,
      severity: 'blocked',
    };
  }

  if (counts.foreign > 0 || counts.broken > 0) {
    return {
      code: 'VISIBLE_DAMAGE_OR_FOREIGN',
      title: 'Visible concerns detected; further inspection recommended',
      summary: `Broken ${counts.broken}, foreign ${counts.foreign} of ${total} from ${imageCount} image(s).`,
      nextSteps: [
        'Review annotations; correct mislabels if needed.',
        'Clean visible debris and re-inspect if foreign material is confirmed by eye.',
        'Run a germination test before relying on the lot for sowing.',
      ],
      parameters: params,
      severity: 'caution',
    };
  }

  return {
    code: 'NO_OBVIOUS_VISIBLE_DEFECT',
    title: 'No obvious visible problem detected',
    summary: `Mostly whole regions (${counts.whole}). This does not prove the lot is suitable for sowing.`,
    nextSteps: [
      'Conduct a germination test on a representative sample before sowing reliance.',
      'Measure moisture if storage safety matters.',
      'Keep certified documentation when varietal purity is required.',
      'This remains preliminary visual screening only.',
    ],
    parameters: params,
    severity: 'info',
  };
}
