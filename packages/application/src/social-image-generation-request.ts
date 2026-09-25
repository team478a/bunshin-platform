import { ApplicationError } from '@bunshin/shared';

import type {
  SocialImageGenerationAuthorizationPort,
  SocialImageGenerationRequestRepository,
  SocialImageGenerationStatus,
  SocialImageLayout,
  SocialImageReference,
} from './social-image-generation-contracts';
import { normalizeSocialImageLayout } from './social-image-templates';
import {
  validateOptionalSocialImageUuid as optionalUuid,
  validateSocialImageText as text,
  validateSocialImageUuid as uuid,
} from './social-image-generation-validation';
const transitions: Record<SocialImageGenerationStatus, ReadonlySet<SocialImageGenerationStatus>> = {
  DRAFT: new Set(['QUEUED', 'CANCELLED']),
  QUEUED: new Set(['GENERATING_ASSET', 'FAILED', 'CANCELLED']),
  GENERATING_ASSET: new Set(['COMPOSING', 'FAILED', 'CANCELLED']),
  COMPOSING: new Set(['READY_FOR_REVIEW', 'FAILED', 'CANCELLED']),
  READY_FOR_REVIEW: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
};

export const assertSocialImageGenerationTransition = (
  fromStatus: SocialImageGenerationStatus,
  toStatus: SocialImageGenerationStatus,
) => {
  if (!transitions[fromStatus].has(toStatus))
    throw new ApplicationError('CONFLICT', 'invalid social image generation transition');
};

export class CreateSocialImageGenerationRequest {
  constructor(
    private readonly authorization: SocialImageGenerationAuthorizationPort,
    private readonly requests: SocialImageGenerationRequestRepository,
  ) {}

  async execute(input: {
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    campaignId: string | null;
    productPackVersionId: string | null;
    referenceImage?: SocialImageReference | null;
    layout: SocialImageLayout;
    idempotencyKey: string;
    now?: Date;
  }) {
    if (input.environment !== 'PRODUCTION')
      throw new ApplicationError('FORBIDDEN', 'social image pilot is production only');
    if (
      input.referenceImage &&
      (!/^[a-f0-9]{64}$/.test(input.referenceImage.sha256) ||
        input.referenceImage.rightsConfirmed !== true)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid image reference consent');
    const scope = {
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      groupMembershipId: uuid(input.groupMembershipId, 'groupMembershipId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      bunshinId: uuid(input.bunshinId, 'bunshinId'),
      dailyMissionId: uuid(input.dailyMissionId, 'dailyMissionId'),
      campaignId: optionalUuid(input.campaignId, 'campaignId'),
      productPackVersionId: optionalUuid(input.productPackVersionId, 'productPackVersionId'),
    };
    const idempotencyKey = text(input.idempotencyKey, 'idempotencyKey', 200);
    if (idempotencyKey.length < 8)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid idempotencyKey');
    const authorized = await this.authorization.authorize({
      environment: input.environment,
      ...scope,
      now: input.now ?? new Date(),
    });
    if (!authorized.allowed)
      throw new ApplicationError(
        'FORBIDDEN',
        `social image generation blocked: ${authorized.reason}`,
      );
    const value = await this.requests.create({
      ...scope,
      generationContextSnapshotId: optionalUuid(
        authorized.generationContextSnapshotId,
        'generationContextSnapshotId',
      ),
      pilotEnrollmentId: uuid(authorized.pilotEnrollmentId, 'pilotEnrollmentId'),
      referenceImage: input.referenceImage ?? null,
      layout: normalizeSocialImageLayout(input.layout),
      idempotencyKey,
    });
    if (!value)
      throw new ApplicationError('CONFLICT', 'social image generation request unavailable');
    if (
      value.workspaceId !== scope.workspaceId ||
      value.groupId !== scope.groupId ||
      value.ownerUserId !== scope.actorUserId ||
      value.bunshinId !== scope.bunshinId ||
      value.dailyMissionId !== scope.dailyMissionId ||
      (value.referenceImage?.sha256 ?? null) !== (input.referenceImage?.sha256 ?? null)
    )
      throw new ApplicationError('CONFLICT', 'image request key belongs to different content');
    return value;
  }
}

export class GetSocialImageGenerationRequest {
  constructor(private readonly requests: SocialImageGenerationRequestRepository) {}
  async execute(input: Parameters<SocialImageGenerationRequestRepository['findOwned']>[0]) {
    const value = await this.requests.findOwned({
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      requestId: uuid(input.requestId, 'requestId'),
    });
    if (!value)
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    return value;
  }
}

export class TransitionSocialImageGenerationRequest {
  constructor(private readonly requests: SocialImageGenerationRequestRepository) {}
  async execute(input: Parameters<SocialImageGenerationRequestRepository['transition']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    assertSocialImageGenerationTransition(input.fromStatus, input.toStatus);
    const errorCode = input.errorCode?.trim() || null;
    if ((input.toStatus === 'FAILED') !== Boolean(errorCode))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid errorCode');
    if (errorCode && !/^[A-Z][A-Z0-9_]{2,79}$/.test(errorCode))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid errorCode');
    const value = await this.requests.transition({
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      requestId: uuid(input.requestId, 'requestId'),
      expectedRevision: input.expectedRevision,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      errorCode,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'social image generation transition failed');
    return value;
  }
}
