import { describe, expect, it, vi } from 'vitest';
import {
  CreateSocialImageGenerationRequest,
  GetSocialImageGenerationRequest,
  SOCIAL_IMAGE_GENERATION_FEATURE_KEY,
  TransitionSocialImageGenerationRequest,
  assertSocialImageGenerationTransition,
  type SocialImageGenerationAuthorizationPort,
  type SocialImageGenerationRequestRecord,
  type SocialImageGenerationRequestRepository,
} from '../src';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  groupMembershipId: '33333333-3333-4333-8333-333333333333',
  actorUserId: '44444444-4444-4444-8444-444444444444',
  bunshinId: '55555555-5555-4555-8555-555555555555',
  dailyMissionId: '66666666-6666-4666-8666-666666666666',
  pilotEnrollmentId: '77777777-7777-4777-8777-777777777777',
  requestId: '88888888-8888-4888-8888-888888888888',
};
const now = new Date('2026-08-28T00:00:00.000Z');
const layout = {
  templateKey: 'THREE_POINTS' as const,
  headline: '今日からできる3つのこと',
  bodyLines: ['一つ目', '二つ目', '三つ目'],
  cta: '保存して試してください',
  accentColor: '#FF3B30',
};
const record = (status: SocialImageGenerationRequestRecord['status'] = 'DRAFT') =>
  ({
    id: ids.requestId,
    ...ids,
    ownerUserId: ids.actorUserId,
    campaignId: null,
    productPackVersionId: null,
    generationContextSnapshotId: null,
    status,
    templateKey: layout.templateKey,
    layout,
    idempotencyKey: 'mission-image-1',
    revision: 1,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
  }) as SocialImageGenerationRequestRecord;
const authorization = (allowed = true): SocialImageGenerationAuthorizationPort => ({
  authorize: vi.fn().mockResolvedValue(
    allowed
      ? {
          allowed: true,
          pilotEnrollmentId: ids.pilotEnrollmentId,
          generationContextSnapshotId: null,
        }
      : { allowed: false, reason: 'MEMBERSHIP_UNAVAILABLE' },
  ),
});
const repository = (
  overrides: Partial<SocialImageGenerationRequestRepository> = {},
): SocialImageGenerationRequestRepository => ({
  create: vi.fn().mockResolvedValue(record()),
  findOwned: vi.fn().mockResolvedValue(record()),
  findMediaOwned: vi.fn().mockResolvedValue(null),
  transition: vi.fn().mockResolvedValue({ ...record('QUEUED'), revision: 2 }),
  ...overrides,
});

describe('Social image generation core', () => {
  it('uses the existing extensible group feature key', () => {
    expect(SOCIAL_IMAGE_GENERATION_FEATURE_KEY).toBe('SOCIAL.IMAGE_GENERATION');
  });

  it('creates a request only after production pilot authorization', async () => {
    const access = authorization();
    const requests = repository();
    await expect(
      new CreateSocialImageGenerationRequest(access, requests).execute({
        environment: 'PRODUCTION',
        ...ids,
        campaignId: null,
        productPackVersionId: null,
        layout,
        idempotencyKey: 'mission-image-1',
        now,
      }),
    ).resolves.toMatchObject({ id: ids.requestId, groupId: ids.groupId });
    // Repository and Port methods are deliberately inspected as Vitest mocks here.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(access.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        groupMembershipId: ids.groupMembershipId,
        actorUserId: ids.actorUserId,
        bunshinId: ids.bunshinId,
        dailyMissionId: ids.dailyMissionId,
      }),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(requests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        pilotEnrollmentId: ids.pilotEnrollmentId,
      }),
    );
  });

  it('fails closed outside production and when membership authorization fails', async () => {
    await expect(
      new CreateSocialImageGenerationRequest(authorization(), repository()).execute({
        environment: 'DEVELOPMENT',
        ...ids,
        campaignId: null,
        productPackVersionId: null,
        layout,
        idempotencyKey: 'mission-image-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      new CreateSocialImageGenerationRequest(authorization(false), repository()).execute({
        environment: 'PRODUCTION',
        ...ids,
        campaignId: null,
        productPackVersionId: null,
        layout,
        idempotencyKey: 'mission-image-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validates the managed layout before persistence', async () => {
    await expect(
      new CreateSocialImageGenerationRequest(authorization(), repository()).execute({
        environment: 'PRODUCTION',
        ...ids,
        campaignId: null,
        productPackVersionId: null,
        layout: { ...layout, accentColor: 'red' },
        idempotencyKey: 'mission-image-1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not reveal another scope request', async () => {
    await expect(
      new GetSocialImageGenerationRequest(
        repository({ findOwned: vi.fn().mockResolvedValue(null) }),
      ).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        requestId: ids.requestId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('allows only forward processing transitions', () => {
    expect(() => assertSocialImageGenerationTransition('DRAFT', 'QUEUED')).not.toThrow();
    expect(() =>
      assertSocialImageGenerationTransition('COMPOSING', 'READY_FOR_REVIEW'),
    ).not.toThrow();
    expect(() => assertSocialImageGenerationTransition('READY_FOR_REVIEW', 'COMPOSING')).toThrow();
    expect(() => assertSocialImageGenerationTransition('FAILED', 'QUEUED')).toThrow();
  });

  it('uses optimistic revision and safe error categories for transitions', async () => {
    const requests = repository();
    await expect(
      new TransitionSocialImageGenerationRequest(requests).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        requestId: ids.requestId,
        expectedRevision: 1,
        fromStatus: 'DRAFT',
        toStatus: 'QUEUED',
        errorCode: null,
      }),
    ).resolves.toMatchObject({ status: 'QUEUED', revision: 2 });
    await expect(
      new TransitionSocialImageGenerationRequest(requests).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        requestId: ids.requestId,
        expectedRevision: 1,
        fromStatus: 'QUEUED',
        toStatus: 'FAILED',
        errorCode: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
