import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generation = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);
const finalization = readFileSync(
  new URL('../src/services/daily-mission-content-finalization.ts', import.meta.url),
  'utf8',
);
const persistence = readFileSync(
  new URL('../src/services/daily-mission-persistence.ts', import.meta.url),
  'utf8',
);

describe('daily mission content finalization boundary', () => {
  it('keeps tracking links, terminology, campaign safety and final novelty in one gate', () => {
    expect(finalization).toContain("featureKey: 'GROUP.EXTERNAL_TRACKING_LINK'");
    expect(finalization).toContain('applyExternalLinkPlacement');
    expect(finalization).toContain('applyServiceContentTerminology');
    expect(finalization).toContain('CampaignSafetyValidationService');
    expect(finalization).toContain('AdvertisingSafetyService');
    expect(finalization).toContain('finalNoveltyIssue');
    expect(finalization.indexOf('applyServiceContentTerminology')).toBeLessThan(
      finalization.indexOf('finalNoveltyIssue'),
    );
  });

  it('finalizes before persistence and records accepted campaign safety afterward', () => {
    expect(generation.indexOf('finalizeDailyMissionContent')).toBeLessThan(
      generation.indexOf("stage = 'persist'"),
    );
    expect(generation).toContain('persistGeneratedDailyMission');
    expect(persistence.indexOf('new CreateDailyMission')).toBeLessThan(
      persistence.indexOf('await recordDailyMissionCampaignSafety'),
    );
  });

  it('persists the sources needed to explain personalization and duplicate avoidance', () => {
    expect(persistence).toContain('selectedMemories');
    expect(persistence).toContain('availableSourceTypes');
    expect(persistence).toContain('recentMissions');
    expect(persistence).toContain('recentFeedback');
    expect(persistence).toContain('recentDecisions');
    expect(persistence).toContain('postRecords');
    expect(persistence).toContain('socialInsights');
  });
});
