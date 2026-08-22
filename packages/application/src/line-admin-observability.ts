import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export interface LineAdminMetrics {
  environment: LineConfigurationEnvironment;
  connections: { active: number; following: number; notificationReady: number };
  deliveries: {
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    cancelled: number;
  };
  jobs: { retryScheduled: number; dead: number };
  failures: Array<{ category: string; count: number }>;
  configuration: {
    active: boolean;
    verified: boolean;
    globallyPaused: boolean;
    quotaWarningPercent: number | null;
    quotaLowPriorityStop: number | null;
  };
}

export interface LineAdminMetricsRepository {
  get(
    actorUserId: string,
    environment: LineConfigurationEnvironment,
  ): Promise<LineAdminMetrics | null>;
}

export class GetLineAdminMetrics {
  constructor(private readonly repository: LineAdminMetricsRepository) {}
  async execute(actorUserId: string, environment: LineConfigurationEnvironment) {
    const value = await this.repository.get(actorUserId, environment);
    if (!value) throw new ApplicationError('NOT_FOUND', 'LINE administration not found');
    return value;
  }
}
