import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('daily mission AI runtime boundary', () => {
  it('owns runtime configuration, quota reservation, and usage audit details', () => {
    const runtime = read('src/services/daily-mission-ai-runtime.ts');

    expect(runtime).toContain('reserveOpenAiRuntimeConfiguration(');
    expect(runtime).toContain('withOrganizationAiGenerationQuota({');
    expect(runtime).toContain("status: 'SUCCESS'");
    expect(runtime).toContain('estimatedCostUsdMicros: runtime.requestCostUsdMicros || null');
    expect(runtime).toContain('pricingVersion: runtime.requestCostUsdMicros');
    expect(runtime).toContain("taskType: 'DAILY_MISSION_PIPELINE'");
    expect(runtime).toContain("status: 'FAILED'");
    expect(runtime).toContain(':daily-pipeline-failure`');
    expect(runtime).toContain("'category' in cause");
  });

  it('keeps generation orchestration dependent on the runtime contract', () => {
    const generation = read('src/services/daily-mission-generation.ts');
    const briefRuntime = read('src/services/daily-mission-brief-runtime.ts');

    expect(generation).toContain('createDailyMissionAiRuntime({');
    expect(briefRuntime).toContain("taskType: 'DAILY_MISSION_PLANNER'");
    expect(generation).toContain('executeAiStep,');
    expect(generation).toContain('await recordDailyMissionPipelineFailure({');
    expect(generation).toContain('errorCategory: dailyMissionErrorCategory(error)');
    expect(generation).not.toContain("from '../observability/ai-usage'");
    expect(generation).not.toContain("from '../organization-ai-generation-quota'");
  });
});
