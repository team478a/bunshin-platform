export type { BunshinCapabilityAssignment } from '@bunshin/capability-contract';
import type {
  AuthProviderType,
  PlatformAdmin,
  User,
  Workspace,
  WorkspaceMembership,
} from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
export * from './configuration-environment';
export * from './ai-provider-configuration';
export * from './admin-email-configuration';
export * from './line-configuration';
export * from './line-notification-preference';
export * from './legal-governance';
export * from './account-deletion';
export * from './job-runtime';
export * from './bunshin-management';
export * from './owner-knowledge';
export * from './bunshin-memory';
export * from './bunshin-capability-assignment';
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
