import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('service member tracking link boundary', () => {
  it('provides a participant page outside the management route', () => {
    const page = source('app/s/[serviceSlug]/tracking-link/page.tsx');
    expect(page).toContain('ExternalTrackingMemberLinkService');
    expect(page).toContain('actorUserId: actor.userId');
    expect(page).not.toContain('resolveManagedServiceContext');
  });

  it('keeps writes on the current user and current service boundary', () => {
    const http = source('src/http/service-member-tracking-link.ts');
    expect(http).toContain('actorUserId: actor.userId');
    expect(http).toContain(
      'new db.PrismaExternalTrackingLinkRepository(undefined, service.serviceId)',
    );
    expect(http).not.toContain('groupMembershipId:');
  });

  it('links the participant service home to their own URL settings', () => {
    const home = source('app/s/[serviceSlug]/home/page.tsx');
    expect(home).toContain('/tracking-link');
    expect(home).toContain('自分の代理店URLを登録する');
  });
});
