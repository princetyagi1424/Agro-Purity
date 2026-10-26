import { describe, it, expect } from 'vitest';
import { en } from '../i18n/en';
import { hi } from '../i18n/hi';
import { ta } from '../i18n/ta';

describe('i18n dictionaries', () => {
  it('has matching keys in en, hi, ta', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ta).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(en)) expect(v.length, k).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(hi)) expect(v.length, k).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(ta)) expect(v.length, k).toBeGreaterThan(0);
  });

  it('uses native scripts for nav labels', () => {
    expect(hi['nav.inspect']).toMatch(/[\u0900-\u097F]/);
    expect(ta['nav.inspect']).toMatch(/[\u0B80-\u0BFF]/);
  });

  it('includes camera recovery keys', () => {
    for (const k of ['inspect.tryAgain', 'inspect.uploadInstead', 'inspect.secureContext', 'inspect.requestingCamera'] as const) {
      expect(en[k]).toBeTruthy();
      expect(hi[k]).toBeTruthy();
      expect(ta[k]).toBeTruthy();
    }
  });
});
