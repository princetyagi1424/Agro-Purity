import { describe, it, expect } from 'vitest';
import { buildSeedDecision } from '../lib/decision/seedDecision';
import type { ImageQualityReport } from '../types';

const ok: ImageQualityReport = {
  ok: true, width: 640, height: 480, meanLuminance: 180, contrast: 40, issues: [],
};

describe('seedDecision', () => {
  it('blocks non-wheat', () => {
    expect(buildSeedDecision({
      grainType: 'rice',
      counts: { whole: 10, broken: 0, foreign: 0, uncertain: 0, noise: 0, ignored: 0 },
      detections: [], quality: ok,
    }).code).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('no obvious defect when mostly whole', () => {
    const d = buildSeedDecision({
      grainType: 'wheat',
      counts: { whole: 12, broken: 0, foreign: 0, uncertain: 1, noise: 0, ignored: 0 },
      detections: [], quality: ok,
    });
    expect(d.code).toBe('NO_OBVIOUS_VISIBLE_DEFECT');
    expect(d.nextSteps.some((s) => /germination/i.test(s))).toBe(true);
  });

  it('serious concern on high foreign ratio', () => {
    expect(buildSeedDecision({
      grainType: 'wheat',
      counts: { whole: 8, broken: 0, foreign: 4, uncertain: 0, noise: 0, ignored: 0 },
      detections: [], quality: ok,
    }).code).toBe('POSSIBLE_SERIOUS_CONCERN');
  });
});
