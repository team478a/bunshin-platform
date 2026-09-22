import type {
  BunshinCapabilityAssignment,
  CapabilityAssignmentStatus,
  CapabilityType,
} from '@bunshin/capability-contract';
export type { BunshinCapabilityAssignment } from '@bunshin/capability-contract';
import type {
  AuthProviderType,
  BunshinAggregate,
  BunshinAudience,
  BunshinObjective,
  BunshinPersonality,
  BunshinType,
  PlatformAdmin,
  User,
  Workspace,
  WorkspaceMembership,
  OwnerKnowledge,
  OwnerKnowledgeType,
  BunshinKnowledgeGrant,
  BunshinMemory,
  BunshinMemoryType,
} from '@bunshin/platform-domain';
import { isValidBunshinSlug, normalizeBunshinSlug } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
export * from './configuration-environment';
export * from './ai-provider-configuration';
export * from './admin-email-configuration';
export * from './line-configuration';
export * from './line-notification-preference';
export * from './video-render-job';
export * from './video-ai-scene-generation-job';
export * from './video-render-completion';
export * from './social-image-generation-job';
export * from './social-image-pilot-evidence';
export * from './service-participation';
export * from './service-notification-preference';
export * from './commercial-usage';
export * from './commercial-billing';

export interface ValidationMetricsPeriod {
  from: Date;
  to: Date;
}

export interface ValidationFunnelCounts {
  registrations: number;
  bunshinCreations: number;
  socialActivations: number;
  strategyCompletions: number;
  strategyApprovals: number;
  firstMissionViews: number;
  missionAcceptances: number;
  copies: number;
  posts: number;
  d7ActiveUsers: number;
}

export interface ValidationMetricsSnapshot {
  period: ValidationMetricsPeriod;
  funnel: ValidationFunnelCounts;
  outcomes: {
    postedUsers: number;
    postCount: number;
    feedbackCount: number;
    goodFeedbackCount: number;
    goodFeedbackRate: number | null;
    threePostsInFirstSevenDaysUsers: number;
    eligibleFirstSevenDayUsers: number;
    threePostsInFirstSevenDaysRate: number | null;
    d7EligibleUsers: number;
    d7ActiveRate: number | null;
    aiCalls: number;
    aiSuccessfulCalls: number;
    aiFailedCalls: number;
    aiInputTokens: number;
    aiOutputTokens: number;
    aiPricedCalls: number;
    aiEstimatedCostUsdMicros: number | null;
  };
  assistanceLevels: Array<{
    level: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';
    missions: number;
    viewed: number;
    accepted: number;
    copied: number;
    posted: number;
    feedback: number;
    goodFeedback: number;
    acceptanceRate: number | null;
    copyRate: number | null;
    postRate: number | null;
    goodFeedbackRate: number | null;
  }>;
  personalityLearning: {
    proposed: number;
    approved: number;
    rejected: number;
    revoked: number;
    decided: number;
    adoptionRate: number | null;
    repeatedCorrectionCount: number;
    applications: number;
    cohortTruncated: boolean;
    before: PersonalityLearningOutcomeMetrics;
    after: PersonalityLearningOutcomeMetrics;
  };
}

export interface PersonalityLearningOutcomeMetrics {
  missions: number;
  posted: number;
  postRate: number | null;
  feedback: number;
  goodFeedback: number;
  goodFeedbackRate: number | null;
}

export interface RecordAiUsageInput {
  workspaceId: string;
  bunshinId: string | null;
  actorUserId: string;
  taskType: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: 'SUCCESS' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCostUsdMicros?: number | null;
  pricingVersion?: string | null;
  errorCode?: string | null;
  idempotencyKey: string;
  occurredAt?: Date;
}

export interface AiUsageEventRepository {
  record(input: RecordAiUsageInput): Promise<void>;
}

export class RecordAiUsage {
  constructor(private readonly repository: AiUsageEventRepository) {}

  async execute(input: RecordAiUsageInput) {
    const required = [
      input.taskType,
      input.provider,
      input.model,
      input.promptVersion,
      input.idempotencyKey,
    ];
    if (required.some((value) => value.trim().length === 0))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI usage event');
    if (
      input.latencyMs < 0 ||
      (input.inputTokens !== null && input.inputTokens < 0) ||
      (input.outputTokens !== null && input.outputTokens < 0) ||
      (input.estimatedCostUsdMicros !== undefined &&
        input.estimatedCostUsdMicros !== null &&
        input.estimatedCostUsdMicros < 0)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI usage measurements');
    if (input.status === 'SUCCESS' && input.errorCode)
      throw new ApplicationError('VALIDATION_ERROR', 'successful AI usage cannot have errorCode');
    await this.repository.record(input);
  }
}

export type OrganizationAiReservationResult =
  | { status: 'RESERVED'; reservationId: string }
  | { status: 'ALREADY_RESERVED'; reservationId: string }
  | { status: 'UNLIMITED'; reservationId: null }
  | { status: 'EXHAUSTED'; reservationId: null };

export interface OrganizationAiGenerationReservationRepository {
  reserve(input: {
    workspaceId: string;
    operationKey: string;
    now: Date;
    expiresAt: Date;
  }): Promise<OrganizationAiReservationResult>;
  finish(input: {
    workspaceId: string;
    operationKey: string;
    outcome: 'CONSUMED' | 'RELEASED';
    now: Date;
  }): Promise<boolean>;
}

export class ReserveOrganizationAiGeneration {
  constructor(private readonly repository: OrganizationAiGenerationReservationRepository) {}

