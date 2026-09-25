import { ApplicationError } from '@bunshin/shared';

import type {
  SocialImageGenerationRequestRepository,
  SocialImageReviewReason,
} from './social-image-generation-contracts';
import { normalizeSocialImageLayout } from './social-image-templates';
import {
  socialImageStorageScope as storageScope,
  validateSocialImageText as text,
  validateSocialImageUuid as uuid,
} from './social-image-generation-validation';
export class DecideSocialImageMedia {
  constructor(private readonly requests: SocialImageGenerationRequestRepository) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    decision: 'ADOPTED' | 'REJECTED';
    reviewReason: SocialImageReviewReason | null;
    reviewNote: string | null;
  }) {
    const scope = storageScope(input);
    const allowedReasons = new Set<SocialImageReviewReason>([
      'TEXT_HARD_TO_READ',
      'CONTENT_MISMATCH',
      'PHOTO_UNNATURAL',
      'DESIGN_UNAPPEALING',
      'OTHER',
    ]);
    if (
      input.decision === 'REJECTED' &&
      (!input.reviewReason || !allowedReasons.has(input.reviewReason))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reviewReason');
    const request = await this.requests.findOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
    });
    if (!request || request.status !== 'READY_FOR_REVIEW')
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    const value = await this.requests.setMediaStatus({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
      mediaId: scope.mediaId,
      status: input.decision,
      reviewReason: input.decision === 'REJECTED' ? input.reviewReason : null,
      reviewNote:
        input.decision === 'REJECTED' && input.reviewNote
          ? text(input.reviewNote, 'reviewNote', 500)
          : null,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'social image decision failed');
    return value;
  }
}

export class ReplaceSocialImageMediaPage {
  constructor(private readonly requests: SocialImageGenerationRequestRepository) {}

  async execute(input: Parameters<SocialImageGenerationRequestRepository['replaceMediaPage']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    if (!Number.isInteger(input.pageIndex) || input.pageIndex < 0 || input.pageIndex > 4)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid pageIndex');
    const requestId = uuid(input.requestId, 'requestId');
    const currentMediaId = uuid(input.currentMediaId, 'currentMediaId');
    const replacementMediaId = uuid(input.replacement.mediaId, 'replacementMediaId');
    const request = await this.requests.findOwned({
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      requestId,
    });
    if (
      !request ||
      request.status !== 'READY_FOR_REVIEW' ||
      request.revision !== input.expectedRevision
    )
      throw new ApplicationError('CONFLICT', 'social image revision is unavailable');
    const pages = [input.layout, ...(input.layout.carouselPages ?? [])];
    if (pages.length !== 5 || !pages[input.pageIndex])
      throw new ApplicationError('VALIDATION_ERROR', 'five image pages are required');
    const value = await this.requests.replaceMediaPage({
      ...input,
      workspaceId: request.workspaceId,
      groupId: request.groupId,
      actorUserId: request.ownerUserId,
      requestId,
      currentMediaId,
      layout: normalizeSocialImageLayout(input.layout),
      replacement: { ...input.replacement, mediaId: replacementMediaId },
    });
    if (!value) throw new ApplicationError('CONFLICT', 'social image page revision failed');
    return value;
  }
}
