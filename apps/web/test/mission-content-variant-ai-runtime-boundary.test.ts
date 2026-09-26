import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generationSource = readFileSync(
  new URL('../src/services/mission-content-variant-generation.ts', import.meta.url),
  'utf8',
);
const runtimeSource = readFileSync(
  new URL('../src/services/mission-content-variant-ai-runtime.ts', import.meta.url),
  'utf8',
);

describe('mission content variant AI runtime boundary', () => {
  it('keeps provider execution outside the orchestration service', () => {
    expect(generationSource).toContain('generateMissionContentVariantWithAi({');
    expect(generationSource).not.toContain('new OpenAIMissionContentGenerator');
    expect(generationSource).not.toContain('new OpenAIMissionQualityChecker');
    expect(generationSource).not.toContain('withOrganizationAiGenerationQuota');
  });

  it('keeps quota, usage, terminology and quality enforcement together', () => {
    expect(runtimeSource).toContain('withOrganizationAiGenerationQuota');
    expect(runtimeSource).toContain('recordAiUsageSafely');
    expect(runtimeSource).toContain('applyServiceContentTerminology');
    expect(runtimeSource).toContain("'CONTENT_REJECTED'");
    expect(runtimeSource).toContain("'variant-content:1'");
    expect(runtimeSource).not.toContain("'variant-content:2'");
  });
});
