import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generation = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);
const planningContext = readFileSync(
  new URL('../src/services/daily-mission-planning-context.ts', import.meta.url),
  'utf8',
);

describe('daily mission planning context boundary', () => {
  it('keeps service, campaign and memory isolation checks in the context loader', () => {
    expect(planningContext).toContain('campaign.productPack.groupId !== input.scope.groupId');
    expect(planningContext).toContain('GroupFeatureEntitlementService');
    expect(planningContext).toContain("'GROUP.CAMPAIGN'");
    expect(planningContext).toContain('PrismaOwnerBunshinMemoryRepository');
    expect(planningContext).toContain('!input.allowServiceOwnerMemories');
    expect(planningContext).toContain('loadServiceGenerationKnowledge');
  });

  it('checks an existing mission before loading context and claims generation afterward', () => {
    expect(generation.indexOf('if (existing)')).toBeLessThan(
      generation.indexOf('} = await loadDailyMissionPlanningContext'),
    );
    expect(generation.indexOf('} = await loadDailyMissionPlanningContext')).toBeLessThan(
      generation.indexOf('const claim = await generations.claim'),
    );
  });

  it('requires an active profile, approved strategy and confirmed item for the target date', () => {
    expect(planningContext).toContain('active social profile not found');
    expect(planningContext).toContain('approved strategy is required');
    expect(planningContext).toContain('confirmed weekly plan item not found for date');
  });
});
