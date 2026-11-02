import { describe, expect, it } from 'vitest';
import {
  projectServiceReferralRegistrationOrigin,
  type ServiceReferralRegistrationAudit,
} from '../src/index';
const member = { workspaceId: 'w', serviceId: 's', groupMembershipId: 'm', userId: 'u' };
const at = new Date('2026-11-01T00:00:00Z');
const audit = (): ServiceReferralRegistrationAudit => ({
  workspaceId: 'w',
  groupId: 's',
  groupMembershipId: 'm',
  performedByUserId: 'u',
  occurredAt: at,
  action: 'APPROVED',
  reason: 'public service registration',
  beforeData: {},
  afterData: { role: 'PARTICIPANT', status: 'ACTIVE' },
});
describe('registration audit evidence projection', () => {
  it('uses the full public registration writer contract', () => {
    expect(projectServiceReferralRegistrationOrigin(member, at, [audit()], true)).toBe(true);
  });
  it('supports the initial approval-request writer', () => {
    expect(
      projectServiceReferralRegistrationOrigin(
        member,
        at,
        [
          {
            ...audit(),
            action: 'REQUESTED',
            reason: 'service participation requested',
            afterData: { role: 'PARTICIPANT', status: 'PENDING_APPROVAL' },
          },
        ],
        true,
      ),
    ).toBe(true);
  });
  it.each(['ACTIVE', 'PENDING_APPROVAL', 'DECLINED', 'REVOKED'])(
    'proves an existing %s membership',
    (status) => {
      expect(
        projectServiceReferralRegistrationOrigin(
          member,
          at,
          [{ ...audit(), beforeData: { status } }],
          true,
        ),
      ).toBe(false);
    },
  );
  it.each(['workspaceId', 'groupId', 'groupMembershipId'] as const)('rejects foreign %s', (key) => {
    expect(() =>
      projectServiceReferralRegistrationOrigin(member, at, [{ ...audit(), [key]: 'other' }], true),
    ).toThrow('foreign registration audit');
  });
  it.each([
    ['performedByUserId', 'other'],
    ['occurredAt', new Date(at.getTime() + 1)],
    ['action', 'REGISTERED'],
    ['reason', 'registration'],
    ['beforeData', null],
    ['beforeData', []],
    ['beforeData', { status: 'UNKNOWN' }],
    ['afterData', { role: 'ADMIN', status: 'ACTIVE' }],
    ['afterData', { role: 'PARTICIPANT', status: 'REVOKED' }],
  ])('does not infer provenance from malformed or unrelated %s', (key, value) => {
    const row = audit();
    Reflect.set(row, key, value);
    expect(projectServiceReferralRegistrationOrigin(member, at, [row], true)).toBeNull();
  });
  it('does not infer origin from absent, duplicate, partial or undated history', () => {
    expect(projectServiceReferralRegistrationOrigin(member, at, [], true)).toBeNull();
    expect(
      projectServiceReferralRegistrationOrigin(member, at, [audit(), audit()], true),
    ).toBeNull();
    expect(projectServiceReferralRegistrationOrigin(member, at, [audit()], false)).toBeNull();
    expect(projectServiceReferralRegistrationOrigin(member, null, [audit()], true)).toBeNull();
  });
});
