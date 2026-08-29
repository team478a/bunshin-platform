import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export type LineMessageKind = 'DAILY_MISSION' | 'REMINDER';
export type LineMessageDeliveryStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type LineMessageAttemptStatus = 'SUCCESS' | 'FAILED';
export type LineMessagingErrorCategory =
  | 'CONFIGURATION_UNAVAILABLE'
  | 'ENVIRONMENT_MISMATCH'
  | 'GLOBALLY_PAUSED'
  | 'NOTIFICATION_SUPPRESSED'
  | 'QUOTA_LOW_PRIORITY_STOP'
  | 'QUOTA_EXHAUSTED'
  | 'RECIPIENT_UNAVAILABLE'
  | 'MISSION_UNAVAILABLE'
  | 'INVALID_RECIPIENT'
  | 'BLOCKED'
  | 'CREDENTIAL_INVALID'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE';

export interface LineMessageDelivery {
  id: string;
  environment: LineConfigurationEnvironment;
  workspaceId: string;
  groupId: string | null;
  bunshinId: string;
  userId: string;
  dailyMissionId: string;
  kind: LineMessageKind;
  status: LineMessageDeliveryStatus;
  idempotencyKey: string;
  scheduledAt: Date;
  sentAt: Date | null;
  cancelledAt: Date | null;
  lastErrorCategory: string | null;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineMessageDeliveryRepository {
  getScoped(input: {
    deliveryId: string;
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
  }): Promise<LineMessageDelivery | null>;
  prepare(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
    kind: LineMessageKind;
    idempotencyKey: string;
    scheduledAt: Date;
  }): Promise<LineMessageDelivery | null>;
  claim(input: {
    deliveryId: string;
    environment: LineConfigurationEnvironment;
    actorUserId: string;
    leaseOwner: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<{ delivery: LineMessageDelivery; attemptNumber: number } | null>;
  recordAttempt(input: {
    deliveryId: string;
    environment: LineConfigurationEnvironment;
    leaseOwner: string;
    attemptNumber: number;
    status: LineMessageAttemptStatus;
    errorCategory: string | null;
    latencyMs: number;
    attemptedAt: Date;
  }): Promise<void>;
  releaseClaim(input: {
    deliveryId: string;
    environment: LineConfigurationEnvironment;
    leaseOwner: string;
    status: 'FAILED' | 'CANCELLED';
    errorCategory: LineMessagingErrorCategory;
    now: Date;
  }): Promise<boolean>;
}

export class GetLineMissionDelivery {
  constructor(private readonly repository: LineMessageDeliveryRepository) {}
  async execute(input: Parameters<LineMessageDeliveryRepository['getScoped']>[0]) {
    const value = await this.repository.getScoped(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'Mission delivery not found');
    return value;
  }
}

export class PrepareLineMissionDelivery {
  constructor(private readonly repository: LineMessageDeliveryRepository) {}
  async execute(
    input: Parameters<LineMessageDeliveryRepository['prepare']>[0],
  ): Promise<LineMessageDelivery> {
    if (input.idempotencyKey.length < 1 || input.idempotencyKey.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery idempotency key');
    if (Number.isNaN(input.scheduledAt.getTime()))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery schedule');
    const value = await this.repository.prepare(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'Mission delivery scope not found');
    return value;
  }
}

export interface LineDeliveryConfiguration {
  environment: LineConfigurationEnvironment;
  accessToken: string;
  globallyPaused: boolean;
  quotaWarningPercent: number;
  quotaLowPriorityStop: number;
}

export interface LineDeliveryConfigurationPort {
  getActive(
    environment: LineConfigurationEnvironment,
    scope?: { workspaceId: string; groupId: string | null; userId: string },
  ): Promise<LineDeliveryConfiguration | null>;
}

export interface LineRecipientResolverPort {
  resolve(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    groupId?: string | null;
    bunshinId?: string;
    userId: string;
  }): Promise<string | null>;
}

export interface LineDeliveryPreferencePort {
  isAllowed(input: {
    workspaceId: string;
    bunshinId: string;
    userId: string;
    at: Date;
  }): Promise<boolean>;
}

export interface LineReturnReminderRepository {
  shouldUse(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    localDate: string;
    dormancyDays: number;
    cooldownDays: number;
  }): Promise<boolean>;
}

export const LINE_MISSION_PLATFORMS = [
  'INSTAGRAM',
  'TIKTOK',
  'X',
  'THREADS',
  'YOUTUBE_SHORTS',
  'OTHER',
] as const;
export type LineMissionPlatform = (typeof LINE_MISSION_PLATFORMS)[number];
export const LINE_MISSION_FORMATS = [
  'TEXT',
  'SLIDE',
  'LIVE_ACTION',
  'AI_VIDEO_PROMPT',
  'IMAGE',
] as const;
export type LineMissionFormat = (typeof LINE_MISSION_FORMATS)[number];

export interface LineMissionNotificationSummary {
  platform: LineMissionPlatform;
  format: LineMissionFormat;
  estimatedMinutes: number;
  topic: string;
  researched: boolean;
  campaign?: { name: string; classification: 'PRODUCT_RELATED' | 'ADVERTISEMENT' } | null;
  externalLinkIncluded?: boolean;
}

export interface LineMissionNotificationSummaryRepository {
  resolve(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
  }): Promise<LineMissionNotificationSummary | null>;
}

