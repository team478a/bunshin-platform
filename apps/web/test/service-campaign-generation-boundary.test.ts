import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const weeklySource = readFileSync(
  new URL('../src/http/service-weekly-plans.ts', import.meta.url),
  'utf8',
);
const dailySource = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);
const campaignRepositorySource = readFileSync(
  new URL('../../../packages/database/src/index.ts', import.meta.url),
  'utf8',
);

describe('service campaign generation boundary', () => {
  it('enables campaign planning only with server-resolved service scope', () => {
    expect(weeklySource).toContain('includeCampaigns: true');
    expect(weeklySource).toContain('groupId: service.serviceId');
    expect(weeklySource).not.toContain('groupId: parsed.data');
  });

  it('requires a resolved campaign to belong to the current service', () => {
    expect(dailySource).toContain('campaign.productPack.groupId !== input.groupId');
    expect(dailySource).toContain("'service campaign unavailable'");
    expect(dailySource).not.toContain('service campaign generation is not connected');
  });

  it('filters campaign planning queries by groupId when service scope is present', () => {
    expect(campaignRepositorySource).toContain(
      '...(input.groupId ? { groupId: input.groupId } : {})',
    );
  });
});
