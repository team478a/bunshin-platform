import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readHttpModule = (name: string) => readFileSync(`src/http/${name}.ts`, 'utf8');

describe('service daily mission HTTP module boundaries', () => {
  it('keeps the existing route import module as a compatibility barrel', () => {
    const source = readHttpModule('service-daily-missions');

    expect(source).toContain("from './service-daily-mission-generation'");
    expect(source).toContain("from './service-daily-mission-variants'");
    expect(source).toContain("from './service-daily-mission-engagement'");
    expect(source).toContain("from './service-daily-mission-outcomes'");
    expect(source).not.toContain("from '@bunshin/database'");
  });

  it('keeps content generation separate from engagement and outcomes', () => {
    const generation = readHttpModule('service-daily-mission-generation');
    const variants = readHttpModule('service-daily-mission-variants');

    expect(generation).toContain('createDailyMissionGenerationService');
    expect(generation).not.toContain('RecordMissionFeedback');
    expect(variants).toContain('generatePointFundedMissionContentVariant');
    expect(variants).not.toContain('RecordManualPost');
  });

  it('keeps feedback and business results within the outcome boundary', () => {
    const engagement = readHttpModule('service-daily-mission-engagement');
    const outcomes = readHttpModule('service-daily-mission-outcomes');

    expect(engagement).toContain('RecordMissionActivity');
    expect(engagement).not.toContain('writeBusinessOutcomes');
    expect(outcomes).toContain('RecordMissionFeedback');
    expect(outcomes).toContain('writeBusinessOutcomes');
  });
});
