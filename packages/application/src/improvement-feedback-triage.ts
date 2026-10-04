import {
  sameImprovementScope,
  validateImprovementScope,
  validateImprovementTriageCandidate,
  isImprovementTriageDigest,
  isImprovementTriageUuid,
  improvementTriageNextState,
  type ImprovementScope,
  type ImprovementTriageCandidate,
  type ImprovementTriageAction,
} from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { BuildImprovementFeedbackReviewEvidence } from './improvement-feedback-review-evidence';
import type { ImprovementReadRequest } from './improvement-engine';

type Evidence = Awaited<ReturnType<BuildImprovementFeedbackReviewEvidence['execute']>>;
export interface ImprovementTriagePolicy {
  approved: boolean;
  retentionPolicyVersion: string;
  disclosurePolicyVersion: string;
  minimumBucketReporters: number;
  candidateRetentionDays: number;
}
export interface ReviewImprovementFeedbackInput {
  scope: ImprovementScope;
  actorUserId: string;
  candidateId: string;
  operationKey: string;
  expectedCandidateRevision: number;
  expectedWindowEvidenceRevision: string;
  expectedBucketEvidenceRevision: string;
  action: ImprovementTriageAction;
  reasonCode: 'REVIEW_COMPLETED' | 'OUT_OF_SCOPE' | 'DUPLICATE_REVIEW';
}
export interface ImprovementTriageReceipt {
  candidateId: string;
  candidateRevision: number;
  state: 'REVIEWED' | 'DISMISSED';
}
export interface ImprovementTriageOperation {
  actorUserId: string;
  candidateId: string;
  expectedCandidateRevision: number;
  action: ImprovementTriageAction;
  reasonCode: ReviewImprovementFeedbackInput['reasonCode'];
  receipt: ImprovementTriageReceipt;
}
/** All methods belong to ONE atomic snapshot/lock boundary. */
export interface ImprovementFeedbackTriageTransaction {
  authorize(): Promise<boolean>; // ACTIVE same-Service owner/admin + active User/Workspace/Service
  policy(): Promise<ImprovementTriagePolicy | null>; // trusted reviewed configuration, not caller input
  candidate(id: string): Promise<ImprovementTriageCandidate | null>; // bound scope only
  evidence(input: ImprovementReadRequest): Promise<Evidence>; // existing pinned use case, same tx snapshot
  operation(key: string): Promise<ImprovementTriageOperation | null>; // bound scope/key
  /** Atomically CAS + immutable operation/audit; recheck authorization/expiry at commit. False leaves both unchanged. */
  commit(input: {
    candidateId: string;
    expectedRevision: number;
    operationKey: string;
    operation: ImprovementTriageOperation;
  }): Promise<boolean>;
}
export interface ImprovementFeedbackTriageRepository {
  /** Rejection/throw rolls back everything. Must serialize source deletion + membership changes too. */
  transaction<T>(
    context: { scope: ImprovementScope; actorUserId: string },
    work: (tx: ImprovementFeedbackTriageTransaction) => Promise<T>,
  ): Promise<T>;
}
const conflict = () => new ApplicationError('CONFLICT', 'feedback review requires revalidation');
const day = 86_400_000;
/** Internal review contract only: no HTTP or implementation approval. */
export class ReviewImprovementFeedbackCandidate {
  constructor(
    private readonly repository: ImprovementFeedbackTriageRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(input: ReviewImprovementFeedbackInput): Promise<ImprovementTriageReceipt> {
    const request = {
      ...input,
      scope: {
        tenantRef: input.scope.tenantRef,
        workspaceId: input.scope.workspaceId,
        serviceId: input.scope.serviceId,
        packageKey: input.scope.packageKey,
        adapterKey: input.scope.adapterKey,
        environment: input.scope.environment,
      },
    };
    try {
      validateImprovementScope(request.scope);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid triage scope');
    }
    if (
      request.scope.packageKey !== 'SOCIAL' ||
      request.scope.adapterKey !== 'TROUBLE_FEEDBACK' ||
      typeof request.actorUserId !== 'string' ||
      request.actorUserId.length < 1 ||
      request.actorUserId.length > 240 ||
      /\s/u.test(request.actorUserId) ||
      [...request.actorUserId].some((character) => character.charCodeAt(0) < 32) ||
      !isImprovementTriageUuid(request.candidateId) ||
      !isImprovementTriageUuid(request.operationKey) ||
      !Number.isSafeInteger(request.expectedCandidateRevision) ||
      request.expectedCandidateRevision < 1 ||
      !isImprovementTriageDigest(request.expectedWindowEvidenceRevision) ||
      !isImprovementTriageDigest(request.expectedBucketEvidenceRevision) ||
      !['MARK_REVIEWED', 'DISMISS'].includes(request.action) ||
      (request.action === 'MARK_REVIEWED'
        ? request.reasonCode !== 'REVIEW_COMPLETED'
        : !['OUT_OF_SCOPE', 'DUPLICATE_REVIEW'].includes(request.reasonCode))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback review request');
    return this.repository.transaction(
      { scope: { ...request.scope }, actorUserId: request.actorUserId },
      async (tx) => {
        if (!(await tx.authorize()))
          throw new ApplicationError('NOT_FOUND', 'triage scope not found');
        const policy = structuredClone(await tx.policy());
        if (
          !policy ||
          policy.approved !== true ||
          policy.disclosurePolicyVersion !== 'feedback-admin-preview-v1' ||
          typeof policy.retentionPolicyVersion !== 'string' ||
          !/^[a-z0-9][a-z0-9-]{0,119}$/.test(policy.retentionPolicyVersion) ||
          !Number.isSafeInteger(policy.minimumBucketReporters) ||
          policy.minimumBucketReporters < 5 ||
          !Number.isSafeInteger(policy.candidateRetentionDays) ||
          policy.candidateRetentionDays < 1 ||
          policy.candidateRetentionDays > 90
        )
          throw new ApplicationError('CONFIGURATION_ERROR', 'approved triage policy required');
        const candidate = structuredClone(await tx.candidate(request.candidateId));
        if (
          !candidate ||
          candidate.id !== request.candidateId ||
          !sameImprovementScope(candidate.scope, request.scope)
        )
          throw new ApplicationError('NOT_FOUND', 'triage candidate not found');
        try {
          validateImprovementTriageCandidate(candidate);
        } catch {
          throw conflict();
        }
        const now = this.now();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw conflict();
        const { fromInclusive: from, toExclusive: to } = candidate.period;
        const localMonday = new Date(from.getTime() + 9 * 3_600_000);
        if (
          to.getTime() - from.getTime() !== 7 * day ||
          localMonday.getUTCDay() !== 1 ||
          localMonday.toISOString().slice(11) !== '00:00:00.000Z' ||
          to > now ||
          now.getTime() - to.getTime() >= 12 * 7 * day ||
          candidate.expiresAt <= now ||
          candidate.expiresAt.getTime() > to.getTime() + policy.candidateRetentionDays * day ||
          candidate.state === 'STALE' ||
          candidate.retentionPolicyVersion !== policy.retentionPolicyVersion ||
          candidate.disclosurePolicyVersion !== policy.disclosurePolicyVersion ||
          candidate.adapterVersion !== 'trouble-feedback-v1' ||
          candidate.ruleVersion !== 'selected-feedback-review-v1' ||
          candidate.windowEvidenceRevision !== request.expectedWindowEvidenceRevision ||
          candidate.bucketEvidenceRevision !== request.expectedBucketEvidenceRevision
        )
          throw conflict();
        const evidence = await tx.evidence({
          scope: { ...request.scope },
          actorUserId: request.actorUserId,
          subject: null,
          limit: 1000,
          fromInclusive: new Date(from),
          toExclusive: new Date(to),
        });
        const bucket = evidence.buckets.find((item) => item.clusterRef === candidate.clusterRef);
        if (
          !sameImprovementScope(evidence.scope, request.scope) ||
          evidence.selection.kind !== 'SERVICE' ||
          evidence.period.fromInclusive !== from.toISOString() ||
          evidence.period.toExclusive !== to.toISOString() ||
          evidence.adapterVersion !== candidate.adapterVersion ||
          evidence.rule.version !== candidate.ruleVersion ||
          evidence.coverage.completeness !== 'COMPLETE' ||
          evidence.coverage.truncated ||
          evidence.coverage.missingCount !== 0 ||
          !Number.isSafeInteger(evidence.reports) ||
          evidence.reports < 1 ||
          evidence.reports > 1000 ||
          !Number.isSafeInteger(evidence.distinctReporters) ||
          evidence.distinctReporters < 1 ||
          evidence.distinctReporters > evidence.reports ||
          evidence.buckets.reduce((sum, item) => sum + item.reports, 0) !== evidence.reports ||
          evidence.evidenceRevision !== request.expectedWindowEvidenceRevision ||
          !bucket ||
          bucket.evidenceRevision !== request.expectedBucketEvidenceRevision ||
          bucket.reviewDecision !== 'REVIEW_REQUIRED' ||
          evidence.buckets.some(
            (item) =>
              !Number.isSafeInteger(item.distinctReporters) ||
              item.distinctReporters < policy.minimumBucketReporters ||
              !Number.isSafeInteger(item.reports) ||
              item.reports < item.distinctReporters,
          )
        )
          throw conflict();
        if (!(await tx.authorize()))
          throw new ApplicationError('NOT_FOUND', 'triage scope not found');
        const prior = await tx.operation(request.operationKey);
        if (!(await tx.authorize()))
          throw new ApplicationError('NOT_FOUND', 'triage scope not found');
        const checkedAt = this.now();
        if (
          !(checkedAt instanceof Date) ||
          !Number.isFinite(checkedAt.getTime()) ||
          candidate.expiresAt <= checkedAt ||
          checkedAt.getTime() - to.getTime() >= 12 * 7 * day
        )
          throw conflict();
        if (prior) {
          if (
            prior.actorUserId !== request.actorUserId ||
            prior.candidateId !== request.candidateId ||
            prior.expectedCandidateRevision !== request.expectedCandidateRevision ||
            prior.action !== request.action ||
            prior.reasonCode !== request.reasonCode ||
            prior.receipt.candidateId !== candidate.id ||
            prior.receipt.candidateRevision !== request.expectedCandidateRevision + 1 ||
            candidate.candidateRevision !== prior.receipt.candidateRevision ||
            candidate.state !== prior.receipt.state
          )
            throw conflict();
          return {
            candidateId: candidate.id,
            candidateRevision: candidate.candidateRevision,
            state: prior.receipt.state,
          };
        }
        const state = improvementTriageNextState(candidate.state, request.action);
        if (
          !state ||
          candidate.candidateRevision >= Number.MAX_SAFE_INTEGER ||
          candidate.candidateRevision !== request.expectedCandidateRevision
        )
          throw conflict();
        const receipt: ImprovementTriageReceipt = {
          candidateId: candidate.id,
          candidateRevision: candidate.candidateRevision + 1,
          state,
        };
        if (
          !(await tx.commit({
            candidateId: candidate.id,
            expectedRevision: candidate.candidateRevision,
            operationKey: request.operationKey,
            operation: {
              actorUserId: request.actorUserId,
              candidateId: candidate.id,
              expectedCandidateRevision: candidate.candidateRevision,
              action: request.action,
              reasonCode: request.reasonCode,
              receipt: { ...receipt },
            },
          }))
        )
          throw conflict();
        return receipt;
      },
    );
  }
}
