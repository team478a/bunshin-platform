import { ApplicationError } from '@bunshin/shared';

export interface ServiceCreditAdjustmentRepository {
  adjust(input: {
    workspaceId: string;
    groupId: string;
    membershipId: string;
    actorUserId: string;
    amount: number;
    reason: string;
    idempotencyKey: string;
    now: Date;
  }): Promise<{ availableCredits: number } | null>;
}

export class AdjustServiceCredits {
  constructor(
    private readonly repository: ServiceCreditAdjustmentRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(input: Omit<Parameters<ServiceCreditAdjustmentRepository['adjust']>[0], 'now'>) {
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount === 0 ||
      Math.abs(input.amount) > 100_000
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid credit amount');
    if (!input.reason.trim() || input.reason.trim().length > 1_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid adjustment reason');
    const idempotencyKey = input.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid idempotency key');
    const value = await this.repository.adjust({
      ...input,
      idempotencyKey,
      reason: input.reason.trim(),
      now: this.now(),
    });
    if (!value) throw new ApplicationError('FORBIDDEN', 'credit adjustment is not allowed');
    return value;
  }
}
