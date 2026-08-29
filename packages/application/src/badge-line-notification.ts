import { ApplicationError } from '@bunshin/shared';
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
