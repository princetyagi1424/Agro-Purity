import { describe, it, expect } from 'vitest';
import { en } from '../i18n/en';
import { hi } from '../i18n/hi';
import { ta } from '../i18n/ta';
import { pa } from '../i18n/pa';
import { haryanvi } from '../i18n/haryanvi';
import { mr } from '../i18n/mr';
import { bho } from '../i18n/bho';

const ALL = { en, hi, ta, pa, haryanvi, mr, bho } as const;

describe('i18n dictionaries (7 languages)', () => {
  it('has matching keys across all locales', () => {
    const base = Object.keys(en).sort();
    for (const [name, dict] of Object.entries(ALL)) {
      expect(Object.keys(dict).sort(), name).toEqual(base);
    }
  });

  it('has no empty strings', () => {
    for (const [name, dict] of Object.entries(ALL)) {
      for (const [k, v] of Object.entries(dict)) {
        expect(v.length, `${name}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('uses native scripts for nav labels', () => {
    expect(hi['nav.inspect']).toMatch(/[\u0900-\u097F]/);
    expect(ta['nav.inspect']).toMatch(/[\u0B80-\u0BFF]/);
    expect(pa['nav.inspect']).toMatch(/[\u0A00-\u0A7F]/);
    expect(haryanvi['nav.inspect']).toMatch(/[\u0900-\u097F]/);
    expect(mr['nav.inspect']).toMatch(/[\u0900-\u097F]/);
    expect(bho['nav.inspect']).toMatch(/[\u0900-\u097F]/);
  });

  it('exposes seven language option labels', () => {
    for (const dict of Object.values(ALL)) {
      expect(dict['lang.pa']).toBeTruthy();
      expect(dict['lang.haryanvi']).toBeTruthy();
      expect(dict['lang.mr']).toBeTruthy();
      expect(dict['lang.bho']).toBeTruthy();
    }
  });

  it('Bhojpuri uses distinctive Bihari forms', () => {
    expect(bho['home.start']).toMatch(/करीं|करब/);
    expect(bho['lang.bho']).toBe('भोजपुरी');
  });
});
