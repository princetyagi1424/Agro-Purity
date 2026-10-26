import { describe, it, expect } from 'vitest';
import { DEFAULT_CLASSIFIER_CONFIG } from '../types';

/** Mirrors pipeline classify foreign rules for regression without canvas. */
function isForeignCandidate(lum: number, r: number, g: number, b: number): boolean {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const isDark = lum < DEFAULT_CLASSIFIER_CONFIG.foreignLuminanceMax;
  const isDarkNeutral = lum < 110 && chroma < 28;
  return isDark || isDarkNeutral;
}

describe('foreign-material heuristic', () => {
  it('flags dark stone-like RGB as foreign', () => {
    expect(isForeignCandidate(26, 26, 26, 26)).toBe(true);
    expect(isForeignCandidate(58, 58, 58, 58)).toBe(true);
  });

  it('does not flag typical wheat-like golden tones as foreign', () => {
    expect(isForeignCandidate(164, 196, 163, 90)).toBe(false);
  });

  it('flags low-chroma mid-dark debris', () => {
    expect(isForeignCandidate(95, 90, 92, 88)).toBe(true);
  });
});
