import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const httpSource = readFileSync(
  new URL('../src/http/service-bunshins.ts', import.meta.url),
  'utf8',
);
const homeSource = [
  '../app/s/[serviceSlug]/home/page.tsx',
  '../app/s/[serviceSlug]/home/service-home-overview-sections.tsx',
  '../app/s/[serviceSlug]/home/service-home-navigation-sections.tsx',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');
const listSource = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/page.tsx', import.meta.url),
  'utf8',
);

describe('service Bunshin web boundary', () => {
  it('resolves the service scope on the server instead of accepting IDs from the body', () => {
    expect(httpSource).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(httpSource).toContain('groupId: service.serviceId');
    expect(httpSource).not.toContain('groupId: z.');
    expect(httpSource).not.toContain('workspaceId: z.');
  });

  it('uses the service-only repository list and exposes the member-home entry', () => {
    expect(httpSource).toContain('ListServiceBunshins');
    expect(homeSource).toContain('/bunshins` as Route');
    expect(homeSource).toContain('投稿パートナーを作る・見る');
  });

  it('sends members to first setup before showing the partner list', () => {
    expect(listSource).toContain('readServiceOnboardingSettings');
    expect(listSource).toContain('membership.serviceOnboardingResponse');
    expect(listSource).toContain('membership.serviceMemberBusinessProfile');
    expect(listSource).toContain('/onboarding` as Route');
  });

  it('keeps detail and updates scoped by the server-resolved service', () => {
    expect(httpSource).toContain('getServiceBunshinResponse');
    expect(httpSource).toContain('updateServiceBunshinResponse');
    expect(httpSource).toContain('archiveServiceBunshinResponse');
    expect(httpSource).toContain('groupId: service.serviceId');
  });

  it('shows service-scoped weekly activity and a direct path to todays proposal', () => {
    expect(homeSource).toContain('GetMissionProgress');
    expect(homeSource).toContain('groupId: service.serviceId');
    expect(homeSource).toContain('actorUserId: actor.userId');
    expect(homeSource).toContain('今週の進み具合');
    expect(homeSource).toContain('今日の投稿案を見る');
    expect(homeSource).not.toContain('href={`/today');
  });
});