export function normalizeLineMissionNotificationSummary(
  input: LineMissionNotificationSummary,
): LineMissionNotificationSummary {
  if (!LINE_MISSION_PLATFORMS.includes(input.platform))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission platform');
  if (!LINE_MISSION_FORMATS.includes(input.format))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission format');
  if (
    !Number.isInteger(input.estimatedMinutes) ||
    input.estimatedMinutes < 1 ||
    input.estimatedMinutes > 120
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission estimated minutes');
  const topic = [...input.topic]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!topic) throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission topic');
  if (typeof input.researched !== 'boolean')
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission research marker');
  if (input.externalLinkIncluded !== undefined && typeof input.externalLinkIncluded !== 'boolean')
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission external link marker');
  const campaign = input.campaign
    ? {
        name: input.campaign.name.replace(/\s+/g, ' ').trim().slice(0, 60),
        classification: input.campaign.classification,
      }
    : null;
  if (
    campaign &&
    (!campaign.name || !['PRODUCT_RELATED', 'ADVERTISEMENT'].includes(campaign.classification))
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission campaign');
  return {
    ...input,
    topic: topic.slice(0, 60),
    ...(input.campaign === undefined ? {} : { campaign }),
  };
}

export type LineProviderFailure = {
  ok: false;
  category: Exclude<
    LineMessagingErrorCategory,
    | 'CONFIGURATION_UNAVAILABLE'
    | 'ENVIRONMENT_MISMATCH'
    | 'GLOBALLY_PAUSED'
    | 'NOTIFICATION_SUPPRESSED'
    | 'QUOTA_LOW_PRIORITY_STOP'
    | 'QUOTA_EXHAUSTED'
    | 'RECIPIENT_UNAVAILABLE'
    | 'MISSION_UNAVAILABLE'
  >;
  retryable: boolean;
};

export interface LineMessagingProviderPort {
  getQuota(
    accessToken: string,
  ): Promise<{ ok: true; limit: number | null; consumption: number } | LineProviderFailure>;
  pushMissionNotification(input: {
    accessToken: string;
    recipientId: string;
    deepLinkUrl: string;
    summary: LineMissionNotificationSummary;
    kind: LineMessageKind;
  }): Promise<{ ok: true } | LineProviderFailure>;
  pushBadgeNotification?(input: {
    accessToken: string;
    recipientId: string;
    badgeUrl: string;
    title: string;
    description: string;
  }): Promise<{ ok: true } | LineProviderFailure>;
}

export type LineDeliveryExecutionResult =
  | { status: 'SENT'; warning: boolean }
  | {
      status: 'FAILED' | 'CANCELLED' | 'BUSY';
      category: LineMessagingErrorCategory | null;
      retryable: boolean;
    };

export function evaluateLineQuota(input: {
  kind: LineMessageKind;
  limit: number | null;
  consumption: number;
  warningPercent: number;
  lowPriorityStopPercent: number;
}): { allowed: boolean; warning: boolean; category: LineMessagingErrorCategory | null } {
  if (
    !Number.isInteger(input.consumption) ||
    input.consumption < 0 ||
    input.warningPercent < 1 ||
    input.warningPercent >= input.lowPriorityStopPercent ||
    input.lowPriorityStopPercent > 100 ||
    (input.limit !== null && (!Number.isInteger(input.limit) || input.limit < 1))
  )
    throw new ApplicationError('INTERNAL_ERROR', 'invalid LINE quota response');
  if (input.limit === null) return { allowed: true, warning: false, category: null };
  const percent = (input.consumption / input.limit) * 100;
  if (percent >= 100) return { allowed: false, warning: true, category: 'QUOTA_EXHAUSTED' };
  if (input.kind === 'REMINDER' && percent >= input.lowPriorityStopPercent)
    return { allowed: false, warning: true, category: 'QUOTA_LOW_PRIORITY_STOP' };
  return { allowed: true, warning: percent >= input.warningPercent, category: null };
}

export class ExecuteLineMissionDelivery {
  constructor(
    private readonly repository: LineMessageDeliveryRepository,
    private readonly configuration: LineDeliveryConfigurationPort,
    private readonly recipientResolver: LineRecipientResolverPort,
    private readonly summaryRepository: LineMissionNotificationSummaryRepository,
    private readonly preference: LineDeliveryPreferencePort,
    private readonly provider: LineMessagingProviderPort,
    private readonly now = () => new Date(),
    private readonly leaseMilliseconds = 30_000,
  ) {}

  async execute(input: {
    deliveryId: string;
    environment: LineConfigurationEnvironment;
    actorUserId: string;
    workerId: string;
    deepLinkUrl: string | (() => Promise<string>);
  }): Promise<LineDeliveryExecutionResult> {
    if (!input.deliveryId.trim() || !input.actorUserId.trim())
      throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE delivery scope');
    if (!input.workerId.trim() || input.workerId.length > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE delivery worker');
    if (this.leaseMilliseconds < 5_000 || this.leaseMilliseconds > 60_000)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid LINE delivery lease');
    if (typeof input.deepLinkUrl === 'string')
      this.validateDeepLink(input.deepLinkUrl, input.environment);
    const now = this.now();
    const claim = await this.repository.claim({
      deliveryId: input.deliveryId,
      environment: input.environment,
      actorUserId: input.actorUserId,
      leaseOwner: input.workerId,
      now,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMilliseconds),
    });
    if (!claim) return { status: 'BUSY', category: null, retryable: true };

    const failWithoutProvider = async (
      status: 'FAILED' | 'CANCELLED',
      category: LineMessagingErrorCategory,
      retryable: boolean,
    ): Promise<LineDeliveryExecutionResult> => {
      const released = await this.repository.releaseClaim({
        deliveryId: claim.delivery.id,
        environment: input.environment,
        leaseOwner: input.workerId,
        status,
        errorCategory: category,
        now: this.now(),
      });
      if (!released) throw new ApplicationError('CONFLICT', 'LINE delivery lease lost');
      return { status, category, retryable };
    };

    const configuration = await this.configuration.getActive(input.environment, {
      workspaceId: claim.delivery.workspaceId,
      groupId: claim.delivery.groupId,
      userId: claim.delivery.userId,
    });
    if (!configuration) return failWithoutProvider('FAILED', 'CONFIGURATION_UNAVAILABLE', true);
    if (configuration.environment !== input.environment)
      return failWithoutProvider('FAILED', 'ENVIRONMENT_MISMATCH', false);
    if (configuration.globallyPaused)
      return failWithoutProvider('CANCELLED', 'GLOBALLY_PAUSED', false);
    if (
      !(await this.preference.isAllowed({
        workspaceId: claim.delivery.workspaceId,
        bunshinId: claim.delivery.bunshinId,
        userId: input.actorUserId,
        at: now,
      }))
    )
      return failWithoutProvider('CANCELLED', 'NOTIFICATION_SUPPRESSED', false);

    const recipientId = await this.recipientResolver.resolve({
      environment: input.environment,
      workspaceId: claim.delivery.workspaceId,
      groupId: claim.delivery.groupId,
      bunshinId: claim.delivery.bunshinId,
      userId: input.actorUserId,
    });
    if (!recipientId) return failWithoutProvider('FAILED', 'RECIPIENT_UNAVAILABLE', false);

    const quota = await this.safeProviderCall(() =>
      this.provider.getQuota(configuration.accessToken),
    );
    if (!quota.ok) return this.recordProviderFailure(claim, input, quota, now);
    const policy = evaluateLineQuota({
      kind: claim.delivery.kind,
      limit: quota.limit,
      consumption: quota.consumption,
      warningPercent: configuration.quotaWarningPercent,
      lowPriorityStopPercent: configuration.quotaLowPriorityStop,
    });
    if (!policy.allowed)
      return failWithoutProvider('CANCELLED', policy.category ?? 'QUOTA_EXHAUSTED', false);

    let deepLinkUrl: string;
    let summary: LineMissionNotificationSummary;
    try {
      const resolvedSummary = await this.summaryRepository.resolve({
        workspaceId: claim.delivery.workspaceId,
        bunshinId: claim.delivery.bunshinId,
        actorUserId: input.actorUserId,
        dailyMissionId: claim.delivery.dailyMissionId,
      });
      if (!resolvedSummary) return failWithoutProvider('FAILED', 'MISSION_UNAVAILABLE', false);
      summary = normalizeLineMissionNotificationSummary(resolvedSummary);
      deepLinkUrl =
        typeof input.deepLinkUrl === 'string' ? input.deepLinkUrl : await input.deepLinkUrl();
      this.validateDeepLink(deepLinkUrl, input.environment);
    } catch {
      return failWithoutProvider('FAILED', 'CONFIGURATION_UNAVAILABLE', true);
    }
    const result = await this.safeProviderCall(() =>
      this.provider.pushMissionNotification({
        accessToken: configuration.accessToken,
        recipientId,
        deepLinkUrl,
        summary,
        kind: claim.delivery.kind,
      }),
    );
    if (!result.ok) return this.recordProviderFailure(claim, input, result, now);
    const completedAt = this.now();
    await this.repository.recordAttempt({
      deliveryId: claim.delivery.id,
      environment: input.environment,
      leaseOwner: input.workerId,
      attemptNumber: claim.attemptNumber,
      status: 'SUCCESS',
      errorCategory: null,
      latencyMs: Math.max(0, completedAt.getTime() - now.getTime()),
      attemptedAt: completedAt,
    });
    return { status: 'SENT', warning: policy.warning };
  }

  private async safeProviderCall<T extends { ok: boolean }>(
    work: () => Promise<T>,
  ): Promise<T | LineProviderFailure> {
    try {
      return await work();
    } catch {
      return { ok: false, category: 'PROVIDER_UNAVAILABLE', retryable: true };
    }
  }

  private async recordProviderFailure(
    claim: { delivery: LineMessageDelivery; attemptNumber: number },
    input: { environment: LineConfigurationEnvironment; workerId: string },
    failure: LineProviderFailure,
    startedAt: Date,
  ): Promise<LineDeliveryExecutionResult> {
    const attemptedAt = this.now();
    await this.repository.recordAttempt({
      deliveryId: claim.delivery.id,
      environment: input.environment,
      leaseOwner: input.workerId,
      attemptNumber: claim.attemptNumber,
      status: 'FAILED',
      errorCategory: failure.category,
      latencyMs: Math.max(0, attemptedAt.getTime() - startedAt.getTime()),
      attemptedAt,
    });
    return { status: 'FAILED', category: failure.category, retryable: failure.retryable };
  }

  private validateDeepLink(value: string, environment: LineConfigurationEnvironment): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Mission deep link URL');
    }
    const developmentLocal =
      environment === 'DEVELOPMENT' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !developmentLocal)
      throw new ApplicationError('VALIDATION_ERROR', 'Mission deep link requires HTTPS');
    if (url.username || url.password || url.hash || value.length > 2_048)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Mission deep link URL');
  }
}

