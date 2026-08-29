import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export interface BadgeLineDeliveryRetryRepository {
  request(input: {
    requestId: string;
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    deliveryId: string;
    reason: string;
  }): Promise<{ id: string; deliveryId: string; jobId: string; createdAt: Date } | null>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RequestBadgeLineDeliveryRetry {
  constructor(private readonly repository: BadgeLineDeliveryRetryRepository) {}

  async execute(input: {
    requestId: string;
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    deliveryId: string;
    reason: string;
  }) {
    const reason = input.reason.trim();
    if (!uuidPattern.test(input.requestId) || !uuidPattern.test(input.deliveryId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge LINE retry request');
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'retry reason must be 3 to 500 characters');
    const value = await this.repository.request({ ...input, reason });
    if (!value) throw new ApplicationError('NOT_FOUND', 'retryable badge LINE delivery not found');
    return value;
  }
}