  async execute(input: {
    workspaceId: string;
    operationKey: string;
    now?: Date;
    reservationTtlMs?: number;
  }) {
    if (!input.operationKey.trim() || input.operationKey.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI generation operation key');
    const now = input.now ?? new Date();
    const ttl = input.reservationTtlMs ?? 15 * 60 * 1_000;
    if (!Number.isInteger(ttl) || ttl < 60_000 || ttl > 60 * 60 * 1_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI reservation TTL');
    return this.repository.reserve({
      workspaceId: input.workspaceId,
      operationKey: input.operationKey,
      now,
      expiresAt: new Date(now.getTime() + ttl),
    });
  }
}

export class FinishOrganizationAiGeneration {
  constructor(private readonly repository: OrganizationAiGenerationReservationRepository) {}

  execute(input: {
    workspaceId: string;
    operationKey: string;
    outcome: 'CONSUMED' | 'RELEASED';
    now?: Date;
  }) {
    return this.repository.finish({ ...input, now: input.now ?? new Date() });
  }
}

export interface ValidationMetricsRepository {
  summarize(input: {
    workspaceId: string;
    actorUserId: string;
    period: ValidationMetricsPeriod;
  }): Promise<ValidationMetricsSnapshot | null>;
}

export class GetValidationMetrics {
  constructor(private readonly repository: ValidationMetricsRepository) {}

  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    from: Date;
    to: Date;
  }): Promise<ValidationMetricsSnapshot> {
    if (
      Number.isNaN(input.from.getTime()) ||
      Number.isNaN(input.to.getTime()) ||
      input.from >= input.to
    ) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid metrics period');
    }
    const maximumPeriodMs = 366 * 24 * 60 * 60 * 1000;
    if (input.to.getTime() - input.from.getTime() > maximumPeriodMs) {
      throw new ApplicationError('VALIDATION_ERROR', 'metrics period must not exceed 366 days');
    }
    const value = await this.repository.summarize({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      period: { from: input.from, to: input.to },
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'workspace not found');
    return value;
  }
}

export interface CreateUserInput {
  displayName: string;
  email?: string | null;
  identity?: { provider: AuthProviderType; providerUserId: string };
}

export interface CreatedPersonalAccount {
  user: User;
  workspace: Workspace;
  membership: WorkspaceMembership;
}

export interface AccountTransaction {
  createUser(input: CreateUserInput): Promise<User>;
  createAuthIdentity?(input: {
    userId: string;
    provider: AuthProviderType;
    providerUserId: string;
  }): Promise<void>;
  createPersonalWorkspace(input: { ownerUserId: string; name: string }): Promise<Workspace>;
  createOwnerMembership(input: {
    workspaceId: string;
    userId: string;
  }): Promise<WorkspaceMembership>;
}

export interface AccountUnitOfWork {
  transaction<T>(operation: (transaction: AccountTransaction) => Promise<T>): Promise<T>;
}

export class CreateUserWithPersonalWorkspace {
  constructor(private readonly unitOfWork: AccountUnitOfWork) {}

  execute(input: CreateUserInput): Promise<CreatedPersonalAccount> {
    const displayName = input.displayName.trim();
    if (displayName.length === 0 || displayName.length > 100) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'displayName must contain 1 to 100 characters',
      );
    }

    return this.unitOfWork.transaction(async (transaction) => {
      const user = await transaction.createUser({ ...input, displayName });
      if (input.identity !== undefined && transaction.createAuthIdentity !== undefined) {
        await transaction.createAuthIdentity({ userId: user.id, ...input.identity });
      }
      const workspace = await transaction.createPersonalWorkspace({
        ownerUserId: user.id,
        name: `${displayName}のワークスペース`,
      });
      const membership = await transaction.createOwnerMembership({
        workspaceId: workspace.id,
        userId: user.id,
      });
      return { user, workspace, membership };
    });
  }
}

