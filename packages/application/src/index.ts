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
export * from './video-render-job';
export * from './video-render-completion';
export * from './social-image-generation-job';

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

export const AI_PROVIDER_KEYS = ['OPENAI', 'GROK', 'EXA', 'FIRECRAWL', 'CREATOMATE'] as const;
export type AiProviderKey = (typeof AI_PROVIDER_KEYS)[number];
export type AiProviderConfigurationStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export interface AiProviderConfiguration {
  id: string;
  environment: LineConfigurationEnvironment;
  provider: AiProviderKey;
  version: number;
  status: AiProviderConfigurationStatus;
  apiKeyConfigured: boolean;
  apiKeyMask: string | null;
  model: string | null;
  dailyBudgetUsdMicros: number;
  monthlyBudgetUsdMicros: number;
  requestCostUsdMicros?: number;
  globallyPaused: boolean;
  keyVersion: number;
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface EncryptedAiProviderApiKey {
  encryptedValue: string;
  mask: string;
  keyVersion: number;
}
export interface AiProviderSecretCryptoPort {
  encrypt(value: string): EncryptedAiProviderApiKey;
  decrypt(value: string): string;
}
export interface AiProviderConnectionTestPort {
  validate(input: { provider: AiProviderKey; apiKey: string; model: string | null }): Promise<{
    success: boolean;
    errorCategory: string | null;
  }>;
}
export interface AiProviderConfigurationRepository {
  listForAdmin(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<AiProviderConfiguration[] | null>;
  createVersion(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    reason: string;
    model: string | null;
    dailyBudgetUsdMicros: number;
    monthlyBudgetUsdMicros: number;
    requestCostUsdMicros?: number;
    apiKey: EncryptedAiProviderApiKey | null;
  }): Promise<AiProviderConfiguration | null>;
  getForConnectionTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{ configuration: AiProviderConfiguration; encryptedApiKey: string } | null>;
  recordConnectionTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    success: boolean;
    errorCategory: string | null;
  }): Promise<void>;
  activate(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<AiProviderConfiguration | null>;
  pause(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<AiProviderConfiguration | null>;
  getActiveForRuntime(input: {
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    dailyFrom: Date;
    monthlyFrom: Date;
    now: Date;
  }): Promise<{
    configuration: AiProviderConfiguration;
    encryptedApiKey: string;
    dailySpentUsdMicros: number;
    monthlySpentUsdMicros: number;
  } | null>;
}

export class ListAiProviderConfigurations {
  constructor(private readonly repository: AiProviderConfigurationRepository) {}
  async execute(actorUserId: string, environment: LineConfigurationEnvironment) {
    const values = await this.repository.listForAdmin({ actorUserId, environment });
    if (values === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}

export class CreateAiProviderConfigurationVersion {
  constructor(
    private readonly repository: AiProviderConfigurationRepository,
    private readonly crypto: AiProviderSecretCryptoPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    reason: string;
    model?: string | null;
    dailyBudgetUsdMicros: number;
    monthlyBudgetUsdMicros: number;
    requestCostUsdMicros?: number;
    apiKey?: string | null;
  }) {
    if (!LINE_CONFIGURATION_ENVIRONMENTS.includes(input.environment))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid environment');
    if (!AI_PROVIDER_KEYS.includes(input.provider))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid provider');
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    const model = input.model?.trim() || null;
    if (['OPENAI', 'GROK'].includes(input.provider) && model === null)
      throw new ApplicationError('VALIDATION_ERROR', 'AI model is required');
    if (!['OPENAI', 'GROK'].includes(input.provider) && model !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'model is not supported for this provider');
    if (
      !Number.isSafeInteger(input.dailyBudgetUsdMicros) ||
      !Number.isSafeInteger(input.monthlyBudgetUsdMicros) ||
      input.dailyBudgetUsdMicros < 0 ||
      input.monthlyBudgetUsdMicros < input.dailyBudgetUsdMicros ||
      !Number.isSafeInteger(input.requestCostUsdMicros ?? 0) ||
      (input.requestCostUsdMicros ?? 0) < 0
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid budget');
    const rawApiKey = input.apiKey?.trim() || null;
    const value = await this.repository.createVersion({
      actorUserId: input.actorUserId,
      environment: input.environment,
      provider: input.provider,
      reason,
      model,
      dailyBudgetUsdMicros: input.dailyBudgetUsdMicros,
      monthlyBudgetUsdMicros: input.monthlyBudgetUsdMicros,
      requestCostUsdMicros: input.requestCostUsdMicros ?? 0,
      apiKey: rawApiKey === null ? null : this.crypto.encrypt(rawApiKey),
    });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}

const validatedAdminReason = (value: string) => {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
  return reason;
};

export class TestAiProviderConfigurationConnection {
  constructor(
    private readonly repository: AiProviderConfigurationRepository,
    private readonly crypto: AiProviderSecretCryptoPort,
    private readonly provider: AiProviderConnectionTestPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }) {
    const stored = await this.repository.getForConnectionTest(input);
    if (stored === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    let result: { success: boolean; errorCategory: string | null };
    try {
      result = await this.provider.validate({
        provider: stored.configuration.provider,
        apiKey: this.crypto.decrypt(stored.encryptedApiKey),
        model: stored.configuration.model,
      });
    } catch {
      result = { success: false, errorCategory: 'PROVIDER_UNAVAILABLE' };
    }
    await this.repository.recordConnectionTest({ ...input, ...result });
    return result;
  }
}

export class ActivateAiProviderConfiguration {
  constructor(private readonly repository: AiProviderConfigurationRepository) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const value = await this.repository.activate({
      ...input,
      reason: validatedAdminReason(input.reason),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}

export class PauseAiProviderConfiguration {
  constructor(private readonly repository: AiProviderConfigurationRepository) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const value = await this.repository.pause({
      ...input,
      reason: validatedAdminReason(input.reason),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}

export class ResolveAiProviderRuntimeConfiguration {
  constructor(private readonly repository: AiProviderConfigurationRepository) {}
  async execute(input: {
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const dailyFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthlyFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const value = await this.repository.getActiveForRuntime({
      ...input,
      now,
      dailyFrom,
      monthlyFrom,
    });
    if (value === null)
      throw new ApplicationError('CONFIGURATION_ERROR', 'active provider configuration required');
    const { configuration } = value;
    if (
      configuration.environment !== input.environment ||
      configuration.provider !== input.provider
    )
      throw new ApplicationError('CONFIGURATION_ERROR', 'provider configuration scope mismatch');
    if (configuration.status !== 'ACTIVE' || configuration.globallyPaused)
      throw new ApplicationError('CONFIGURATION_ERROR', 'provider is paused');
    if (configuration.lastVerifiedAt === null || configuration.lastErrorCategory !== null)
      throw new ApplicationError('CONFIGURATION_ERROR', 'verified provider configuration required');
    if (value.dailySpentUsdMicros >= configuration.dailyBudgetUsdMicros)
      throw new ApplicationError('CONFLICT', 'daily provider budget reached');
    if (value.monthlySpentUsdMicros >= configuration.monthlyBudgetUsdMicros)
      throw new ApplicationError('CONFLICT', 'monthly provider budget reached');
    return value;
  }
}

export type AdminEmailConfigurationStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export interface AdminEmailConfiguration {
  id: string;
  environment: LineConfigurationEnvironment;
  version: number;
  status: AdminEmailConfigurationStatus;
  apiKeyMask: string;
  fromEmail: string;
  recipientEmails: string[];
  globallyPaused: boolean;
  keyVersion: number;
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface EncryptedAdminEmailApiKey {
  encryptedValue: string;
  mask: string;
  keyVersion: number;
}
export interface AdminEmailSecretCryptoPort {
  encrypt(value: string): EncryptedAdminEmailApiKey;
  decrypt(value: string): string;
}
export interface AdminEmailConnectionTestPort {
  sendTest(input: { apiKey: string; fromEmail: string; recipientEmails: string[] }): Promise<{
    success: boolean;
    errorCategory: string | null;
  }>;
}
export interface AdminEmailConfigurationRepository {
  list(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<AdminEmailConfiguration[] | null>;
  create(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    apiKey: EncryptedAdminEmailApiKey;
    fromEmail: string;
    recipientEmails: string[];
  }): Promise<AdminEmailConfiguration | null>;
  forTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{ configuration: AdminEmailConfiguration; encryptedApiKey: string } | null>;
  recordTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    success: boolean;
    errorCategory: string | null;
  }): Promise<void>;
  activate(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<AdminEmailConfiguration | null>;
  pause(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<AdminEmailConfiguration | null>;
  active(input: {
    environment: LineConfigurationEnvironment;
  }): Promise<{ configuration: AdminEmailConfiguration; encryptedApiKey: string } | null>;
  hasConfiguration(input: { environment: LineConfigurationEnvironment }): Promise<boolean>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export class ListAdminEmailConfigurations {
  constructor(private readonly repository: AdminEmailConfigurationRepository) {}
  async execute(actorUserId: string, environment: LineConfigurationEnvironment) {
    const value = await this.repository.list({ actorUserId, environment });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return value;
  }
}
export class CreateAdminEmailConfiguration {
  constructor(
    private readonly repository: AdminEmailConfigurationRepository,
    private readonly crypto: AdminEmailSecretCryptoPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    apiKey: string;
    fromEmail: string;
    recipientEmails: string[];
  }) {
    const reason = validatedAdminReason(input.reason);
    const fromEmail = input.fromEmail.trim().toLowerCase();
    const recipientEmails = [
      ...new Set(input.recipientEmails.map((value) => value.trim().toLowerCase()).filter(Boolean)),
    ];
    if (
      !emailPattern.test(fromEmail) ||
      recipientEmails.length < 1 ||
      recipientEmails.length > 10 ||
      recipientEmails.some((value) => !emailPattern.test(value))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid email configuration');
    if (input.apiKey.trim().length < 16)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid API key');
    const value = await this.repository.create({
      ...input,
      reason,
      fromEmail,
      recipientEmails,
      apiKey: this.crypto.encrypt(input.apiKey.trim()),
    });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}
export class TestAdminEmailConfiguration {
  constructor(
    private readonly repository: AdminEmailConfigurationRepository,
    private readonly crypto: AdminEmailSecretCryptoPort,
    private readonly provider: AdminEmailConnectionTestPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }) {
    const stored = await this.repository.forTest(input);
    if (stored === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    let result: { success: boolean; errorCategory: string | null };
    try {
      result = await this.provider.sendTest({
        apiKey: this.crypto.decrypt(stored.encryptedApiKey),
        fromEmail: stored.configuration.fromEmail,
        recipientEmails: stored.configuration.recipientEmails,
      });
    } catch {
      result = { success: false, errorCategory: 'PROVIDER_UNAVAILABLE' };
    }
    await this.repository.recordTest({ ...input, ...result });
    return result;
  }
}
export class ActivateAdminEmailConfiguration {
  constructor(private readonly repository: AdminEmailConfigurationRepository) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const value = await this.repository.activate({
      ...input,
      reason: validatedAdminReason(input.reason),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}
export class PauseAdminEmailConfiguration {
  constructor(private readonly repository: AdminEmailConfigurationRepository) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const value = await this.repository.pause({
      ...input,
      reason: validatedAdminReason(input.reason),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}

export const LINE_CONFIGURATION_ENVIRONMENTS = ['DEVELOPMENT', 'STAGING', 'PRODUCTION'] as const;
export type LineConfigurationEnvironment = (typeof LINE_CONFIGURATION_ENVIRONMENTS)[number];
export type LineConfigurationStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export const LINE_RICH_MENU_ACTIONS = [
  'OPEN_TODAY',
  'OPEN_BUNSHINS',
  'OPEN_NOTIFICATION_SETTINGS',
  'OPEN_ACCOUNT',
] as const;
export type LineRichMenuAction = (typeof LINE_RICH_MENU_ACTIONS)[number];
export type LineRichMenuStatus = 'DRAFT' | 'VERIFIED' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export interface LineRichMenuArea {
  action: LineRichMenuAction;
  x: number;
  y: number;
  width: number;
  height: number;
  sortOrder: number;
}
export interface LineRichMenu {
  id: string;
  environment: LineConfigurationEnvironment;
  version: number;
  name: string;
  description: string | null;
  status: LineRichMenuStatus;
  imageObjectKey: string;
  imageSha256: string;
  imageContentType: string;
  imageWidth: number;
  imageHeight: number;
  lineRichMenuId: string | null;
  lastSyncedAt: Date | null;
  lastErrorCategory: string | null;
  areas: LineRichMenuArea[];
  createdAt: Date;
  updatedAt: Date;
}
export interface LineRichMenuRepository {
  listForAdmin(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<LineRichMenu[] | null>;
  getForPublish(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    operation: 'PUBLISH' | 'DISABLE';
  }): Promise<LineRichMenu | null>;
  createDraft(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    name: string;
    description: string | null;
    imageObjectKey: string;
    imageSha256: string;
    imageContentType: string;
    imageWidth: number;
    imageHeight: number;
    areas: LineRichMenuArea[];
  }): Promise<LineRichMenu | null>;
  markVerified(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<LineRichMenu | null>;
  activate(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    lineRichMenuId: string;
    syncedAt: Date;
  }): Promise<LineRichMenu | null>;
  disable(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    syncedAt: Date;
  }): Promise<LineRichMenu | null>;
}
export interface LineRichMenuProviderPort {
  publish(input: {
    menu: LineRichMenu;
    idempotencyKey: string;
  }): Promise<{ lineRichMenuId: string }>;
  disable(input: { lineRichMenuId: string; idempotencyKey: string }): Promise<void>;
}

function richMenuReason(value: string) {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
  return reason;
}
function validateRichMenuAreas(areas: LineRichMenuArea[], width: number, height: number) {
  if (areas.length !== 4 || new Set(areas.map((item) => item.action)).size !== 4)
    throw new ApplicationError('VALIDATION_ERROR', 'all rich menu actions are required');
  if (areas.some((item) => !LINE_RICH_MENU_ACTIONS.includes(item.action)))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rich menu action');
  for (const area of areas) {
    if (![area.x, area.y, area.width, area.height, area.sortOrder].every(Number.isSafeInteger))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rich menu area');
    if (
      area.x < 0 ||
      area.y < 0 ||
      area.width < 1 ||
      area.height < 1 ||
      area.x + area.width > width ||
      area.y + area.height > height
    )
      throw new ApplicationError('VALIDATION_ERROR', 'rich menu area is outside image');
  }
  for (let left = 0; left < areas.length; left += 1) {
    for (let right = left + 1; right < areas.length; right += 1) {
      const a = areas[left]!;
      const b = areas[right]!;
      if (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      )
        throw new ApplicationError('VALIDATION_ERROR', 'rich menu areas overlap');
    }
  }
}
export class CreateLineRichMenuDraft {
  constructor(private readonly repository: LineRichMenuRepository) {}
  async execute(input: Parameters<LineRichMenuRepository['createDraft']>[0]) {
    if (!LINE_CONFIGURATION_ENVIRONMENTS.includes(input.environment))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid environment');
    const name = input.name.trim();
    if (name.length < 1 || name.length > 120 || !/^[a-f0-9]{64}$/.test(input.imageSha256))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rich menu');
    if (
      !['image/png', 'image/jpeg'].includes(input.imageContentType) ||
      input.imageWidth !== 2500 ||
      ![843, 1686].includes(input.imageHeight)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rich menu image');
    if (
      !input.imageObjectKey.startsWith(`${input.environment.toLowerCase()}/line-rich-menus/`) ||
      input.imageObjectKey.includes('..')
    )
      throw new ApplicationError('VALIDATION_ERROR', 'unsafe image object key');
    validateRichMenuAreas(input.areas, input.imageWidth, input.imageHeight);
    const value = await this.repository.createDraft({
      ...input,
      name,
      description: input.description?.trim() || null,
      reason: richMenuReason(input.reason),
    });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}
export class VerifyLineRichMenu {
  constructor(private readonly repository: LineRichMenuRepository) {}
  async execute(input: Parameters<LineRichMenuRepository['markVerified']>[0]) {
    const value = await this.repository.markVerified({
      ...input,
      reason: richMenuReason(input.reason),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'rich menu not found');
    return value;
  }
}
export class ListLineRichMenus {
  constructor(private readonly repository: LineRichMenuRepository) {}
  async execute(input: Parameters<LineRichMenuRepository['listForAdmin']>[0]) {
    const value = await this.repository.listForAdmin(input);
    if (value === null) throw new ApplicationError('FORBIDDEN', 'admin required');
    return value;
  }
}
export class PublishLineRichMenu {
  constructor(
    private readonly repository: LineRichMenuRepository,
    private readonly provider: LineRichMenuProviderPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const reason = richMenuReason(input.reason);
    const menu = await this.repository.getForPublish({ ...input, operation: 'PUBLISH' });
    if (menu === null) throw new ApplicationError('NOT_FOUND', 'verified rich menu not found');
    if (menu.status !== 'VERIFIED' && menu.status !== 'ACTIVE')
      throw new ApplicationError('CONFLICT', 'rich menu must be verified');
    const idempotencyKey = `LINE_RICH_MENU_PUBLISH:${menu.environment}:${menu.id}:${menu.version}`;
    const published = await this.provider.publish({ menu, idempotencyKey });
    const value = await this.repository.activate({
      ...input,
      reason,
      lineRichMenuId: published.lineRichMenuId,
      syncedAt: new Date(),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'rich menu not found');
    return value;
  }
}
export class DisableLineRichMenu {
  constructor(
    private readonly repository: LineRichMenuRepository,
    private readonly provider: LineRichMenuProviderPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const reason = richMenuReason(input.reason);
    const menu = await this.repository.getForPublish({ ...input, operation: 'DISABLE' });
    if (menu === null || menu.status !== 'ACTIVE' || menu.lineRichMenuId === null)
      throw new ApplicationError('NOT_FOUND', 'published rich menu not found');
    await this.provider.disable({
      lineRichMenuId: menu.lineRichMenuId,
      idempotencyKey: `LINE_RICH_MENU_DISABLE:${menu.environment}:${menu.id}:${menu.version}`,
    });
    const value = await this.repository.disable({
      ...input,
      reason,
      syncedAt: new Date(),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'rich menu not found');
    return value;
  }
}
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

export const PRODUCTION_GATE_CHECK_KEYS = [
  'BACKUP_RESTORE',
  'MIGRATION_HEALTH',
  'AUTH_SMOKE',
  'FREE_MVP_SMOKE',
  'ACCOUNT_DELETION_DRY_RUN',
  'LINE_GO_NO_GO',
  'TREND_RESEARCH_SMOKE',
  'EXTERNAL_TRACKING_SMOKE',
  'FINAL_APPROVAL',
] as const;
export type ProductionGateCheckKey = (typeof PRODUCTION_GATE_CHECK_KEYS)[number];
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
export * from './memory-selector';
export * from './group-participation';
export * from './group-feature-entitlement';
export * from './product-pack';
export * from './advertising-safety';
export * from './campaign-participation';
export * from './campaign-safety-validation';
export * from './video-core';
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
