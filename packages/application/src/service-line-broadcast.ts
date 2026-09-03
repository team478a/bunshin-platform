import { ApplicationError } from '@bunshin/shared';

export const SERVICE_LINE_BROADCAST_AUDIENCES = ['ACTIVE_PARTICIPANTS'] as const;
export type ServiceLineBroadcastAudience = (typeof SERVICE_LINE_BROADCAST_AUDIENCES)[number];

export type ServiceLineBroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';

export interface ServiceLineBroadcastRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  title: string;
  message: string;
  audience: ServiceLineBroadcastAudience;
  status: ServiceLineBroadcastStatus;
  scheduledAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceLineBroadcastRepository {
  create(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    title: string;
    message: string;
    audience: ServiceLineBroadcastAudience;
    reason: string;
  }): Promise<ServiceLineBroadcastRecord | null>;
  schedule(input: {
    workspaceId: string;
    groupId: string;
    broadcastId: string;
    actorUserId: string;
    scheduledAt: Date;
    reason: string;
  }): Promise<ServiceLineBroadcastRecord | null>;
  cancel(input: {
    workspaceId: string;
    groupId: string;
    broadcastId: string;
    actorUserId: string;
    reason: string;
    cancelledAt: Date;
  }): Promise<ServiceLineBroadcastRecord | null>;
}

const required = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class ServiceLineBroadcastService {
  constructor(
    private readonly repository: ServiceLineBroadcastRepository,
    private readonly now = () => new Date(),
  ) {}

  async create(input: Parameters<ServiceLineBroadcastRepository['create']>[0]) {
    if (!SERVICE_LINE_BROADCAST_AUDIENCES.includes(input.audience))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid broadcast audience');
    const value = await this.repository.create({
      ...input,
      title: required(input.title, 'title', 120),
      message: required(input.message, 'message', 5_000),
      reason: required(input.reason, 'reason', 1_000),
    });
    if (!value) throw new ApplicationError('FORBIDDEN', 'service broadcast creation denied');
    return value;
  }

  async schedule(
    input: Omit<Parameters<ServiceLineBroadcastRepository['schedule']>[0], 'reason'> & {
      reason: string;
    },
  ) {
    if (Number.isNaN(input.scheduledAt.getTime()) || input.scheduledAt <= this.now())
      throw new ApplicationError('VALIDATION_ERROR', 'invalid broadcast schedule');
    const value = await this.repository.schedule({
      ...input,
      reason: required(input.reason, 'reason', 1_000),
    });
    if (!value) throw new ApplicationError('CONFLICT', 'service broadcast cannot be scheduled');
    return value;
  }

  async cancel(
    input: Omit<
      Parameters<ServiceLineBroadcastRepository['cancel']>[0],
      'reason' | 'cancelledAt'
    > & { reason: string },
  ) {
    const value = await this.repository.cancel({
      ...input,
      reason: required(input.reason, 'reason', 1_000),
      cancelledAt: this.now(),
    });
    if (!value) throw new ApplicationError('CONFLICT', 'service broadcast cannot be cancelled');
    return value;
  }
}
