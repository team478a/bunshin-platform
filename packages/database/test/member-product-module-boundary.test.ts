import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

describe('member product repository module boundary', () => {
  it('keeps the existing public entry point while separating repository responsibilities', () => {
    const entry = source('member-product.ts');

    expect(entry).toContain("from './member-product-profile'");
    expect(entry).toContain("from './member-product-activity'");
    expect(entry).not.toContain('class PrismaMemberProductProfileRepository');
    expect(entry).not.toContain('class PrismaMemberProductActivityRepository');
  });

  it('keeps profile and activity persistence in focused modules', () => {
    const profile = source('member-product-profile.ts');
    const activity = source('member-product-activity.ts');

    expect(profile).toContain('class PrismaMemberProductProfileRepository');
    expect(profile).not.toContain('class PrismaMemberProductActivityRepository');
    expect(activity).toContain('class PrismaMemberProductActivityRepository');
    expect(activity).not.toContain('class PrismaMemberProductProfileRepository');
  });
});