export interface WorkspaceAccessRepository {
  findAccessibleWorkspace(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<Workspace | null>;
  updateWorkspaceName(input: {
    actorUserId: string;
    workspaceId: string;
    name: string;
  }): Promise<Workspace | null>;
}

export async function requireAccessibleWorkspace(
  repository: WorkspaceAccessRepository,
  input: { actorUserId: string; workspaceId: string },
): Promise<Workspace> {
  const workspace = await repository.findAccessibleWorkspace(input);
  if (workspace === null) throw new ApplicationError('NOT_FOUND', 'workspace not found');
  return workspace;
}

export interface PlatformAdminRepository {
  findActivePlatformAdminByUserId(userId: string): Promise<PlatformAdmin | null>;
}

export const LEGAL_DOCUMENT_TYPES = ['TERMS', 'PRIVACY', 'COMMERCE_DISCLOSURE'] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];
export type LegalDocumentStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export interface LegalDocument {
  id: string;
  type: LegalDocumentType;
  version: number;
  title: string;
  content: string;
  status: LegalDocumentStatus;
  effectiveAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface LegalDocumentRepository {
  listForAdmin(actorUserId: string): Promise<LegalDocument[] | null>;
  createDraft(input: {
    actorUserId: string;
    type: LegalDocumentType;
    title: string;
    content: string;
  }): Promise<LegalDocument | null>;
  publish(input: {
    actorUserId: string;
    documentId: string;
    effectiveAt: Date;
  }): Promise<LegalDocument | null>;
  findPublished(type: LegalDocumentType): Promise<LegalDocument | null>;
}
export class ListLegalDocuments {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(actorUserId: string) {
    const values = await this.repository.listForAdmin(actorUserId);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}

export const PRODUCTION_GATE_CHECK_KEYS = [
  'BACKUP_RESTORE',
  'MIGRATION_HEALTH',
  'AUTH_SMOKE',
  'FREE_MVP_SMOKE',
  'ACCOUNT_DELETION_DRY_RUN',
  'LINE_GO_NO_GO',
  'TREND_RESEARCH_SMOKE',
  'EXTERNAL_TRACKING_SMOKE',
  'DAILY_MISSION_LINE_SMOKE',
  'TRACKING_LINK_NOTIFICATION_SMOKE',
  'REFERRAL_SHARE_SMOKE',
  'DUPLICATE_PREVENTION_SMOKE',
  'FINAL_APPROVAL',
] as const;
export type ProductionGateCheckKey = (typeof PRODUCTION_GATE_CHECK_KEYS)[number];
export const PRODUCTION_GATE_REQUIRED_CHECK_KEYS = PRODUCTION_GATE_CHECK_KEYS.filter(
  (key) => key !== 'FINAL_APPROVAL',
);
export interface ProductionGateEvidence {
  id: string;
  environment: 'PRODUCTION';
  checkKey: ProductionGateCheckKey;
  commitSha: string;
  action: 'RECORDED' | 'REVOKED';
  reason: string;
  evidenceUrl: string | null;
  actorUserId: string;
  occurredAt: Date;
}
export function currentProductionGateRecordedChecks(
  events: ReadonlyArray<
    Pick<ProductionGateEvidence, 'checkKey' | 'action'> & { occurredAt: Date | string }
  >,
) {
  const latest = new Map(events.map((event) => [event.checkKey, event] as const));
  const recorded = new Set(
    [...latest].filter(([, event]) => event.action === 'RECORDED').map(([checkKey]) => checkKey),
  );
  const finalApproval = latest.get('FINAL_APPROVAL');
  const finalApprovalTime = finalApproval ? new Date(finalApproval.occurredAt).getTime() : 0;
  const finalApprovalIsCurrent =
    finalApproval?.action === 'RECORDED' &&
    Number.isFinite(finalApprovalTime) &&
    PRODUCTION_GATE_REQUIRED_CHECK_KEYS.every((checkKey) => {
      const event = latest.get(checkKey);
      return (
        event?.action === 'RECORDED' && new Date(event.occurredAt).getTime() <= finalApprovalTime
      );
    });
  if (!finalApprovalIsCurrent) recorded.delete('FINAL_APPROVAL');
  return recorded;
}
export interface ProductionGateEvidenceRepository {
  list(input: {
    actorUserId: string;
    environment: 'PRODUCTION';
    commitSha: string;
  }): Promise<ProductionGateEvidence[] | null>;
  append(
    input: Omit<ProductionGateEvidence, 'id' | 'occurredAt'>,
  ): Promise<ProductionGateEvidence | null>;
}

function validProductionCommit(commitSha: string) {
  return /^[0-9a-f]{40}$/.test(commitSha);
}
function validatedEvidenceUrl(value: string | null | undefined) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence URL');
  if (
    !['github.com', 'vercel.com', 'supabase.com'].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'evidence URL is not allowed');
  return url.toString();
}
export class ListProductionGateEvidence {
  constructor(private readonly repository: ProductionGateEvidenceRepository) {}
  async execute(input: { actorUserId: string; environment: 'PRODUCTION'; commitSha: string }) {
    if (!validProductionCommit(input.commitSha))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid commit SHA');
    const events = await this.repository.list(input);
    if (!events) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return events;
  }
}
export class RecordProductionGateEvidence {
  constructor(private readonly repository: ProductionGateEvidenceRepository) {}
  async execute(input: {
    actorUserId: string;
    environment: 'PRODUCTION';
    commitSha: string;
    checkKey: ProductionGateCheckKey;
    action: 'RECORDED' | 'REVOKED';
    reason: string;
    evidenceUrl?: string | null;
  }) {
    const reason = input.reason.trim();
    if (
      !validProductionCommit(input.commitSha) ||
      !PRODUCTION_GATE_CHECK_KEYS.includes(input.checkKey)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid production gate evidence');
    if (reason.length < 10 || reason.length > 1000)
      throw new ApplicationError('VALIDATION_ERROR', 'reason must be 10 to 1000 characters');
    const result = await this.repository.append({
      ...input,
      reason,
      evidenceUrl: validatedEvidenceUrl(input.evidenceUrl),
    });
    if (!result)
      throw new ApplicationError(
        input.checkKey === 'FINAL_APPROVAL' ? 'CONFLICT' : 'NOT_FOUND',
        input.checkKey === 'FINAL_APPROVAL'
          ? 'all required checks must be current before final approval'
          : 'admin page not found',
      );
    return result;
  }
}
export class CreateLegalDocumentDraft {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(input: {
    actorUserId: string;
    type: LegalDocumentType;
    title: string;
    content: string;
  }) {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!LEGAL_DOCUMENT_TYPES.includes(input.type) || title.length < 1 || title.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid legal document title');
    if (content.length < 1 || content.length > 100_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid legal document content');
    const value = await this.repository.createDraft({ ...input, title, content });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return value;
  }
}
export class PublishLegalDocument {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(input: { actorUserId: string; documentId: string; effectiveAt: Date }) {
    if (Number.isNaN(input.effectiveAt.getTime()))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid effective date');
    const value = await this.repository.publish(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'legal document not found');
    return value;
  }
}

export interface RequiredLegalConsentDocument extends LegalDocument {
  consentedAt: Date | null;
}
export interface LegalConsentRepository {
  findRequiredForUser(userId: string): Promise<RequiredLegalConsentDocument[]>;
  acceptRequired(input: { userId: string; documentIds: string[] }): Promise<boolean>;
  listConsentCountsForAdmin(
    actorUserId: string,
  ): Promise<Array<LegalDocument & { consentCount: number }> | null>;
}
export class GetRequiredLegalConsents {
  constructor(private readonly repository: LegalConsentRepository) {}
  execute(userId: string) {
    return this.repository.findRequiredForUser(userId);
  }
}
export class AcceptRequiredLegalConsents {
  constructor(private readonly repository: LegalConsentRepository) {}
  async execute(input: { userId: string; documentIds: string[] }) {
    if (
      input.documentIds.length === 0 ||
      input.documentIds.length > LEGAL_DOCUMENT_TYPES.length ||
      new Set(input.documentIds).size !== input.documentIds.length
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid legal consent documents');
    const accepted = await this.repository.acceptRequired(input);
    if (!accepted) throw new ApplicationError('CONFLICT', 'legal documents changed; review again');
  }
}
export class ListLegalConsentCounts {
  constructor(private readonly repository: LegalConsentRepository) {}
  async execute(actorUserId: string) {
    const values = await this.repository.listConsentCountsForAdmin(actorUserId);
    if (!values) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}

export interface AccountDeletionRequest {
  id: string;
  userId: string;
  status: 'REQUESTED' | 'PROCESSING' | 'BLOCKED' | 'CANCELLED' | 'COMPLETED';
  requestedAt: Date;
  scheduledFor: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  processingStartedAt: Date | null;
  blockedReason: string | null;
  lastErrorCategory: string | null;
  executionVersion: number;
  summary: unknown;
}
export interface AccountDeletionRequestRepository {
  findCurrent(userId: string): Promise<AccountDeletionRequest | null>;
  request(userId: string, scheduledFor: Date): Promise<AccountDeletionRequest | null>;
  cancel(userId: string): Promise<AccountDeletionRequest | null>;
  listForAdmin(actorUserId: string): Promise<AccountDeletionRequest[] | null>;
}
export class GetAccountDeletionRequest {
  constructor(private readonly repository: AccountDeletionRequestRepository) {}
  execute(userId: string) {
    return this.repository.findCurrent(userId);
  }
}
export class RequestAccountDeletion {
  constructor(
    private readonly repository: AccountDeletionRequestRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(userId: string) {
    const scheduledFor = new Date(this.now().getTime() + 14 * 24 * 60 * 60 * 1000);
    const value = await this.repository.request(userId, scheduledFor);
    if (!value) throw new ApplicationError('CONFLICT', 'account deletion already requested');
    return value;
  }
}
export class CancelAccountDeletion {
  constructor(private readonly repository: AccountDeletionRequestRepository) {}
  async execute(userId: string) {
    const value = await this.repository.cancel(userId);
    if (!value) throw new ApplicationError('NOT_FOUND', 'account deletion request not found');
    return value;
  }
}
export class ListAccountDeletionRequests {
  constructor(private readonly repository: AccountDeletionRequestRepository) {}
  async execute(actorUserId: string) {
    const values = await this.repository.listForAdmin(actorUserId);
    if (!values) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}

export interface JobContext {
  workspaceId: string;
  bunshinId?: string;
  capabilityType?: CapabilityType;
  correlationId: string;
  requestedBy: string;
}

export type JobEnvironment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
export type JobStatus =
  'PENDING' | 'LEASED' | 'RETRY_SCHEDULED' | 'SUCCEEDED' | 'DEAD' | 'CANCELLED';

export interface EnqueueJobInput extends JobContext {
  environment: JobEnvironment;
  jobType: string;
  idempotencyKey: string;
  payloadReference: string;
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: Date;
}

export interface JobReference {
  id: string;
}
export interface JobDispatcher {
  enqueue(input: EnqueueJobInput): Promise<JobReference>;
}

export interface Job extends Required<
  Omit<EnqueueJobInput, 'bunshinId' | 'capabilityType' | 'scheduledAt'>
> {
  id: string;
  bunshinId: string | null;
  capabilityType: CapabilityType | null;
  status: JobStatus;
  scheduledAt: Date;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  nextRetryAt: Date | null;
  lastErrorCategory: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface JobFailure {
  errorCategory: string;
  retryable: boolean;
}

export interface JobRepository {
  enqueue(input: EnqueueJobInput): Promise<Job>;
  claim(input: {
    environment: JobEnvironment;
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<Job | null>;
  complete(input: { jobId: string; workerId: string; now: Date }): Promise<Job | null>;
  fail(input: {
    jobId: string;
    workerId: string;
    now: Date;
    failure: JobFailure;
    nextRetryAt: Date | null;
  }): Promise<Job | null>;
  cancel(input: { jobId: string; environment: JobEnvironment; now: Date }): Promise<Job | null>;
}

const assertJobText = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `${field} is invalid`);
};

export class EnqueueJob implements JobDispatcher {
  constructor(private readonly repository: JobRepository) {}
  async enqueue(input: EnqueueJobInput): Promise<JobReference> {
    assertJobText(input.jobType, 'jobType', 80);
    assertJobText(input.idempotencyKey, 'idempotencyKey', 200);
    assertJobText(input.payloadReference, 'payloadReference', 500);
    if ((input.priority ?? 100) < 0 || (input.maxAttempts ?? 5) < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'job retry policy is invalid');
    const job = await this.repository.enqueue(input);
    return { id: job.id };
  }
}

export class ClaimJob {
  constructor(
    private readonly repository: JobRepository,
    private readonly leaseMilliseconds = 60_000,
    private readonly now = () => new Date(),
  ) {}
  execute(environment: JobEnvironment, workerId: string) {
    assertJobText(workerId, 'workerId', 120);
    const now = this.now();
    return this.repository.claim({
      environment,
      workerId,
      now,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMilliseconds),
    });
  }
}

export class CompleteJob {
  constructor(
    private readonly repository: JobRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(jobId: string, workerId: string) {
    const job = await this.repository.complete({ jobId, workerId, now: this.now() });
    if (!job) throw new ApplicationError('CONFLICT', 'job lease is no longer valid');
    return job;
  }
}

export class FailJob {
  constructor(
    private readonly repository: JobRepository,
    private readonly now = () => new Date(),
    private readonly baseDelayMilliseconds = 30_000,
    private readonly maximumDelayMilliseconds = 3_600_000,
  ) {}
  async execute(job: Job, workerId: string, failure: JobFailure) {
    const now = this.now();
    const exhausted = job.attemptCount >= job.maxAttempts;
    const delay = Math.min(
      this.baseDelayMilliseconds * 2 ** Math.max(job.attemptCount - 1, 0),
      this.maximumDelayMilliseconds,
    );
    const nextRetryAt = failure.retryable && !exhausted ? new Date(now.getTime() + delay) : null;
    const updated = await this.repository.fail({
      jobId: job.id,
      workerId,
      now,
      failure,
      nextRetryAt,
    });
    if (!updated) throw new ApplicationError('CONFLICT', 'job lease is no longer valid');
    return updated;
  }
}

export class CancelJob {
  constructor(
    private readonly repository: JobRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(jobId: string, environment: JobEnvironment) {
    const job = await this.repository.cancel({ jobId, environment, now: this.now() });
    if (!job) throw new ApplicationError('CONFLICT', 'job cannot be cancelled');
    return job;
  }
}

export interface CreateBunshinInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  ownerUserId?: string;
  name: string;
  slug: string;
  type: BunshinType;
  objectiveSummary: string;
  audienceSummary: string;
  personalitySummary: string;
  avatarUrl?: string | null;
  objectives?: Array<
    Omit<BunshinObjective, 'id' | 'bunshinId' | 'status' | 'createdAt' | 'updatedAt'>
  >;
  audiences?: Array<Omit<BunshinAudience, 'id' | 'bunshinId' | 'createdAt' | 'updatedAt'>>;
  personality?: Omit<BunshinPersonality, 'id' | 'bunshinId' | 'createdAt' | 'updatedAt'>;
}

export interface UpdateBunshinInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
  name?: string;
  objectiveSummary?: string;
  audienceSummary?: string;
  personalitySummary?: string;
  avatarUrl?: string | null;
}

export interface ScopedBunshinReference {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
}

export interface BunshinRepository {
  create(input: CreateBunshinInput & { slug: string }): Promise<BunshinAggregate>;
  list(input: { workspaceId: string; actorUserId: string }): Promise<BunshinAggregate[]>;
  listForService(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<BunshinAggregate[]>;
  find(input: ScopedBunshinReference): Promise<BunshinAggregate | null>;
  update(input: UpdateBunshinInput): Promise<BunshinAggregate | null>;
  archive(input: ScopedBunshinReference): Promise<BunshinAggregate | null>;
}

function requiredText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      `${field} must contain 1 to ${maximum} characters`,
    );
  }
  return normalized;
}

function validateStringList(value: string[], field: string): string[] {
  if (value.length > 50 || value.some((item) => item.trim().length === 0 || item.length > 500)) {
    throw new ApplicationError('VALIDATION_ERROR', `${field} contains invalid entries`);
  }
  return value.map((item) => item.trim());
}

function normalizeCreateBunshin(input: CreateBunshinInput): CreateBunshinInput & { slug: string } {
  const slug = normalizeBunshinSlug(input.slug);
  if (!isValidBunshinSlug(slug)) {
    throw new ApplicationError('VALIDATION_ERROR', 'slug format is invalid');
  }
  const objectives = input.objectives?.map((item) => {
    if (!Number.isInteger(item.priority) || item.priority < 1) {
      throw new ApplicationError('VALIDATION_ERROR', 'objective priority must be positive');
    }
    return {
      ...item,
      objectiveType: requiredText(item.objectiveType, 'objectiveType', 80),
      primaryGoal: requiredText(item.primaryGoal, 'primaryGoal', 500),
    };
  });
  if (
    objectives !== undefined &&
    new Set(objectives.map((item) => item.priority)).size !== objectives.length
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'objective priorities must be unique');
  }
  const audiences = input.audiences?.map((item) => ({
    ...item,
    label: requiredText(item.label, 'audience.label', 120),
    painPoints: validateStringList(item.painPoints, 'painPoints'),
    desires: validateStringList(item.desires, 'desires'),
    excludedAudience: validateStringList(item.excludedAudience, 'excludedAudience'),
  }));
  const personality =
    input.personality === undefined
      ? undefined
      : {
          ...input.personality,
          tone: requiredText(input.personality.tone, 'tone', 100),
          forbiddenExpressions: validateStringList(
            input.personality.forbiddenExpressions,
            'forbiddenExpressions',
          ),
          preferredExpressions: validateStringList(
            input.personality.preferredExpressions,
            'preferredExpressions',
          ),
        };
  return {
    ...input,
    slug,
    name: requiredText(input.name, 'name', 100),
    objectiveSummary: requiredText(input.objectiveSummary, 'objectiveSummary', 500),
    audienceSummary: requiredText(input.audienceSummary, 'audienceSummary', 500),
    personalitySummary: requiredText(input.personalitySummary, 'personalitySummary', 500),
    ...(objectives === undefined ? {} : { objectives }),
    ...(audiences === undefined ? {} : { audiences }),
    ...(personality === undefined ? {} : { personality }),
  };
}

export class CreateBunshin {
  constructor(private readonly repository: BunshinRepository) {}
  execute(input: CreateBunshinInput): Promise<BunshinAggregate> {
    return this.repository.create(normalizeCreateBunshin(input));
  }
}

export class ListBunshins {
  constructor(private readonly repository: BunshinRepository) {}
  execute(input: { workspaceId: string; actorUserId: string }): Promise<BunshinAggregate[]> {
    return this.repository.list(input);
  }
}

export class ListServiceBunshins {
  constructor(private readonly repository: BunshinRepository) {}
  execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<BunshinAggregate[]> {
    return this.repository.listForService(input);
  }
}

export class GetBunshin {
  constructor(private readonly repository: BunshinRepository) {}
  async execute(input: ScopedBunshinReference): Promise<BunshinAggregate> {
    const result = await this.repository.find(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return result;
  }
}

export class UpdateBunshinProfile {
  constructor(private readonly repository: BunshinRepository) {}
  async execute(input: UpdateBunshinInput): Promise<BunshinAggregate> {
    const normalized: UpdateBunshinInput = {
      ...input,
      ...(input.name === undefined ? {} : { name: requiredText(input.name, 'name', 100) }),
      ...(input.objectiveSummary === undefined
        ? {}
        : { objectiveSummary: requiredText(input.objectiveSummary, 'objectiveSummary', 500) }),
      ...(input.audienceSummary === undefined
        ? {}
        : { audienceSummary: requiredText(input.audienceSummary, 'audienceSummary', 500) }),
      ...(input.personalitySummary === undefined
        ? {}
        : {
            personalitySummary: requiredText(input.personalitySummary, 'personalitySummary', 500),
          }),
    };
    const result = await this.repository.update(normalized);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return result;
  }
}

export class ArchiveBunshin {
  constructor(private readonly repository: BunshinRepository) {}
  async execute(input: ScopedBunshinReference): Promise<BunshinAggregate> {
    const result = await this.repository.archive(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return result;
  }
}

export interface OwnerKnowledgeRepository {
  create(input: {
    workspaceId: string;
    actorUserId: string;
    type: OwnerKnowledgeType;
    title: string;
    content: string;
  }): Promise<OwnerKnowledge>;
  listOwned(input: { workspaceId: string; actorUserId: string }): Promise<OwnerKnowledge[]>;
  findOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
  }): Promise<OwnerKnowledge | null>;
  updateOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
    title?: string;
    content?: string;
    type?: OwnerKnowledgeType;
  }): Promise<OwnerKnowledge | null>;
  archiveOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
  }): Promise<OwnerKnowledge | null>;
}

