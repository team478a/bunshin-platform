import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('daily mission brief runtime boundary', () => {
  it('owns planner provider wiring, quota execution, and usage recording', () => {
    const runtime = read('src/services/daily-mission-brief-runtime.ts');

    expect(runtime).toContain('new OpenAIDailyMissionPlanner({');
    expect(runtime).toContain("input.generateWithQuota('daily-brief'");
    expect(runtime).toContain("input.recordUsage('daily-brief', 'DAILY_MISSION_PLANNER', brief)");
  });

  it('keeps the generation orchestrator dependent on the brief runtime contract', () => {
    const generation = read('src/services/daily-mission-generation.ts');

    expect(generation).toContain('await runDailyMissionBriefGeneration({');
    expect(generation).toContain('plannerInput: {');
    expect(generation).not.toContain('new OpenAIDailyMissionPlanner');
    expect(generation).not.toContain('new GenerateDailyMissionBrief');
  });
});
