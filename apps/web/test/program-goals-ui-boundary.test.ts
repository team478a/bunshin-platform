import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const http = readFileSync(new URL('../src/http/program-goals.ts', import.meta.url), 'utf8');
const manager = readFileSync(
  new URL('../app/s/[serviceSlug]/manage/program-goals/page.tsx', import.meta.url),
  'utf8',
);
const member = readFileSync(
  new URL('../app/s/[serviceSlug]/programs/page.tsx', import.meta.url),
  'utf8',
);

describe('program goals API and UI boundary', () => {
  it('requires same origin, session, and server-resolved service context', () => {
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('currentUserProvider');
    expect(http).toContain('resolveManagedServiceContext');
    expect(http).toContain('resolvePublicServiceContext');
  });
  it('scopes manager and member writes by workspace, service, enrollment, and membership', () => {
    expect(http).toContain('workspaceId: publicService.workspaceId');
    expect(http).toContain('groupId: publicService.serviceId');
    expect(http).toContain('groupMembershipId: membership.id');
    expect(http).toContain('programEnrollmentId: enrollment.id');
  });
  it('separates manager and member pages', () => {
    expect(manager).toContain('resolveManagedServiceContext');
    expect(member).toContain('groupMembership.findFirst');
    expect(member).toContain('userId: actor.userId');
  });
  it('versions support policy and preserves previous member goals', () => {
    expect(http).toContain("status: 'SUPERSEDED'");
    expect(http).toContain("status: 'CANCELLED'");
    expect(http).toContain('programAuditLog.create');
  });
});
