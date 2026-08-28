import { ApplicationError } from '@bunshin/shared';
import type { JobEnvironment } from './index';
import {
  evaluateLineQuota,
  type LineDeliveryConfigurationPort,
  type LineDeliveryPreferencePort,
  type LineProviderFailure,
  type LineRecipientResolverPort,
} from './line-messaging-core';

export type VideoCompletionNotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface VideoRenderCompletionContext {
  renderId: string;
  workspaceId: string;
  groupId: string;
  bunshinId: string;
  ownerUserId: string;
  videoProjectId: string;
  projectTitle: string;
  notificationStatus: VideoCompletionNotificationStatus;
  notificationAttemptCount: number;
}

export interface VideoRenderCompletionRepository {
  finalize(input: {
    environment: JobEnvironment;
    workspaceId: string;
    renderId: string;
    localDate: string;
    completedAt: Date;
  }): Promise<VideoRenderCompletionContext | null>;
  recordNotification(input: {
    renderId: string;
    status: Exclude<VideoCompletionNotificationStatus, 'PENDING'>;
    errorCode: string | null;
    attemptedAt: Date;
  }): Promise<boolean>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FinalizeVideoRenderCompletion {
  constructor(private readonly repository: VideoRenderCompletionRepository) {}

  async execute(input: Parameters<VideoRenderCompletionRepository['finalize']>[0]) {
    if (
      !uuid.test(input.workspaceId) ||
      !uuid.test(input.renderId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.localDate) ||
      Number.isNaN(input.completedAt.getTime())
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video completion');
    const value = await this.repository.finalize(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'completed video unavailable');
    return value;
  }
}

export class RecordVideoCompletionNotification {
  constructor(private readonly repository: VideoRenderCompletionRepository) {}

  async execute(input: Parameters<VideoRenderCompletionRepository['recordNotification']>[0]) {
    if (
      !uuid.test(input.renderId) ||
      (input.status === 'SENT' && input.errorCode !== null) ||
      Number.isNaN(input.attemptedAt.getTime())
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video completion notification');
    const changed = await this.repository.recordNotification(input);
    if (!changed) throw new ApplicationError('CONFLICT', 'video notification state conflict');
  }
}

export interface VideoCompletionMessagingPort {
  getQuota(
    accessToken: string,
  ): Promise<{ ok: true; limit: number | null; consumption: number } | LineProviderFailure>;
  pushVideoCompletion(input: {
    accessToken: string;
    recipientId: string;
    projectTitle: string;
    reviewUrl: string;
  }): Promise<{ ok: true } | LineProviderFailure>;
}

export class SendVideoCompletionNotification {
  constructor(
    private readonly repository: VideoRenderCompletionRepository,
    private readonly configuration: LineDeliveryConfigurationPort,
    private readonly recipient: LineRecipientResolverPort,
    private readonly preference: LineDeliveryPreferencePort,
    private readonly messaging: VideoCompletionMessagingPort,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: {
    context: VideoRenderCompletionContext;
    environment: JobEnvironment;
    reviewUrl: string;
  }): Promise<{ sent: boolean; retryable: boolean; errorCode: string | null }> {
    if (input.context.notificationStatus === 'SENT')
      return { sent: true, retryable: false, errorCode: null };
    if (input.context.notificationStatus === 'CANCELLED')
      return { sent: false, retryable: false, errorCode: null };
    const record = async (status: 'SENT' | 'FAILED' | 'CANCELLED', errorCode: string | null) =>
      new RecordVideoCompletionNotification(this.repository).execute({
        renderId: input.context.renderId,
        status,
        errorCode,
        attemptedAt: this.now(),
      });
    const configuration = await this.configuration.getActive(input.environment, {
      workspaceId: input.context.workspaceId,
      groupId: input.context.groupId,
      userId: input.context.ownerUserId,
    });
    if (!configuration || configuration.environment !== input.environment) {
      await record('FAILED', 'CONFIGURATION_UNAVAILABLE');
      return { sent: false, retryable: true, errorCode: 'CONFIGURATION_UNAVAILABLE' };
    }
    if (configuration.globallyPaused) {
      await record('CANCELLED', 'GLOBALLY_PAUSED');
      return { sent: false, retryable: false, errorCode: 'GLOBALLY_PAUSED' };
    }
    if (
      !(await this.preference.isAllowed({
        workspaceId: input.context.workspaceId,
        bunshinId: input.context.bunshinId,
        userId: input.context.ownerUserId,
        at: this.now(),
      }))
    ) {
      await record('CANCELLED', 'NOTIFICATION_SUPPRESSED');
      return { sent: false, retryable: false, errorCode: 'NOTIFICATION_SUPPRESSED' };
    }
    const recipientId = await this.recipient.resolve({
      environment: input.environment,
      workspaceId: input.context.workspaceId,
      groupId: input.context.groupId,
      bunshinId: input.context.bunshinId,
      userId: input.context.ownerUserId,
    });
    if (!recipientId) {
      await record('CANCELLED', 'RECIPIENT_UNAVAILABLE');
      return { sent: false, retryable: false, errorCode: 'RECIPIENT_UNAVAILABLE' };
    }
    const quota = await this.messaging.getQuota(configuration.accessToken);
    if (!quota.ok) {
      await record('FAILED', quota.category);
      return { sent: false, retryable: quota.retryable, errorCode: quota.category };
    }
    const policy = evaluateLineQuota({
      kind: 'DAILY_MISSION',
      limit: quota.limit,
      consumption: quota.consumption,
      warningPercent: configuration.quotaWarningPercent,
      lowPriorityStopPercent: configuration.quotaLowPriorityStop,
    });
    if (!policy.allowed) {
      await record('CANCELLED', policy.category ?? 'QUOTA_EXHAUSTED');
      return {
        sent: false,
        retryable: false,
        errorCode: policy.category ?? 'QUOTA_EXHAUSTED',
      };
    }
    const result = await this.messaging.pushVideoCompletion({
      accessToken: configuration.accessToken,
      recipientId,
      projectTitle: input.context.projectTitle,
      reviewUrl: input.reviewUrl,
    });
    if (!result.ok) {
      await record('FAILED', result.category);
      return { sent: false, retryable: result.retryable, errorCode: result.category };
    }
    await record('SENT', null);
    return { sent: true, retryable: false, errorCode: null };
  }
}
