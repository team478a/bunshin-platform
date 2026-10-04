import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const loader = readFileSync(
  new URL('../src/services/service-generation-knowledge-loader.ts', import.meta.url),
  'utf8',
);
const generation = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);

describe('service generation decision context boundary', () => {
  it('targets the configured business daily runtime without a service slug or OEM name', () => {
    expect(loader).toContain('serviceSettings.businessProfileEnabled');
    expect(loader).toContain('serviceSettings.dailyIdeaDelivery.enabled');
    expect(loader).not.toMatch(/slug\s*===\s*['"][^'"]+['"]/);
    expect(loader).not.toContain('千ノ国');
  });

  it('uses current service membership and legal consent evidence for the safety boundary', () => {
    expect(loader).toContain('PrismaServiceParticipationRepository');
    expect(loader).toContain('findLegalConsentView');
    expect(loader).toContain('acceptedLegalDocumentIds.has(id)');
    expect(loader).toContain("? ('PASSED' as const)");
    expect(loader).toContain(": ('UNKNOWN' as const)");
  });

  it('reads performance Goal only from the source mission snapshot', () => {
    expect(loader).toContain('generationContext: { select: { payload: true } }');
    expect(loader).toContain(
      'readSnapshotStrategyGoal(post.dailyMission.generationContext?.payload)',
    );
    expect(loader).toContain('goalAtObservation');
    expect(loader).not.toContain('strategyGoal: post.manualMetrics');
  });

  it('prepares the decision context immediately before the existing Brief runtime', () => {
    const prepare = generation.indexOf('prepareDailyMissionDecisionPlannerInput');
    const brief = generation.indexOf('runDailyMissionBriefGeneration({', prepare);
    expect(prepare).toBeGreaterThan(-1);
    expect(brief).toBeGreaterThan(prepare);
    expect(generation.slice(prepare, brief)).not.toContain('runDailyMissionContentGeneration');
  });
});
