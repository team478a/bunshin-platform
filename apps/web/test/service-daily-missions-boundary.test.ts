import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/http/service-daily-missions.ts', import.meta.url),
  'utf8',
);
const generation = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);
const detailPage = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);
const experience = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/bunshins/[bunshinId]/service-daily-mission-section.tsx',
    import.meta.url,
  ),
  'utf8',
);

describe('service daily mission boundary', () => {
  it('derives service authority on the server', () => {
    expect(source).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(source).toContain('groupId: service.serviceId');
    expect(source).not.toContain('groupId: z.');
    expect(source).not.toContain('workspaceId: z.');
  });

  it('uses safe service generation without personal context, while retaining own trend candidates', () => {
    expect(source).toContain('serviceSafeMode: true');
    expect(generation).toMatch(/input\.serviceSafeMode\s*\?\s*null/);
    expect(generation).toMatch(/input\.serviceSafeMode\s*\?\s*\[\]/);
    expect(generation).toContain('new ListActiveTrendIdeas(');
    expect(generation).not.toMatch(/const trendIdeas = input\.serviceSafeMode\s*\?\s*\[\]/);
    expect(generation).toContain('campaign.productPack.groupId !== input.groupId');
    expect(generation).toContain("'service campaign unavailable'");
  });

  it('connects the service mission view and endpoint', () => {
    expect(detailPage).toContain('<ServiceDailyMissionSection');
    expect(detailPage).toContain('/daily-missions`}');
  });

  it('connects decisions, copies, posting and feedback through service routes', () => {
    expect(source).toContain('decideServiceDailyMissionResponse');
    expect(source).toContain('recordServiceMissionActivityResponse');
    expect(source).toContain('recordServicePostResponse');
    expect(source).toContain('recordServiceMissionFeedbackResponse');
    expect(experience).toContain('採用する');
    expect(experience).toContain('今回は使わない');
    expect(experience).toContain('copyOptions(mission)');
    expect(experience).toContain('投稿しました');
    expect(experience).toContain('この投稿は、あなたらしかったですか？');
  });
});
