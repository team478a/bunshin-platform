import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('business growth roadmap boundary', () => {
  it('shows the current 90-day phase on the business service home', () => {
    const home = source('app/s/[serviceSlug]/home/page.tsx');
    expect(home).toContain('businessGrowthProgramStatus');
    expect(home).toContain('90日計画と現在地を見る');
    expect(home).toContain('href={`/s/${service.configuration.slug}/roadmap` as Route}');
    expect(home).toContain("isBusinessDailyService ? '今日やることを見る'");
  });

  it('provides a member-only roadmap with all four phases and a daily action link', () => {
    const roadmap = source('app/s/[serviceSlug]/roadmap/page.tsx');
    expect(roadmap).toContain('resolveAuthenticatedMemberServicePage');
    expect(roadmap).toContain('BUSINESS_GROWTH_PROGRAM_PHASES.map');
    expect(roadmap).toContain('90日で、続けられる集客の型を作ります');
    expect(roadmap).toContain('今日やることを見る');
  });

  it('uses the business profile start date for screen and LINE actions', () => {
    const detail = source('app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx');
    const database = source('../../packages/database/src/mission-generation.ts');
    expect(detail).toContain('programStartedAt: businessProgramProfile.createdAt');
    expect(database).toContain('programStartedAt: businessProfile.createdAt');
  });
});
