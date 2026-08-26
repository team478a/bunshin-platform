import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND_ICON_PATH, BRAND_LOGO_PATH, BRAND_NAME, BrandMark } from '../app/ui/brand-mark';

describe('ワタシワークスのブランド表示', () => {
  it('正式名称と画像を公開する', () => {
    expect(BRAND_NAME).toBe('ワタシワークス');
    expect(BRAND_LOGO_PATH).toBe('/watashiworks-logo.jpg');
    expect(BRAND_ICON_PATH).toBe('/watashiworks-icon.jpg');
    expect(
      statSync(new URL('../public/watashiworks-logo.jpg', import.meta.url)).size,
    ).toBeGreaterThan(0);
    expect(
      statSync(new URL('../public/watashiworks-icon.jpg', import.meta.url)).size,
    ).toBeGreaterThan(0);
  });

  it('読み上げ時も正式名称を伝える', () => {
    expect(BrandMark({}).props['aria-label']).toBe(BRAND_NAME);
  });
});