export interface KnowledgeGrantRepository {
  grant(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }): Promise<BunshinKnowledgeGrant | null>;
  revoke(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }): Promise<BunshinKnowledgeGrant | null>;
  listGrantedKnowledge(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<OwnerKnowledge[]>;
}

const knowledgeText = (value: string, field: string, maximum: number) =>
  requiredText(value, field, maximum);
export class CreateOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  execute(input: {
    workspaceId: string;
    actorUserId: string;
    type: OwnerKnowledgeType;
    title: string;
    content: string;
  }) {
    return this.repository.create({
      ...input,
      title: knowledgeText(input.title, 'title', 160),
      content: knowledgeText(input.content, 'content', 20000),
    });
  }
}
export class ListOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  execute(input: { workspaceId: string; actorUserId: string }) {
    return this.repository.listOwned(input);
  }
}
export class GetOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; knowledgeId: string }) {
    const value = await this.repository.findOwned(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class UpdateOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
    title?: string;
    content?: string;
    type?: OwnerKnowledgeType;
  }) {
    const normalized = {
      ...input,
      ...(input.title === undefined ? {} : { title: knowledgeText(input.title, 'title', 160) }),
      ...(input.content === undefined
        ? {}
        : { content: knowledgeText(input.content, 'content', 20000) }),
    };
    const value = await this.repository.updateOwned(normalized);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class ArchiveOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; knowledgeId: string }) {
    const value = await this.repository.archiveOwned(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class GrantKnowledgeToBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }) {
    const value = await this.repository.grant(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge grant target not found');
    return value;
  }
}
export class RevokeKnowledgeFromBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }) {
    const value = await this.repository.revoke(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge grant not found');
    return value;
  }
}
export class ListGrantedKnowledgeForBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.repository.listGrantedKnowledge(input);
  }
}

