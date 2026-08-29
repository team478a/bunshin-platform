import { ApplicationError } from '@bunshin/shared';
import type {
  LineDeliveryConfigurationPort,
  LineMessagingProviderPort,
  LineRecipientResolverPort,
  LineProviderFailure,
} from './line-messaging-core';
import { evaluateLineQuota } from './line-messaging-core';
export type BadgeLineNotificationEnvironment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';

export const BADGE_LINE_NOTIFICATION_FEATURE_KEY = 'BADGE.LINE_NOTIFICATION' as const;

export interface BadgeLineNotificationPreparationRepository {
  prepare(input: {
    environment: BadgeLineNotificationEnvironment;
    now: Date;
    limit: number;
  }): Promise<{ scanned: number; prepared: number; skipped: number }>;
}

export class PrepareBadgeLineNotifications {
  constructor(private readonly repository: BadgeLineNotificationPreparationRepository) {}

  async execute(input: {
    environment: BadgeLineNotificationEnvironment;
    now?: Date;
    limit?: number;
  }) {
    const limit = input.limit ?? 30;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge notification batch size');
    return this.repository.prepare({
      environment: input.environment,
      now: input.now ?? new Date(),
      limit,
    });
  }
}

export interface BadgeLineDelivery {
  id: string;
  environment: BadgeLineNotificationEnvironment;
  workspaceId: string;
  groupId: string;
  userId: string;
  title: string;
  description: string;
  attemptCount: number;
}

export interface BadgeLineDeliveryRepository {
  claim(input: {
    deliveryId: string;
    environment: BadgeLineNotificationEnvironment;
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<BadgeLineDelivery | null>;
  finish(input: {
    deliveryId: string;
    environment: BadgeLineNotificationEnvironment;
    workerId: string;
    status: 'SENT' | 'FAILED' | 'CANCELLED' | 'DEAD';
    errorCategory: string | null;
    at: Date;
  }): Promise<boolean>;
  isAllowed(input: {
    environment: BadgeLineNotificationEnvironment;
    workspaceId: string;
    groupId: string;
    userId: string;
    at: Date;
  }): Promise<boolean>;
}

export type BadgeLineDeliveryExecutionResult =
  | { status: 'SENT'; warning: boolean }
  | {
      status: 'FAILED' | 'CANCELLED' | 'DEAD' | 'BUSY';
      category: string | null;
      retryable: boolean;
    };

export class ExecuteBadgeLineDelivery {
  constructor(
    private readonly repository: BadgeLineDeliveryRepository,
    private readonly configuration: LineDeliveryConfigurationPort,
    private readonly recipients: LineRecipientResolverPort,
    private readonly provider: LineMessagingProviderPort,
    private readonly now = () => new Date(),
    private readonly maxAttempts = 3,
  ) {}

  async execute(input: {
    deliveryId: string;
    environment: BadgeLineNotificationEnvironment;
    workerId: string;
    badgeUrl: string;
  }): Promise<BadgeLineDeliveryExecutionResult> {
    if (!input.deliveryId.trim() || !input.workerId.trim() || input.workerId.length > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge LINE delivery scope');
    this.validateUrl(input.badgeUrl, input.environment);
    const startedAt = this.now();
    const delivery = await this.repository.claim({
      deliveryId: input.deliveryId,
      environment: input.environment,
      workerId: input.workerId,
      now: startedAt,
      leaseExpiresAt: new Date(startedAt.getTime() + 30_000),
    });
    if (!delivery) return { status: 'BUSY', category: null, retryable: true };

    const finish = async (
      status: 'SENT' | 'FAILED' | 'CANCELLED' | 'DEAD',
      category: string | null,
      retryable: boolean,
      warning = false,
    ): Promise<BadgeLineDeliveryExecutionResult> => {
      const saved = await this.repository.finish({
        deliveryId: delivery.id,
        environment: input.environment,
        workerId: input.workerId,
        status,
        errorCategory: category,
        at: this.now(),
      });
      if (!saved) throw new ApplicationError('CONFLICT', 'badge LINE delivery lease lost');
      return status === 'SENT' ? { status, warning } : { status, category, retryable };
    };

    if (
      !(await this.repository.isAllowed({
        environment: input.environment,
        workspaceId: delivery.workspaceId,
        groupId: delivery.groupId,
        userId: delivery.userId,
        at: startedAt,
      }))
    )
      return finish('CANCELLED', 'NOTIFICATION_SUPPRESSED', false);
    const configuration = await this.configuration.getActive(input.environment, delivery);
    if (!configuration) return finish('FAILED', 'CONFIGURATION_UNAVAILABLE', true);
    if (configuration.environment !== input.environment)
      return finish('CANCELLED', 'ENVIRONMENT_MISMATCH', false);
    if (configuration.globallyPaused) return finish('CANCELLED', 'GLOBALLY_PAUSED', false);
    const recipientId = await this.recipients.resolve({
      environment: input.environment,
      workspaceId: delivery.workspaceId,
      groupId: delivery.groupId,
      userId: delivery.userId,
    });
    if (!recipientId) return finish('CANCELLED', 'RECIPIENT_UNAVAILABLE', false);
    const quota = await this.safeCall(() => this.provider.getQuota(configuration.accessToken));
    if (!quota.ok) return this.providerFailure(delivery, quota, finish);
    const quotaPolicy = evaluateLineQuota({
      kind: 'DAILY_MISSION',
      limit: quota.limit,
      consumption: quota.consumption,
      warningPercent: configuration.quotaWarningPercent,
      lowPriorityStopPercent: configuration.quotaLowPriorityStop,
    });
    if (!quotaPolicy.allowed)
      return finish('CANCELLED', quotaPolicy.category ?? 'QUOTA_EXHAUSTED', false);
    if (!this.provider.pushBadgeNotification)
      return finish('FAILED', 'CONFIGURATION_UNAVAILABLE', false);
    const pushBadgeNotification = this.provider.pushBadgeNotification.bind(this.provider);
    const sent = await this.safeCall(() =>
      pushBadgeNotification({
        accessToken: configuration.accessToken,
        recipientId,
        badgeUrl: input.badgeUrl,
        title: delivery.title,
        description: delivery.description,
      }),
    );
    if (!sent.ok) return this.providerFailure(delivery, sent, finish);
    return finish('SENT', null, false, quotaPolicy.warning);
  }

  private async providerFailure(
    delivery: BadgeLineDelivery,
    failure: LineProviderFailure,
    finish: (
      status: 'SENT' | 'FAILED' | 'CANCELLED' | 'DEAD',
      category: string | null,
      retryable: boolean,
      warning?: boolean,
    ) => Promise<BadgeLineDeliveryExecutionResult>,
  ) {
    const exhausted = failure.retryable && delivery.attemptCount >= this.maxAttempts;
    return finish(exhausted ? 'DEAD' : 'FAILED', failure.category, failure.retryable && !exhausted);
  }

  private async safeCall<T extends { ok: boolean }>(work: () => Promise<T>) {
    try {
      return await work();
    } catch {
      return {
        ok: false,
        category: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      } as LineProviderFailure;
    }
  }

  private validateUrl(value: string, environment: BadgeLineNotificationEnvironment) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge URL');
    }
    const local =
      environment === 'DEVELOPMENT' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.hash)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge URL');
  }
}
