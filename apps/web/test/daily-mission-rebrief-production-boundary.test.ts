import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('daily mission rebrief production boundary', () => {
  it('connects the production generator through the bounded orchestration seam', () => {
    const generation = read('src/services/daily-mission-generation.ts');

    expect(generation).toContain('runDailyMissionDecisionContentOrchestration({');
    expect(generation).toContain('runDailyMissionRebriefGeneration({');
    expect(generation).toContain(
      'decisionBoundary: decisionPreparation.context ? decisionPreparation.boundary : null',
    );
    expect(generation).toContain('decisionRevision: revision');
    expect(generation).not.toContain('new OpenAIDailyMissionRebriefPlanner');
  });

  it('keeps rebrief provider, quota, Usage and finalize inside the dedicated runtime', () => {
    const runtime = read('src/services/daily-mission-rebrief-runtime.ts');

    expect(runtime).toContain('prepareSocialDecisionRebrief({');
    expect(runtime).toContain('new OpenAIDailyMissionRebriefPlanner({');
    expect(runtime).toContain("generateWithQuota('decision-rebrief:1'");
    expect(runtime).toContain(
      "recordUsage('decision-rebrief:1', 'DAILY_MISSION_REBRIEF', generated)",
    );
    expect(runtime).toContain('finalizeSocialDecisionRebrief({');
    expect(runtime).toContain("stage: 'REVISED_BRIEF'");
  });

  it('persists revision metadata only through the existing generation snapshot path', () => {
    const resultPersistence = read('src/services/daily-mission-result-persistence.ts');
    const persistence = read('src/services/daily-mission-persistence.ts');

    expect(resultPersistence).toContain('revision: input.decisionRevision');
    expect(persistence).toContain('generationContext: {');
    expect(persistence).toContain('payload: buildDailyMissionGenerationContext(input.evidence)');
  });
});
