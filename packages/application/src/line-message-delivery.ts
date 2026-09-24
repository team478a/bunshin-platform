import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';
import {
  normalizeLineMissionNotificationSummary,
  type LineMissionNotificationSummary,
  type LineMissionNotificationSummaryRepository,
} from './line-mission-notification';

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

export interface LineMissionImage {
  originalContentUrl: string;
  previewImageUrl: string;
}

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
    image?: LineMissionImage;
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
    image?: LineMissionImage | (() => Promise<LineMissionImage | null>);
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
    let image: LineMissionImage | undefined;
    try {
      const resolvedImage =
        typeof input.image === 'function' ? await input.image() : (input.image ?? null);
      if (resolvedImage) {
        this.validateImageUrl(resolvedImage.originalContentUrl);
        this.validateImageUrl(resolvedImage.previewImageUrl);
        image = resolvedImage;
      }
    } catch {
      image = undefined;
    }
    const result = await this.safeProviderCall(() =>
      this.provider.pushMissionNotification({
        accessToken: configuration.accessToken,
        recipientId,
        deepLinkUrl,
        summary,
        kind: claim.delivery.kind,
        ...(image ? { image } : {}),
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

  private validateImageUrl(value: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE image URL');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      value.length > 2_048
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE image URL');
  }
}
