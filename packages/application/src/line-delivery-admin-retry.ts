import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export const LINE_ADMIN_RETRYABLE_FAILURES = [
  'CONFIGURATION_UNAVAILABLE',
  'RATE_LIMITED',
  'TIMEOUT',
  'PROVIDER_UNAVAILABLE',
] as const;

export interface LineDeliveryRetryRequest {
  id: string;
  environment: LineConfigurationEnvironment;
  deliveryId: string;
  deliveryAttemptCount: number;
  reason: string;
  jobId: string;
  createdAt: Date;
}

export interface LineDeliveryRetryRepository {
  request(input: {
    requestId: string;
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    deliveryId: string;
    reason: string;
  }): Promise<LineDeliveryRetryRequest | null>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RequestLineDeliveryRetry {
  constructor(private readonly repository: LineDeliveryRetryRepository) {}

  async execute(input: {
    requestId: string;
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    deliveryId: string;
    reason: string;
  }) {
    const reason = input.reason.trim();
    if (!uuidPattern.test(input.requestId) || !uuidPattern.test(input.deliveryId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE delivery retry request');
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'retry reason must be 3 to 500 characters');
    const value = await this.repository.request({ ...input, reason });
    if (!value) throw new ApplicationError('NOT_FOUND', 'retryable LINE delivery not found');
    return value;
  }
}
