import { ApplicationError } from '@bunshin/shared';

export interface ServiceCreditExpirationRepository {
  expire(input: { now: Date; limit: number }): Promise<number>;
}

export class ExpireServiceCredits {
  constructor(
    private readonly repository: ServiceCreditExpirationRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: { limit?: number; now?: Date } = {}) {
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expiry limit');
    return this.repository.expire({ now: input.now ?? this.now(), limit });
  }
}
