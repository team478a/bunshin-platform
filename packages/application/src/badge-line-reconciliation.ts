import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export interface BadgeLineReconciliationSnapshot {
  environment: LineConfigurationEnvironment;
  checkedAt: Date;
  missingDeliveries: number;
  pendingWithoutJob: number;
  deadDeliveries: number;
  pendingWhileGloballyPaused: number;
  pendingInDisabledGroups: number;
  healthy: boolean;
}

export interface BadgeLineReconciliationRepository {
  inspect(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    now: Date;
  }): Promise<BadgeLineReconciliationSnapshot | null>;
}

export class InspectBadgeLineReconciliation {
  constructor(private readonly repository: BadgeLineReconciliationRepository) {}

  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    now?: Date;
  }) {
    const value = await this.repository.inspect({ ...input, now: input.now ?? new Date() });
    if (!value) throw new ApplicationError('NOT_FOUND', 'badge LINE operations not found');
    return value;
  }
}
