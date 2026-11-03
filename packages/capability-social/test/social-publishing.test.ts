import { describe, expect, it } from 'vitest';
import {
  assertApprovedSocialPublication,
  type SocialPublicationApproval,
  type SocialPublicationIntent,
} from '../src';

const now = new Date('2026-11-03T06:00:00Z');
const intent = (): SocialPublicationIntent => ({
  workspaceId: 'workspace-1',
  serviceId: 'service-1',
  ownerUserId: 'user-1',
  bunshinId: 'bunshin-1',
  socialProfileId: 'social-profile-1',
  dailyMissionId: 'mission-1',
  platform: 'INSTAGRAM',
  connectedAccountId: 'ig-account-1',
  contentRevision: 2,
  caption: '新メニューのお知らせ',
  mediaAssetIds: ['approved-image-1'],
  scheduledAt: '2026-11-04T01:00:00Z',
  idempotencyKey: 'schedule-mission-1',
});
const approval = (value: SocialPublicationIntent = intent()): SocialPublicationApproval => ({
  approvedByUserId: 'user-1',
  approvedAt: new Date('2026-11-03T05:00:00Z'),
  expiresAt: new Date('2026-11-04T05:00:00Z'),
  intent: value,
});

describe('official SNS publishing approval preflight', () => {
  it('accepts the exact approved posting intent and copies the media list', () => {
    const value = intent();
    const approved = approval(intent());
    const result = assertApprovedSocialPublication(value, approved, now);
    expect(result).toEqual(value);
    expect(result).not.toBe(value);
    expect(result.mediaAssetIds).not.toBe(value.mediaAssetIds);
  });

  it('requires the owner to have explicitly approved this posting', () => {
    const value = intent();
    expect(() => assertApprovedSocialPublication(value, null, now)).toThrow();
    expect(() =>
      assertApprovedSocialPublication(
        value,
        { ...approval(value), approvedByUserId: 'other-user' },
        now,
      ),
    ).toThrow();
    expect(() =>
      assertApprovedSocialPublication(
        value,
        { ...approval(value), approvedAt: new Date('2026-11-04') },
        now,
      ),
    ).toThrow();
    expect(() =>
      assertApprovedSocialPublication(value, { ...approval(value), expiresAt: new Date(now) }, now),
    ).toThrow();
  });

  it.each([
    { connectedAccountId: 'other-account' },
    { workspaceId: 'other-workspace' },
    { serviceId: 'other-service' },
    { ownerUserId: 'other-user' },
    { bunshinId: 'other-bunshin' },
    { socialProfileId: 'other-profile' },
    { dailyMissionId: 'other-mission' },
    { contentRevision: 3 },
    { caption: '文章の差し替え' },
    { platform: 'THREADS' as const },
    { scheduledAt: '2026-11-05T01:00:00Z' },
    { idempotencyKey: 'new-queue-key' },
    { mediaAssetIds: ['different-media'] },
    { mediaAssetIds: ['approved-image-1', 'extra-image'] },
  ])('blocks a changed approval-bound target, text, media, scope or schedule: %j', (change) => {
    const value: SocialPublicationIntent = { ...intent(), ...change };
    expect(() => assertApprovedSocialPublication(value, approval(intent()), now)).toThrow();
  });

  it.each([
    { connectedAccountId: '' },
    { platform: 'OTHER' as const },
    { contentRevision: 0 },
    { caption: 'x'.repeat(2201) },
    { mediaAssetIds: [] },
    { mediaAssetIds: ['ok', ''] },
    { scheduledAt: 'tomorrow' },
    { idempotencyKey: '' },
  ])('rejects structurally invalid publishing input before approval: %j', (change) => {
    const value: SocialPublicationIntent = { ...intent(), ...change };
    expect(() => assertApprovedSocialPublication(value, approval(value), now)).toThrow();
  });
});
