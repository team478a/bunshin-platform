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
    expect(generation.indexOf('new CreateDailyMission')).toBeLessThan(
      generation.indexOf('await recordDailyMissionCampaignSafety'),
    );
  });
});
