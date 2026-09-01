import { ApplicationError } from '@bunshin/shared';

export type ServiceCreditConsumptionResult =
  | { status: 'NOT_CONFIGURED' }
  | { status: 'INSUFFICIENT' }
  | { status: 'CONSUMED'; availableCredits: number };

export interface ServiceCreditConsumptionRepository {
  consumeForSocialImage(input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    userId: string;
    imageRequestId: string;
    idempotencyKey: string;
    now: Date;
  }): Promise<ServiceCreditConsumptionResult>;
  refundSocialImage(input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    userId: string;
    imageRequestId: string;
    idempotencyKey: string;
    now: Date;
  }): Promise<void>;
}

const uuid = (value: string, field: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};

const key = (value: string) => {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 200)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid idempotencyKey');
  return normalized;
};

/**
 * Uses a service-scoped credit only when an account has been created for the
 * membership. Services without the credit program continue to use their
 * existing point or badge entitlement flow.
 */
export class ConsumeServiceCreditForSocialImage {
  constructor(
    private readonly repository: ServiceCreditConsumptionRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(
    input: Omit<Parameters<ServiceCreditConsumptionRepository['consumeForSocialImage']>[0], 'now'>,
  ) {
    return this.repository.consumeForSocialImage({
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      groupMembershipId: uuid(input.groupMembershipId, 'groupMembershipId'),
      userId: uuid(input.userId, 'userId'),
      imageRequestId: uuid(input.imageRequestId, 'imageRequestId'),
      idempotencyKey: key(input.idempotencyKey),
      now: this.now(),
    });
  }
}

export class RefundServiceCreditForSocialImage {
  constructor(
    private readonly repository: ServiceCreditConsumptionRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(
    input: Omit<Parameters<ServiceCreditConsumptionRepository['refundSocialImage']>[0], 'now'>,
  ) {
    return this.repository.refundSocialImage({
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      groupMembershipId: uuid(input.groupMembershipId, 'groupMembershipId'),
      userId: uuid(input.userId, 'userId'),
      imageRequestId: uuid(input.imageRequestId, 'imageRequestId'),
      idempotencyKey: key(input.idempotencyKey),
      now: this.now(),
    });
  }
}
