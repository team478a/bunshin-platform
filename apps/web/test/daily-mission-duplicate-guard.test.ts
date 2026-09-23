import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);
const qualityPipeline = readFileSync(
  new URL('../src/services/daily-mission-quality-pipeline.ts', import.meta.url),
  'utf8',
);

describe('daily mission duplicate guard', () => {
  it('compares generated content with the participant own recent missions before persistence', () => {
    expect(source).toContain('inspectDailyMissionContent');
    expect(qualityPipeline).toContain("'CONTENT_REJECTED'");
    expect(source).toContain('generated mission is too similar to recent content');
    expect(source).toContain('from: daysBefore(input.missionDate, 28)');
    expect(source).toContain('existing daily mission is not safe to deliver as a new post');
    expect(source.indexOf('finalNoveltyIssue')).toBeLessThan(source.indexOf("stage = 'persist'"));
    expect(qualityPipeline).toContain('attempt < 3');
    expect(source.indexOf('generateQualityCheckedMissionContent')).toBeLessThan(
      source.indexOf("stage = 'persist'"),
    );
  });
});
