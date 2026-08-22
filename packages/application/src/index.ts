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
}

export interface RecordAiUsageInput {
  workspaceId: string;
  bunshinId: string;
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

export const LINE_CONFIGURATION_ENVIRONMENTS = ['DEVELOPMENT', 'STAGING', 'PRODUCTION'] as const;
export type LineConfigurationEnvironment = (typeof LINE_CONFIGURATION_ENVIRONMENTS)[number];
export type LineConfigurationStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export interface LineChannelConfiguration {
  id: string;
  environment: LineConfigurationEnvironment;
  version: number;
  status: LineConfigurationStatus;
  loginChannelId: string;
  loginSecretMask: string;
  messagingChannelId: string;
  messagingSecretMask: string;
  accessTokenMask: string;
  liffId: string | null;
  defaultNotificationTime: string;
  defaultTimezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  globallyPaused: boolean;
  quotaWarningPercent: number;
  quotaLowPriorityStop: number;
  keyVersion: number;
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface EncryptedLineSecrets {
  loginSecret: string;
  messagingSecret: string;
  accessToken: string;
  loginSecretMask: string;
  messagingSecretMask: string;
  accessTokenMask: string;
  keyVersion: number;
}
export interface LineConfigurationRepository {
  listForAdmin(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<LineChannelConfiguration[] | null>;
  createVersion(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    loginChannelId: string;
    messagingChannelId: string;
    liffId: string | null;
    defaultNotificationTime: string;
    defaultTimezone: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    globallyPaused: boolean;
    quotaWarningPercent: number;
    quotaLowPriorityStop: number;
    secrets: EncryptedLineSecrets;
  }): Promise<LineChannelConfiguration | null>;
  activate(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<LineChannelConfiguration | null>;
  getForConnectionTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{
    configuration: LineChannelConfiguration;
    loginSecret: string;
    messagingSecret: string;
    accessToken: string;
  } | null>;
  recordConnectionTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    success: boolean;
    errorCategory: string | null;
  }): Promise<void>;
}
export interface LineSecretCryptoPort {
  encryptSecrets(input: {
    loginSecret: string;
    messagingSecret: string;
    accessToken: string;
  }): EncryptedLineSecrets;
  decrypt(value: string): string;
}
export interface LineConnectionTestPort {
  validate(input: {
    loginChannelId: string;
    loginChannelSecret: string;
    messagingChannelId: string;
    messagingChannelSecret: string;
    channelAccessToken: string;
    callbackUrl: string;
  }): Promise<{ success: boolean; errorCategory: string | null; botDisplayName: string | null }>;
}
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
export class ListLineConfigurations {
  constructor(private readonly repository: LineConfigurationRepository) {}
  async execute(actorUserId: string, environment: LineConfigurationEnvironment) {
    const values = await this.repository.listForAdmin({ actorUserId, environment });
    if (values === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}
export class CreateLineConfigurationVersion {
  constructor(
    private readonly repository: LineConfigurationRepository,
    private readonly crypto: LineSecretCryptoPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    loginChannelId: string;
    loginChannelSecret: string;
    messagingChannelId: string;
    messagingChannelSecret: string;
    channelAccessToken: string;
    liffId?: string | null;
    defaultNotificationTime: string;
    defaultTimezone: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    globallyPaused: boolean;
    quotaWarningPercent: number;
    quotaLowPriorityStop: number;
  }) {
    if (!LINE_CONFIGURATION_ENVIRONMENTS.includes(input.environment))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid environment');
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    if (
      ![input.defaultNotificationTime, input.quietHoursStart, input.quietHoursEnd].every((v) =>
        timePattern.test(v),
      )
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid time');
    if (
      !input.loginChannelId.trim() ||
      !input.messagingChannelId.trim() ||
      input.defaultTimezone.trim().length < 1
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid configuration');
    if (
      input.quotaWarningPercent < 1 ||
      input.quotaLowPriorityStop > 100 ||
      input.quotaWarningPercent >= input.quotaLowPriorityStop
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid quota thresholds');
    const secrets = this.crypto.encryptSecrets({
      loginSecret: input.loginChannelSecret,
      messagingSecret: input.messagingChannelSecret,
      accessToken: input.channelAccessToken,
    });
    const value = await this.repository.createVersion({
      actorUserId: input.actorUserId,
      environment: input.environment,
      reason,
      loginChannelId: input.loginChannelId.trim(),
      messagingChannelId: input.messagingChannelId.trim(),
      liffId: input.liffId?.trim() || null,
      defaultNotificationTime: input.defaultNotificationTime,
      defaultTimezone: input.defaultTimezone.trim(),
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
      globallyPaused: input.globallyPaused,
      quotaWarningPercent: input.quotaWarningPercent,
      quotaLowPriorityStop: input.quotaLowPriorityStop,
      secrets,
    });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}
export class ActivateLineConfiguration {
  constructor(private readonly repository: LineConfigurationRepository) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    const value = await this.repository.activate({ ...input, reason });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}
export class TestLineConfigurationConnection {
  constructor(
    private readonly repository: LineConfigurationRepository,
    private readonly crypto: LineSecretCryptoPort,
    private readonly provider: LineConnectionTestPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    callbackUrl: string;
  }) {
    const stored = await this.repository.getForConnectionTest(input);
    if (stored === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    let result: { success: boolean; errorCategory: string | null; botDisplayName: string | null };
    try {
      result = await this.provider.validate({
        loginChannelId: stored.configuration.loginChannelId,
        loginChannelSecret: this.crypto.decrypt(stored.loginSecret),
        messagingChannelId: stored.configuration.messagingChannelId,
        messagingChannelSecret: this.crypto.decrypt(stored.messagingSecret),
        channelAccessToken: this.crypto.decrypt(stored.accessToken),
        callbackUrl: input.callbackUrl,
      });
    } catch {
      result = { success: false, errorCategory: 'PROVIDER_UNAVAILABLE', botDisplayName: null };
    }
    await this.repository.recordConnectionTest({
      actorUserId: input.actorUserId,
      configurationId: input.configurationId,
      environment: input.environment,
      success: result.success,
      errorCategory: result.errorCategory,
    });
    return result;
  }
}

export const LINE_NOTIFICATION_FREQUENCIES = ['DAILY', 'WEEKDAYS'] as const;
export type LineNotificationFrequency = (typeof LINE_NOTIFICATION_FREQUENCIES)[number];

export interface LineNotificationPreference {
  id: string;
  workspaceId: string;
  userId: string;
  bunshinId: string;
  enabled: boolean;
  notificationConsentAt: Date | null;
  localTime: string;
  timezone: string;
  frequency: LineNotificationFrequency;
  quietHoursStart: string;
  quietHoursEnd: string;
  pausedUntil: Date | null;
  reminderEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineNotificationPreferenceRepository {
  getScoped(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<{ accessible: boolean; preference: LineNotificationPreference | null }>;
  upsert(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    enabled: boolean;
    consentGranted: boolean;
    localTime: string;
    timezone: string;
    frequency: LineNotificationFrequency;
    quietHoursStart: string;
    quietHoursEnd: string;
    pausedUntil: Date | null;
    reminderEnabled: boolean;
  }): Promise<LineNotificationPreference | null>;
}

export const defaultLineNotificationPreference = (input: {
  workspaceId: string;
  userId: string;
  bunshinId: string;
}): LineNotificationPreference => ({
  id: '',
  ...input,
  enabled: false,
  notificationConsentAt: null,
  localTime: '08:00',
  timezone: 'Asia/Tokyo',
  frequency: 'DAILY',
  quietHoursStart: '21:00',
  quietHoursEnd: '07:00',
  pausedUntil: null,
  reminderEnabled: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

function validateLineNotificationPreference(input: {
  enabled: boolean;
  consentGranted: boolean;
  localTime: string;
  timezone: string;
  frequency: LineNotificationFrequency;
  quietHoursStart: string;
  quietHoursEnd: string;
  pausedUntil: Date | null;
}) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (![input.localTime, input.quietHoursStart, input.quietHoursEnd].every((v) => time.test(v)))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid notification time');
  if (input.quietHoursStart === input.quietHoursEnd)
    throw new ApplicationError('VALIDATION_ERROR', 'quiet hours must have a duration');
  if (!LINE_NOTIFICATION_FREQUENCIES.includes(input.frequency))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid notification frequency');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid timezone', error);
  }
  if (input.enabled && !input.consentGranted)
    throw new ApplicationError('VALIDATION_ERROR', 'notification consent is required');
  if (input.pausedUntil !== null && Number.isNaN(input.pausedUntil.getTime()))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid pause date');
}

export class GetLineNotificationPreference {
  constructor(private readonly repository: LineNotificationPreferenceRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const result = await this.repository.getScoped(input);
    if (!result.accessible) throw new ApplicationError('NOT_FOUND', 'Bunshin not found');
    return (
      result.preference ??
      defaultLineNotificationPreference({
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        bunshinId: input.bunshinId,
      })
    );
  }
}

export class UpdateLineNotificationPreference {
  constructor(private readonly repository: LineNotificationPreferenceRepository) {}
  async execute(input: Parameters<LineNotificationPreferenceRepository['upsert']>[0]) {
    validateLineNotificationPreference(input);
    const result = await this.repository.upsert(input);
    if (!result) throw new ApplicationError('NOT_FOUND', 'Bunshin not found');
    return result;
  }
}

export function isLineNotificationSuppressed(
  preference: LineNotificationPreference,
  at: Date,
): boolean {
  if (!preference.enabled || preference.notificationConsentAt === null) return true;
  if (preference.pausedUntil && preference.pausedUntil.getTime() > at.getTime()) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: preference.timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (preference.frequency === 'WEEKDAYS' && ['Sat', 'Sun'].includes(value['weekday'] ?? ''))
    return true;
  const local = `${value['hour']}:${value['minute']}`;
  const { quietHoursStart: start, quietHoursEnd: end } = preference;
  return start < end ? local >= start && local < end : local >= start || local < end;
}

export const LEGAL_DOCUMENT_TYPES = ['TERMS', 'PRIVACY'] as const;
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
  status: 'REQUESTED' | 'CANCELLED' | 'COMPLETED';
  requestedAt: Date;
  scheduledFor: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
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
  actorUserId: string;
  bunshinId: string;
}

export interface BunshinRepository {
  create(input: CreateBunshinInput & { slug: string }): Promise<BunshinAggregate>;
  list(input: { workspaceId: string; actorUserId: string }): Promise<BunshinAggregate[]>;
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
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }): Promise<BunshinCapabilityAssignment | null>;
  list(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<BunshinCapabilityAssignment[] | null>;
  find(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }): Promise<BunshinCapabilityAssignment | null>;
  setStatus(input: {
    workspaceId: string;
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
  async execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const values = await this.repository.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class ActivateBunshinCapability {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
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
