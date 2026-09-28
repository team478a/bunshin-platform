import { describe, expect, it } from 'vitest';
import { resolveGroupMemberLineStatus } from '../app/(app)/groups/[groupId]/members/group-member-line-status';

const readyInput = {
  membershipStatus: 'ACTIVE',
  membershipConsentedAt: new Date('2026-09-01T00:00:00Z'),
  userStatus: 'ACTIVE',
  mode: 'DEDICATED' as const,
  dedicatedPilotEnabled: true,
  configurationReady: true,
  globallyPaused: false,
  connection: {
    status: 'ACTIVE',
    friendshipStatus: 'FOLLOWING',
    notificationConsentAt: new Date('2026-09-01T00:00:00Z'),
  },
};

describe('service member LINE status', () => {
  it('marks a fully consented and following connection as ready', () => {
    expect(resolveGroupMemberLineStatus(readyInput)).toMatchObject({
      key: 'READY',
      ready: true,
      label: 'LINE配信対象',
    });
  });

  it.each([
    ['CONNECTION_MISSING', { connection: null }],
    ['MEMBERSHIP_CONSENT_MISSING', { membershipConsentedAt: null }],
    ['CONNECTION_INACTIVE', { connection: { ...readyInput.connection, status: 'REVOKED' } }],
    [
      'NOTIFICATION_CONSENT_MISSING',
      { connection: { ...readyInput.connection, notificationConsentAt: null } },
    ],
    ['NOT_FOLLOWING', { connection: { ...readyInput.connection, friendshipStatus: 'UNFOLLOWED' } }],
    ['SERVICE_PAUSED', { globallyPaused: true }],
  ])('returns %s for an ineligible recipient', (key, override) => {
    expect(resolveGroupMemberLineStatus({ ...readyInput, ...override })).toMatchObject({
      key,
      ready: false,
    });
  });

  it('does not expose provider identifiers in its result', () => {
    expect(JSON.stringify(resolveGroupMemberLineStatus(readyInput))).not.toContain(
      'providerUserId',
    );
  });
});
