import 'server-only';
import { randomUUID } from 'node:crypto';
import { getServerEnvironment } from '@bunshin/config';
import { ReviewImprovementFeedbackCandidate } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { ImprovementScope } from '@bunshin/platform-domain';
import { feedbackPreviewWindow } from './improvement-feedback-admin-preview';
import {
  openFeedbackReviewHandle,
  sealFeedbackReviewHandle,
  type FeedbackReviewHandle,
} from './improvement-feedback-review-handle';

export function feedbackReviewEnvironment() {
  return ({ development: 'DEVELOPMENT', staging: 'STAGING', production: 'PRODUCTION' } as const)[
    getServerEnvironment().APP_ENV
  ];
}
export type FeedbackReviewCommand =
  | { action: 'PREPARE'; handle: string }
  | {
      action: 'MARK_REVIEWED';
      handle: string;
      reasonCode: 'REVIEW_COMPLETED';
      confirmation: 'RECORD_REVIEW';
    }
  | {
      action: 'DISMISS';
      handle: string;
      reasonCode: 'OUT_OF_SCOPE' | 'DUPLICATE_REVIEW';
      confirmation: 'RECORD_REVIEW';
    };
export async function executeFeedbackReview(input: {
  workspaceId: string;
  serviceId: string;
  actorUserId: string;
  command: FeedbackReviewCommand;
}) {
  const now = new Date();
  const secret = getServerEnvironment().SESSION_SECRET;
  const value = openFeedbackReviewHandle(input.command.handle, secret, now);
  if (
    value.actorUserId !== input.actorUserId ||
    value.workspaceId !== input.workspaceId ||
    value.serviceId !== input.serviceId ||
    value.environment !== feedbackReviewEnvironment()
  )
    throw new ApplicationError('NOT_FOUND', 'feedback review unavailable');
  const window = feedbackPreviewWindow({ week: value.week }, now);
  if (window.outcome !== 'WINDOW')
    throw new ApplicationError('CONFLICT', 'feedback review requires reload');
  const scope: ImprovementScope = {
    tenantRef: input.workspaceId,
    workspaceId: input.workspaceId,
    serviceId: input.serviceId,
    environment: value.environment,
    packageKey: 'SOCIAL',
    adapterKey: 'TROUBLE_FEEDBACK',
  };
  const db = await import('@bunshin/database');
  const repository = new db.PrismaImprovementFeedbackTriageRepository(db.prisma, scope);
  if (input.command.action === 'PREPARE') {
    if (value.review !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'selection handle required');
    const candidate = await repository.createCandidate({
      actorUserId: input.actorUserId,
      weekStart: window.fromInclusive,
      clusterRef: value.clusterRef,
    });
    if (
      candidate.windowEvidenceRevision !== value.windowRevision ||
      candidate.bucketEvidenceRevision !== value.bucketRevision
    )
      throw new ApplicationError('CONFLICT', 'feedback review evidence changed');
    if (candidate.state !== 'OPEN') return { state: candidate.state, handle: null };
    const prepared: FeedbackReviewHandle = {
      ...value,
      review: {
        candidateId: candidate.id,
        revision: candidate.candidateRevision,
        operationKey: randomUUID(),
      },
    };
    // Do not extend the original display's expiry or return IDs/hashes.
    return { state: 'OPEN', handle: sealFeedbackReviewHandle(prepared, secret) };
  }
  if (!value.review) throw new ApplicationError('VALIDATION_ERROR', 'prepared handle required');
  const receipt = await new ReviewImprovementFeedbackCandidate(repository).execute({
    scope,
    actorUserId: input.actorUserId,
    candidateId: value.review.candidateId,
    operationKey: value.review.operationKey,
    expectedCandidateRevision: value.review.revision,
    expectedWindowEvidenceRevision: value.windowRevision,
    expectedBucketEvidenceRevision: value.bucketRevision,
    action: input.command.action,
    reasonCode: input.command.reasonCode,
  });
  return { state: receipt.state, handle: null };
}
