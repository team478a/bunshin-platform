import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('daily mission AI runtime boundary', () => {
  it('owns runtime configuration, quota reservation, and usage audit details', () => {
    const runtime = read('src/services/daily-mission-ai-runtime.ts');

    expect(runtime).toContain('resolveOpenAiRuntimeConfiguration()');
    expect(runtime).toContain('withOrganizationAiGenerationQuota({');
    expect(runtime).toContain("status: 'SUCCESS'");
    expect(runtime).toContain("taskType: 'DAILY_MISSION_PIPELINE'");
    expect(runtime).toContain("status: 'FAILED'");
    expect(runtime).toContain(':daily-pipeline-failure`');
    expect(runtime).toContain("'category' in cause");
  });

  it('keeps generation orchestration dependent on the runtime contract', () => {
    const generation = read('src/services/daily-mission-generation.ts');

    expect(generation).toContain('await createDailyMissionAiRuntime({');
    expect(generation).toContain(
      "await recordUsage('daily-brief', 'DAILY_MISSION_PLANNER', brief)",
    );
    expect(generation).toContain('generateWithQuota,');
    expect(generation).toContain('recordUsage,');
    expect(generation).toContain('await recordDailyMissionPipelineFailure({');
    expect(generation).toContain('errorCategory: dailyMissionErrorCategory(error)');
    expect(generation).not.toContain("from '../observability/ai-usage'");
    expect(generation).not.toContain("from '../organization-ai-generation-quota'");
  });
});