export interface MissionDeepLinkState {
  id: string;
  environment: LineConfigurationEnvironment;
  workspaceId: string;
  bunshinId: string;
  userId: string;
  dailyMissionId: string;
  keyVersion: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface MissionDeepLinkClaims {
  stateId: string;
  environment: LineConfigurationEnvironment;
  keyVersion: number;
  expiresAtEpochSeconds: number;
}

export interface MissionDeepLinkSignerPort {
  sign(claims: MissionDeepLinkClaims): Promise<string>;
  verify(token: string): Promise<MissionDeepLinkClaims>;
}

export interface MissionDeepLinkStateRepository {
  create(input: {
    id: string;
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
    keyVersion: number;
    expiresAt: Date;
  }): Promise<MissionDeepLinkState | null>;
  consume(input: {
    id: string;
    environment: LineConfigurationEnvironment;
    actorUserId: string;
    keyVersion: number;
    expiresAt: Date;
    now: Date;
  }): Promise<MissionDeepLinkState | null>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class IssueMissionDeepLinkState {
  constructor(
    private readonly repository: MissionDeepLinkStateRepository,
    private readonly signer: MissionDeepLinkSignerPort,
    private readonly now = () => new Date(),
    private readonly ttlMilliseconds = 10 * 60_000,
  ) {}

  async execute(input: {
    stateId: string;
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
    keyVersion: number;
  }) {
    if (!uuid.test(input.stateId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid deep link state id');
    if (!Number.isInteger(input.keyVersion) || input.keyVersion < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid deep link key version');
    if (this.ttlMilliseconds < 60_000 || this.ttlMilliseconds > 15 * 60_000)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid deep link state ttl');
    const expiresAt = new Date(
      Math.floor((this.now().getTime() + this.ttlMilliseconds) / 1_000) * 1_000,
    );
    const { stateId: id, ...scope } = input;
    const state = await this.repository.create({ ...scope, id, expiresAt });
    if (!state) throw new ApplicationError('NOT_FOUND', 'Mission deep link scope not found');
    const token = await this.signer.sign({
      stateId: state.id,
      environment: state.environment,
      keyVersion: state.keyVersion,
      expiresAtEpochSeconds: Math.floor(state.expiresAt.getTime() / 1_000),
    });
    return { token, expiresAt: state.expiresAt };
  }
}

export class ConsumeMissionDeepLinkState {
  constructor(
    private readonly repository: MissionDeepLinkStateRepository,
    private readonly signer: MissionDeepLinkSignerPort,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: {
    token: string;
    environment: LineConfigurationEnvironment;
    actorUserId: string;
  }) {
    const claims = await this.signer.verify(input.token);
    const now = this.now();
    if (!uuid.test(claims.stateId) || claims.environment !== input.environment)
      throw new ApplicationError('FORBIDDEN', 'invalid Mission deep link state');
    if (claims.expiresAtEpochSeconds * 1_000 < now.getTime())
      throw new ApplicationError('FORBIDDEN', 'Mission deep link state expired');
    const state = await this.repository.consume({
      id: claims.stateId,
      environment: input.environment,
      actorUserId: input.actorUserId,
      keyVersion: claims.keyVersion,
      expiresAt: new Date(claims.expiresAtEpochSeconds * 1_000),
      now,
    });
    if (!state) throw new ApplicationError('FORBIDDEN', 'Mission deep link state is not usable');
    return state;
  }
}
