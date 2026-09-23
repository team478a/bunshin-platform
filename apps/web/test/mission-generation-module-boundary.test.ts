import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const plannerSource = readFileSync(
  new URL('../../../packages/capability-social/src/mission-generation.ts', import.meta.url),
  'utf8',
);
const contentSource = readFileSync(
  new URL('../../../packages/capability-social/src/mission-content-generation.ts', import.meta.url),
  'utf8',
);
const qualitySource = readFileSync(
  new URL('../../../packages/capability-social/src/mission-quality.ts', import.meta.url),
  'utf8',
);

describe('mission generation module boundaries', () => {
  it('keeps daily planning in the mission generation entry point', () => {
    expect(plannerSource).toContain('export class GenerateDailyMissionBrief');
    expect(plannerSource).toContain('export function selectDailyMissionFormat');
    expect(plannerSource).not.toContain('export class GenerateMissionContent');
    expect(plannerSource).not.toContain('export class CheckMissionQuality');
  });

  it('isolates content generation from quality validation', () => {
    expect(contentSource).toContain('export class GenerateMissionContent');
    expect(contentSource).toContain('validatePlatformContent');
    expect(contentSource).not.toContain('deterministicImageCarouselIssues');
    expect(qualitySource).toContain('export class CheckMissionQuality');
    expect(qualitySource).toContain('deterministicImageCarouselIssues');
  });

  it('preserves the existing mission generation export surface', () => {
    expect(plannerSource).toContain("export * from './mission-content-generation'");
    expect(plannerSource).toContain("export * from './mission-quality'");
  });
});
