import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const notification = source('src/services/member-tracking-link-notification.ts');
const transition = source('src/http/external-tracking-links.ts');
const operations = source('app/(app)/admin/external-tracking/external-tracking-operations.tsx');
const repository = source('../../packages/database/src/index.ts');

describe('member tracking link result notification', () => {
  it('targets only the linked consenting service member', () => {
    expect(notification).toContain("scopeType: 'MEMBER'");
    expect(notification).toContain("membership.status !== 'ACTIVE'");
    expect(notification).toContain('notificationConsentAt: { not: null }');
    expect(notification).toContain("friendshipStatus: 'FOLLOWING'");
    expect(notification).toContain('serviceLineBroadcastRecipient.create');
    expect(notification).not.toContain('createMany');
  });

  it('queues approval and revision messages through the existing delivery worker', () => {
    expect(transition).toContain('queueMemberTrackingLinkResultNotification');
    expect(transition).toContain("'ACTIVATED'");
    expect(transition).toContain("'REVISION_REQUESTED'");
    expect(notification).toContain("jobType: 'SERVICE_LINE_BROADCAST_DELIVER'");
    expect(notification).toContain('/tracking-link');
  });

  it('lets an operator request correction while a member link is waiting', () => {
    expect(repository).toContain("status: { in: ['DRAFT', 'ACTIVE'] }");
    expect(operations).toContain('修正をお願いする');
    expect(operations).toContain('`/links/${link.id}/suspend`');
  });

  it('does not roll back the URL decision when LINE is unavailable', () => {
    expect(notification).toContain("status: 'SKIPPED' as const");
    expect(notification).toContain("reason: 'LINE_UNAVAILABLE'");
    expect(notification).toContain("reason: 'QUEUE_FAILED'");
  });
});
