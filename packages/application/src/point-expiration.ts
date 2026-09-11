import { ApplicationError } from '@bunshin/shared';

export interface PointExpirationResult {
  expiredGrants: number;
  expiredPoints: number;
}

export interface PointExpirationRepository {
  expireAvailableGrants(input: { now: Date; limit: number }): Promise<PointExpirationResult>;
}

export class ExpireAvailablePointGrants {
  constructor(private readonly repository: PointExpirationRepository) {}

  execute(input: { now?: Date; limit?: number } = {}) {
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid point expiration limit');
    return this.repository.expireAvailableGrants({ now: input.now ?? new Date(), limit });
  }
}