export interface BunshinMemoryRepository {
  create(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    type: BunshinMemoryType;
    content: string;
    summary?: string | null;
    confidence: number;
    importance: number;
  }): Promise<BunshinMemory | null>;
  list(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    includeInactive?: boolean;
  }): Promise<BunshinMemory[]>;
  find(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }): Promise<BunshinMemory | null>;
  update(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    type?: BunshinMemoryType;
    content?: string;
    summary?: string | null;
    confidence?: number;
    importance?: number;
  }): Promise<BunshinMemory | null>;
  setActive(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    active: boolean;
  }): Promise<BunshinMemory | null>;
  softDelete(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }): Promise<BunshinMemory | null>;
}
function validateMemoryValues(input: {
  content: string;
  summary?: string | null;
  confidence: number;
  importance: number;
}) {
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    throw new ApplicationError('VALIDATION_ERROR', 'confidence must be between 0 and 1');
  if (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5)
    throw new ApplicationError('VALIDATION_ERROR', 'importance must be between 1 and 5');
  return {
    content: requiredText(input.content, 'content', 20000),
    summary: input.summary == null ? null : requiredText(input.summary, 'summary', 1000),
    confidence: input.confidence,
    importance: input.importance,
  };
}
export class CreateBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    type: BunshinMemoryType;
    content: string;
    summary?: string | null;
    confidence: number;
    importance: number;
  }) {
    const value = await this.repository.create({ ...input, ...validateMemoryValues(input) });
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}
export class ListBunshinMemories {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    includeInactive?: boolean;
  }) {
    return this.repository.list(input);
  }
}
export class GetBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }) {
    const value = await this.repository.find(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class UpdateBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    type?: BunshinMemoryType;
    content?: string;
    summary?: string | null;
    confidence?: number;
    importance?: number;
  }) {
    const normalized = {
      ...input,
      ...(input.content === undefined
        ? {}
        : { content: requiredText(input.content, 'content', 20000) }),
      ...(input.summary === undefined
        ? {}
        : {
            summary: input.summary === null ? null : requiredText(input.summary, 'summary', 1000),
          }),
    };
    if (
      input.confidence !== undefined &&
      (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'confidence must be between 0 and 1');
    if (
      input.importance !== undefined &&
      (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'importance must be between 1 and 5');
    const value = await this.repository.update(normalized);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class SetBunshinMemoryActive {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    active: boolean;
  }) {
    const value = await this.repository.setActive(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class DeleteBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }) {
    const value = await this.repository.softDelete(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}

export interface BunshinCapabilityAssignmentRepository {
  assign(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }): Promise<BunshinCapabilityAssignment | null>;
  list(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }): Promise<BunshinCapabilityAssignment[] | null>;
  find(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }): Promise<BunshinCapabilityAssignment | null>;
  setStatus(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
    status: Extract<CapabilityAssignmentStatus, 'ACTIVE' | 'SUSPENDED'>;
  }): Promise<BunshinCapabilityAssignment | null>;
}

