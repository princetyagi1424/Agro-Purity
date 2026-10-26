import { describe, it, expect } from 'vitest';
import { buildInspectionCsv } from '../lib/exportReport';
import type { ClassificationCounts, ComponentFeatures } from '../types';

const counts: ClassificationCounts = {
  whole: 3, broken: 1, foreign: 0, uncertain: 1, noise: 0, ignored: 0,
};

const detections: ComponentFeatures[] = [
  {
    id: 1, area: 100, bbox: { x: 0, y: 0, width: 10, height: 10 },
    aspectRatio: 1.2, centroid: { x: 5, y: 5 },
    meanRgb: { r: 100, g: 90, b: 50 }, meanLuminance: 80,
    label: 'whole', labelReason: 'test',
  },
];

describe('buildInspectionCsv', () => {
  it('includes summary and detection rows', () => {
    const csv = buildInspectionCsv({
      id: 'abc', createdAt: '2026-01-01T00:00:00.000Z', grainType: 'wheat',
      inputSource: 'upload', algorithmVersion: 'v1', synthetic: false,
      counts, detections, disclaimer: 'test disclaimer',
    });
    expect(csv).toContain('summary');
    expect(csv).toContain('abc');
    expect(csv).toContain('whole');
    expect(csv.split('\n').length).toBeGreaterThan(3);
  });

  it('marks synthetic flag', () => {
    const csv = buildInspectionCsv({
      createdAt: '2026-01-01T00:00:00.000Z', grainType: 'wheat',
      inputSource: 'demo', algorithmVersion: 'v1', synthetic: true,
      counts, detections: [], disclaimer: 'd',
    });
    expect(csv).toContain('true');
  });
});
