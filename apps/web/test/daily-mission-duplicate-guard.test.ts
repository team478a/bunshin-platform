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
const contentRuntime = readFileSync(
  new URL('../src/services/daily-mission-content-runtime.ts', import.meta.url),
  'utf8',
);
const contentFinalization = readFileSync(
  new URL('../src/services/daily-mission-content-finalization.ts', import.meta.url),
  'utf8',
);

describe('daily mission duplicate guard', () => {
  it('compares generated content with the participant own recent missions before persistence', () => {
    expect(source).toContain('inspectDailyMissionContent');
    expect(qualityPipeline).toContain("'CONTENT_REJECTED'");
    expect(contentFinalization).toContain('generated mission is too similar to recent content');
    expect(source).toContain('from: daysBefore(input.missionDate, 28)');
    expect(source).toContain('existing daily mission is not safe to deliver as a new post');
    expect(contentFinalization).toContain('finalNoveltyIssue');
    expect(qualityPipeline).toContain('attempt < 3');
    expect(contentRuntime).toContain('generateQualityCheckedMissionContent');
    expect(source.indexOf('runDailyMissionContentGeneration')).toBeLessThan(
      source.indexOf("stage = 'persist'"),
    );
  });
});
