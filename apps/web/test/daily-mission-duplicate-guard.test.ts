import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);

describe('daily mission duplicate guard', () => {
  it('compares generated content with the participant own recent missions before persistence', () => {
    expect(source).toContain('recentMissions.find');
    expect(source).toContain("'CONTENT_REJECTED'");
    expect(source).toContain('generated mission is too similar to recent content');
    expect(source).toContain('simhashSimilarityBasisPoints');
    expect(source.indexOf('recentMissions.find')).toBeLessThan(source.indexOf("stage = 'persist'"));
  });
});
