import { describe, expect, it } from 'vitest';
import {
  defaultFortuneAppearance,
  fortuneAppearanceSchema,
  fortuneContrast,
  fortuneReadableText,
  resolveFortuneAppearanceColors,
  resolveFortuneSummoningMode,
} from '../src/fortune/appearance';

describe('Fortune appearance', () => {
  it('maps missing and legacy settings and accepts the lightweight mode', () => {
    expect(resolveFortuneSummoningMode(undefined)).toBe('off');
    expect(resolveFortuneSummoningMode({ ...defaultFortuneAppearance, summoning: false })).toBe(
      'off',
    );
    expect(resolveFortuneSummoningMode({ ...defaultFortuneAppearance, summoning: true })).toBe(
      'cinematic',
    );
    const standard = fortuneAppearanceSchema.parse({
      ...defaultFortuneAppearance,
      summoning: 'standard',
    });
    expect(resolveFortuneSummoningMode(standard)).toBe('standard');
    expect(fortuneAppearanceSchema.safeParse({ ...standard, summoning: 'loud' }).success).toBe(
      false,
    );
  });

  it('applies individual choices ahead of optional site brand and preset colors', () => {
    const brand = { logoUrl: null, primaryColor: '#000088', secondaryColor: '#ffee55' };
    const settings = {
      ...defaultFortuneAppearance,
      palette: 'night' as const,
      useBrandColors: true,
      action: '#770022',
    };
    expect(resolveFortuneAppearanceColors(settings, brand)).toMatchObject({
      background: '#17162b',
      action: '#770022',
      accent: '#ffee55',
    });
    expect(
      resolveFortuneAppearanceColors({ ...settings, useBrandColors: false }, brand).accent,
    ).toBe('#d2ac68');
  });

  it('preserves readable presets and corrects custom foregrounds for each surface', () => {
    expect(fortuneReadableText('#211d41', '#f9f5ec')).toBe('#211d41');
    expect(fortuneReadableText('#ffffff', '#fffdf9')).toBe('#000000');
    expect(fortuneReadableText('#000000', '#17162b')).toBe('#ffffff');
    for (const background of ['#777777', '#28234f', '#ead5a9']) {
      expect(
        fortuneContrast(fortuneReadableText('#777777', background), background),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('rejects arbitrary CSS and unknown visual options', () => {
    expect(
      fortuneAppearanceSchema.safeParse({
        ...defaultFortuneAppearance,
        background: 'url(https://invalid.example/background)',
      }).success,
    ).toBe(false);
    expect(
      fortuneAppearanceSchema.safeParse({
        ...defaultFortuneAppearance,
        style: 'position: fixed',
      }).success,
    ).toBe(false);
  });
});
