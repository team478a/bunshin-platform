import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  new URL('../app/s/[serviceSlug]/home/page.tsx', import.meta.url),
  'utf8',
);
const overviewSource = readFileSync(
  new URL('../app/s/[serviceSlug]/home/service-home-overview-sections.tsx', import.meta.url),
  'utf8',
);
const navigationSource = readFileSync(
  new URL('../app/s/[serviceSlug]/home/service-home-navigation-sections.tsx', import.meta.url),
  'utf8',
);

describe('service home module boundary', () => {
  it('keeps scoped data loading in the server page', () => {
    expect(pageSource).toContain('resolveMemberServiceContext');
    expect(pageSource).toContain('groupMembership.findFirst');
    expect(pageSource).toContain('GetMissionProgress');
    expect(overviewSource).not.toContain('@bunshin/database');
    expect(navigationSource).not.toContain('@bunshin/database');
  });

  it('delegates member progress and navigation to focused presentation modules', () => {
    expect(pageSource).toContain('<WeeklyActivitySection');
    expect(pageSource).toContain('<MemberFeatureLinks');
    expect(overviewSource).toContain('今週の進み具合');
    expect(navigationSource).toContain('運営者用メニュー');
    expect(pageSource).not.toContain('service-home-actions');
  });
});