export class AssignCapabilityToBunshin {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }) {
    const value = await this.repository.assign(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}

export class ListBunshinCapabilityAssignments {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    const values = await this.repository.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class ActivateBunshinCapability {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }) {
    const value = await this.repository.setStatus({ ...input, status: 'ACTIVE' });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'capability assignment not found');
    return value;
  }
}

export class SuspendBunshinCapability {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }) {
    const value = await this.repository.setStatus({ ...input, status: 'SUSPENDED' });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'capability assignment not found');
    return value;
  }
}

export class RequireActiveBunshinCapability {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }) {
    const value = await this.repository.find(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'capability assignment not found');
    if (value.status !== 'ACTIVE') {
      throw new ApplicationError('FORBIDDEN', 'capability is not active');
    }
    return value;
  }
}

export * from './mission-automation-jobs';
export * from './job-worker';
export * from './line-messaging-core';
export * from './line-connection-core';
export * from './line-delivery-job';
export * from './line-admin-observability';
export * from './line-delivery-admin-retry';
export * from './line-admin-funnel';
export * from './line-operational-readiness';
export * from './account-deletion-execution';
export * from './admin-operations';
export * from './activity-continuity-rules';
export * from './admin-alert-center';
export * from './admin-audit-log';
export * from './trend-operations';
export * from './trend-research-jobs';
export * from './external-tracking-links';
export * from './external-link-placement';
export * from './generation-context';
export * from './personality-version';
export * from './personality-learning';
export * from './personality-learning-jobs';
export * from './memory-selector';
export * from './group-participation';
export * from './group-feature-entitlement';
export * from './product-pack';
export * from './advertising-safety';
export * from './campaign-participation';
export * from './campaign-safety-validation';
export * from './video-core';
export * from './video-delivery';
export * from './video-ai-scene-generation';
export * from './video-assets';
export * from './video-render-operations';
export * from './video-disclosure-policy';
export * from './social-image-generation-core';
export * from './social-image-templates';
export * from './group-line-configuration';
export * from './group-line-webhook';
export * from './point-core';
export * from './point-activity-processor';
export * from './point-redemption';
export * from './point-expiration';
export * from './point-balance-reconciliation';
export * from './badge-core';
export * from './badge-common-processor';
export * from './badge-user-experience';
export * from './badge-line-notification';
export * from './badge-line-delivery-job';
export * from './badge-line-admin-retry';
export * from './badge-line-reconciliation';
export * from './badge-group-workflow';
export * from './badge-reward';
export * from './badge-entitlement-consumption';
export * from './group-knowledge';
export * from './group-knowledge-extraction-job';
export * from './badge-reward-operations';
export * from './service-foundation';
export * from './service-staff-role';
export * from './program-core';
export * from './program-commerce';
export * from './program-definition';
export * from './program-definition-presets';
export * from './program-runtime';
export * from './program-next-action';
export * from './program-goals-core';
export * from './ai-character-profile';
export * from './service-line-broadcast';
export * from './service-line-broadcast-job';
export * from './service-referral-credit';
export * from './service-credit-consumption';
export * from './service-credit-expiration';
export * from './service-credit-adjustment';
export * from './service-referral-reward';
export * from './service-referral-reward-rules';
export * from './service-referral-content';
export * from './member-product-content';
export * from './member-product-activity';
export * from './business-growth-actions';
export * from './business-growth-program';
export * from './business-sns-diagnosis';
